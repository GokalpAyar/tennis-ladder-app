# QA Report - Roton Point Tennis Tournament Ladder

Date: 2026-05-21

## Verification Scope

Reviewed the React routes, auth flow, Supabase client usage, challenge/match flow code, admin panel code, and SQL schema files.

Build/browser verification was not completed because this environment does not have `npm` installed:

```bash
npm run build
# /bin/bash: line 1: npm: command not found
```

## Summary

The core player flow is mostly wired: signup/login, pending approval, eligible challenges, accepting/declining, proposing times, scheduling, canceling, and submitting a winner all have UI paths and Supabase calls.

The highest-risk issues are in database/security and admin operations:

- Users may be able to update protected `profiles` fields because self-update RLS is too broad.
- Admin rank changes and approvals can fail when `rank_position` is unique.
- Applying `challenge-schema.sql` after `admin-schema.sql` can remove admin policies.
- Existing database constraints may conflict with the temporary `rank_position = -1` ranking swap.

## Issues Found

### 1. Self-profile RLS allows users to change protected profile fields

Severity: Critical

Area: Auth / Supabase security

Evidence:

- `supabase/challenge-schema.sql`
- `supabase/admin-schema.sql`

Both schemas include:

```sql
create policy "Users can update their profile"
on public.profiles
for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);
```

This policy does not restrict which columns can be updated. A malicious client could potentially update their own `role` to `admin` or `status` to `approved`.

Suggested fix:

- Do not allow broad profile self-updates.
- Use a dedicated RPC for user profile edits, or column-level privileges so users can only update `full_name`.
- Keep `role` and `status` admin-only.

### 2. Admin rank changes can fail with duplicate `rank_position`

Severity: High

Area: Admin approval / ladder ranking editing

Evidence:

- `src/pages/AdminPage.tsx`
- `approvePlayer()`
- `updatePlayerManagementRow()`

Admin approval inserts a requested `rank_position` directly:

```ts
supabase.from('ladder_rankings').insert({
  player_id: profileId,
  rank_position: rankPosition,
  wins: 0,
  losses: 0,
});
```

Admin rank editing directly updates one row:

```ts
supabase.from('ladder_rankings').update({ rank_position: draft.rank_position })
```

If `rank_position` is unique and the target rank is already occupied, the update/insert will fail.

Suggested fix:

- Create an admin RPC that changes ranks in one transaction.
- For approval, either require an open rank or shift existing players down.
- For rank edits, use a temporary rank or reorder affected players safely.
- Surface duplicate-rank errors with a friendly message.

### 3. Ranking swap uses temporary `rank_position = -1`

Severity: High

Area: Submit winner / ranking update

Evidence:

- `supabase/challenge-schema.sql`
- `supabase/admin-schema.sql`
- `record_completed_match_stats()`

The trigger swaps ranks using:

```sql
update public.ladder_rankings
set rank_position = -1
where player_id = new.challenger_id;
```

This solves a unique constraint collision, but it will fail if the existing database has a check constraint like `rank_position > 0`.

Suggested fix:

- Confirm whether `ladder_rankings.rank_position` has a positive-only check.
- Prefer a transaction-safe RPC or trigger that uses a guaranteed allowed temporary value.
- Another option is to make the unique constraint deferrable and perform both updates in one transaction.

### 4. Schema application order can break admin access

Severity: High

Area: Supabase schema / RLS

Evidence:

- `challenge-schema.sql` drops and recreates match/profile policies without admin policies.
- `admin-schema.sql` adds admin policies.

If `challenge-schema.sql` is applied after `admin-schema.sql`, admin read/update policies can be removed.

Suggested fix:

- Merge admin and challenge policies into one canonical schema/migration.
- Make `challenge-schema.sql` preserve admin policies, or document strict migration order.
- Prefer timestamped migrations instead of multiple overlapping schema files.

### 5. `disputed` status exists in TypeScript but not database constraints

Severity: Medium

Area: Match status consistency

Evidence:

- `src/features/challenges/ChallengePlayerSystem.tsx` includes `disputed` in `MatchStatus`.
- `challenge-schema.sql` and `admin-schema.sql` status checks do not include `disputed`.

The UI can label `disputed`, but the database rejects it.

Suggested fix:

- Either add `disputed` to `matches_status_check`, admin filters, and admin dropdowns, or remove it from TypeScript/UI status handling.

### 6. Admin can set match status to `completed` without a winner

Severity: Medium

Area: Admin matches

Evidence:

- `src/pages/AdminPage.tsx`
- `updateMatchStatus()`

The admin status dropdown includes `completed`, but it only updates `status`. The database trigger requires `winner_id` when status becomes `completed`.

Expected result:

- Supabase will reject the update with `Completed matches must have a winner.`

Suggested fix:

- Remove `completed` from admin status dropdown unless a winner is selected.
- Add an admin winner selection flow for completing matches.

### 7. Admin reset season still uses a status `.in()` filter

Severity: Medium

Area: Admin settings / reset season

Evidence:

- `src/pages/AdminPage.tsx`
- `resetSeason()`

```ts
.in('status', ['pending', 'accepted', 'time_proposed', 'scheduled'])
```

This is not the same canceled-match bug that was fixed for player cancel, but it is still worth testing. If Supabase/PostgREST status filtering is sensitive to the enum/check setup or malformed values, reset season may fail.

Suggested fix:

- If this fails in production, replace it with a database RPC for season reset.
- At minimum, log full Supabase error details here too.

### 8. Signup may redirect to dashboard before a session exists

Severity: Medium

Area: Signup / pending approval flow

Evidence:

- `src/pages/SignUpPage.tsx`

After `supabase.auth.signUp()`, the app always runs:

```ts
navigate('/dashboard', { replace: true });
```

If Supabase email confirmation is enabled, `signUp` may not create an active session. The protected dashboard route will redirect to `/login`, so the user may not see the pending approval guide immediately.

Suggested fix:

- If `data.session` is missing, show a clear “Check your email” confirmation message instead of navigating to dashboard.
- If `data.session` exists, navigate to dashboard.

### 9. Auth provider treats profile load errors as approved player

Severity: Medium

Area: Auth / pending approval

Evidence:

- `src/app/AuthProvider.tsx`

On profile load timeout/error, `loadProfile()` returns:

```ts
return { role: 'player', status: 'approved' };
```

This can briefly show approved-user UI if profile loading fails. `ChallengePlayerSystem` performs its own profile check later, but the page-level pending/approved UI can be misleading.

Suggested fix:

- On profile load error, use `status: 'pending'` or expose a profile error/loading state.
- Avoid granting approved UI on failed profile lookup.

### 10. Admin approval can partially fail

Severity: Medium

Area: Admin approval

Evidence:

- `src/pages/AdminPage.tsx`
- `approvePlayer()`

Approval inserts into `ladder_rankings` first, then updates `profiles.status`. If the status update fails, the code attempts to delete the ladder row. That cleanup can also fail.

Suggested fix:

- Move approval into a security-definer RPC that inserts ranking and updates profile in one transaction.

### 11. Admin “Add to Ladder” bypasses explicit rank assignment

Severity: Low

Area: Admin player management

Evidence:

- `addPlayerToLadder()`

Approved unranked players are added to `highest rank + 1`, with no review step. This is fine for bottom placement, but inconsistent with pending approval where admin assigns a rank.

Suggested fix:

- Add an optional rank input for approved unranked players, or label the action clearly as “Add to Bottom.”

### 12. Time overlap client check cannot see opponent-only matches under RLS

Severity: Low / Medium

Area: Time proposal / scheduling

Evidence:

- `hasScheduledOverlap()` queries scheduled matches for both players.
- Player RLS only allows users to read matches where they are challenger or opponent.

The client-side overlap check may not see the opponent’s other scheduled matches. The database trigger should still block overlaps, so this is mostly a UX issue: the user may only see the error after attempting to confirm.

Suggested fix:

- Keep the database trigger.
- Optionally add a security-definer RPC to check overlap for both players and return the friendly message.

### 13. Admin page is separate from `AppLayout`

Severity: Low

Area: Navigation / layout

Evidence:

- `src/pages/AdminPage.tsx` renders its own `<main>` and does not use `AppLayout`.

This may be intentional because the admin interface should feel separate. It also means the normal navbar/footer are not present on `/admin`.

Suggested fix:

- No change required if intentional.
- If admin should have global branding/navigation, wrap it in a separate admin layout.

### 14. Mobile pyramid still uses nested scrolling by design

Severity: Low

Area: Mobile layout

Evidence:

- `PyramidLadder` uses a `70svh` scroll container with horizontal and vertical scrolling.

This is required for the pyramid view, but nested scrolling can still feel awkward on phones. Recent code centers the pyramid on mobile and provides “Find My Rank,” which helps.

Suggested fix:

- Manually test on iPhone Safari and Android Chrome.
- Confirm the page itself does not trap vertical scroll when the user is trying to leave the pyramid area.

### 15. No automated route/build verification available in this environment

Severity: Low

Area: QA process

Evidence:

- `npm run build` failed because `npm` is not installed.

Suggested fix:

- Run locally or in CI:

```bash
npm install
npm run build
```

## Flow Checklist Review

### Signup

Status: Partially OK

Findings:

- Full name, email, and password are collected.
- Supabase signup includes `full_name` metadata.
- Profile creation depends on database trigger.
- Email-confirmation mode may redirect users to login instead of showing pending approval.

### Login

Status: OK

Findings:

- Player login uses Supabase email/password.
- Forgot password link uses `redirectTo: ${window.location.origin}/reset-password`.

### Forgot / Reset Password

Status: Mostly OK

Findings:

- `/reset-password` route is public and not redirected by `PublicRoute`.
- Reset page calls `supabase.auth.updateUser({ password: newPassword })`.
- Existing logged-in users can also use this page to update password because any session counts as valid. This is not necessarily broken, but it is broader than password-recovery-only behavior.

### Pending Approval

Status: Mostly OK

Findings:

- Pending users get a welcome/guide screen on dashboard.
- Pending users cannot challenge because `ChallengePlayerSystem` blocks non-approved profile status.
- Auth provider may show approved UI if profile load fails.

### Admin Approval

Status: Functional but risky

Findings:

- Pending players are visible.
- Admin can approve/reject.
- Approval can fail on duplicate rank.
- Approval should be transactional.

### Challenge Player

Status: Mostly OK

Findings:

- Uses `ladder_rankings.player_id` and `rank_position`.
- UI and database enforce up to 3 spots above.
- One active match rule is enforced in UI and database.

### Accept / Decline Challenge

Status: Mostly OK

Findings:

- Either challenge can be accepted/declined by the opponent.
- Accept checks other active matches.
- Database trigger also prevents active-match conflicts.

### Time Proposal

Status: Mostly OK

Findings:

- Either match player can propose times.
- Up to 3 slots are generated from fixed 90-minute court-hour slots.
- Duplicate proposals are rejected by the builder.
- Past dates are prevented by the input `min` and proposal builder should be manually verified.

### Scheduled Match

Status: Mostly OK

Findings:

- Opponent can choose one proposal.
- Match moves to `scheduled`.
- Scheduled end time is stored.
- Overlap protection exists in both UI and DB, but client-side check may be limited by RLS.

### Cancel Match

Status: OK

Findings:

- Cancel button appears for cancelable statuses.
- Update is by match ID only.
- `cancel_reason`, `canceled_at`, and `canceled_by` are populated.
- Full Supabase error details are displayed for player cancel.

### Submit Winner

Status: Mostly OK

Findings:

- Score entry has been removed.
- Winner selection updates `winner_id`, clears `score`, and sets `status = completed`.
- DB trigger handles wins/losses and rank movement.
- Potential issue if trigger cannot use temporary rank due existing constraints.

### Ranking Update

Status: Mostly OK with database caveat

Findings:

- Challenger beating higher-ranked opponent triggers rank swap.
- Higher-ranked player winning keeps ranking unchanged.
- Duplicate updates are prevented by `stats_recorded` and `ranking_updated`.
- Temporary `-1` rank may conflict with existing constraints.

### Admin Editing

Status: Needs hardening

Findings:

- Admin can edit names, roles, ranks, wins, losses, remove players, view/update matches.
- Rank editing can fail on uniqueness.
- Role editing can demote the active admin.
- Completed status can fail without winner.

### Routes

Status: OK

Reviewed routes:

- `/`
- `/login`
- `/admin-login`
- `/reset-password`
- `/signup`
- `/dashboard`
- `/account`
- `/activities`
- `/court-info`
- `/admin`
- `/ladder`
- `*`

No missing route components were found.

## Recommended Fix Order

1. Lock down `profiles` self-update RLS so users cannot update `role` or `status`.
2. Convert admin approval and rank editing to transaction-safe RPC functions.
3. Confirm `rank_position = -1` is allowed, or replace the ranking swap strategy.
4. Merge schema files or make policy creation order-safe.
5. Fix admin match completion UX so completed requires a winner.
6. Improve signup behavior when email confirmation is enabled.
7. Run `npm run build` and a browser/mobile smoke test in an environment with Node/npm.

