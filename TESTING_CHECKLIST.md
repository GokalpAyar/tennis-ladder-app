# Testing Checklist

Use this checklist to manually verify the Roton Point Tennis Tournament Ladder app before release.

## Signup

**Account needed:** New email address not already registered.

**Steps:**
1. Open the signup page.
2. Enter full name, email, and password.
3. Submit the form.

**Expected result:**
- Account is created.
- User lands on the dashboard.
- User sees the pending approval welcome guide.
- User is not added to `ladder_rankings`.

## Login

**Account needed:** Approved player account.

**Steps:**
1. Open the login page.
2. Enter email and password.
3. Submit the form.

**Expected result:**
- User is redirected to the dashboard.
- Dashboard shows ranking, eligible players, match activity, and scheduled matches.

## Pending Approval

**Account needed:** Pending player account.

**Steps:**
1. Log in as a pending player.
2. Open the dashboard.
3. Try to access the ladder page.

**Expected result:**
- Dashboard shows “Welcome to the Roton Point Tennis Tournament Ladder”.
- User sees approval steps and ladder guidance.
- User cannot challenge players.

## Admin Approval

**Account needed:** Admin account and pending player account.

**Steps:**
1. Log in at `/admin-login` as admin.
2. Open Admin Control Center.
3. Go to Pending Players.
4. Assign a rank.
5. Approve the pending player.

**Expected result:**
- Player status becomes approved.
- A `ladder_rankings` row is created.
- Player appears in the ladder at the assigned rank.

## Challenge Player

**Account needed:** Approved ranked player with no active match.

**Steps:**
1. Log in as a ranked player.
2. Open Dashboard.
3. Find Eligible Players to Challenge.
4. Click Challenge on an eligible player.

**Expected result:**
- A pending match is created.
- Challenge button becomes unavailable for that pair.
- User sees success feedback.

## Accept Or Decline Challenge

**Account needed:** Opponent account with a pending received challenge.

**Steps:**
1. Log in as the opponent.
2. Open Match Activity.
3. Click Accept.
4. Repeat with another pending challenge and click Decline.

**Expected result:**
- Accepted challenge changes to accepted/time scheduling flow.
- Declined challenge is no longer active.
- One active match rule is respected.

## Propose Match Times

**Account needed:** Player in an accepted match.

**Steps:**
1. Open Match Activity.
2. Click Propose Time.
3. Select up to 3 dates and available 90-minute slots.
4. Submit proposed times.

**Expected result:**
- Match status becomes time proposed.
- Proposed slots are visible.
- Duplicate slots and past dates are blocked.

## Request New Times

**Account needed:** Player in a scheduled or time proposed match.

**Steps:**
1. Open the match card.
2. Click Request New Times.
3. Verify old proposed times still show.
4. Click Back to Proposed Times.
5. Request new times again and submit replacement options.

**Expected result:**
- Old proposed times are not erased until new times are submitted.
- User can cancel the new-times flow.
- Replacing times asks for confirmation.

## Confirm Scheduled Time

**Account needed:** Opponent viewing proposed match times.

**Steps:**
1. Log in as the player who did not propose the times.
2. Open Match Activity.
3. Select one proposed time.
4. Confirm the selected slot.

**Expected result:**
- Match status becomes scheduled.
- Final scheduled time is highlighted.
- Court reservation message and contact info are shown.

## Cancel Match

**Account needed:** Player in pending, accepted, time proposed, or scheduled match.

**Steps:**
1. Open the active or scheduled match card.
2. Click Cancel Match.
3. Confirm cancellation.
4. Optionally enter a cancel reason.

**Expected result:**
- Match status becomes canceled.
- `cancel_reason`, `canceled_at`, and `canceled_by` are saved.
- Match disappears from active and scheduled sections.

## Submit Winner

**Account needed:** Player in a scheduled match.

**Steps:**
1. Open Scheduled Matches.
2. Choose the winner card.
3. Submit winner.
4. Confirm completion.

**Expected result:**
- Match status becomes completed.
- `winner_id` is saved.
- Score remains empty/null.
- Completed match shows winner name.

## Wins And Losses Update

**Account needed:** Completed match from Submit Winner test.

**Steps:**
1. Submit winner for a scheduled match.
2. Check both players on Dashboard, Ladder, and Admin.

**Expected result:**
- Winner gets +1 win in `ladder_rankings.wins`.
- Loser gets +1 loss in `ladder_rankings.losses`.
- `matches.stats_recorded` becomes true.
- Re-submitting or editing does not double count.

## Ranking Swap

**Account needed:** Lower-ranked challenger scheduled against higher-ranked opponent.

**Steps:**
1. Complete match with lower-ranked challenger as winner.
2. Check Ladder page and Admin rankings.
3. Repeat with higher-ranked player as winner in another match.

**Expected result:**
- If lower-ranked challenger wins, both players swap `rank_position`.
- If higher-ranked player wins, ranks stay the same.
- `matches.ranking_updated` becomes true.

## Notifications

**Account needed:** Two player accounts and admin account.

**Steps:**
1. Trigger important events: challenge, accept, decline, propose time, schedule, cancel, submit winner, admin approval.
2. Check whether the app currently displays in-app notifications or another notification mechanism.

**Expected result:**
- If notifications are enabled, the correct user receives clear updates.
- If notifications are not enabled, confirm there is no broken UI or console error.

## Forgot Password

**Account needed:** Existing user account.

**Steps:**
1. Open login page.
2. Click Forgot password.
3. Enter account email.
4. Send reset email.

**Expected result:**
- User sees password reset email sent message.
- Supabase email links to `/reset-password`.

## Reset Password

**Account needed:** Existing user with reset email.

**Steps:**
1. Open reset email link.
2. Confirm app opens `/reset-password`.
3. Enter new password and matching confirmation.
4. Submit.
5. Return to login and log in with new password.

**Expected result:**
- Password mismatch is blocked.
- Password shorter than 6 characters is blocked.
- Valid password calls `supabase.auth.updateUser`.
- User sees “Password updated successfully. You can now log in.”

## Mobile Dashboard

**Account needed:** Approved ranked player account.

**Steps:**
1. Open app on phone-size viewport.
2. Log in.
3. Review dashboard sections from top to bottom.
4. Open How It Works guide.

**Expected result:**
- Sections are easy to read and not crowded.
- Buttons are tappable.
- My Ranking, Eligible Players, Match Activity, and Scheduled Matches flow naturally.
- No horizontal page scrolling.

## Mobile Ladder And Pyramid View

**Account needed:** Approved ranked player account.

**Steps:**
1. Open Ladder page on phone-size viewport.
2. Confirm List View is default.
3. Switch to Pyramid View.
4. Use horizontal scrolling/swiping and zoom controls.

**Expected result:**
- List View scrolls smoothly.
- Pyramid View is readable and scrollable.
- Logged-in user is highlighted.
- Empty spots through rank 50 are visible.
