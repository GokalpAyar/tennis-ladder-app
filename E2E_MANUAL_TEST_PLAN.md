# E2E Manual Test Plan

## Test Accounts Needed

- Admin account with `profiles.role = admin`
- Player A email/password
- Player B email/password

Use a clean browser profile or private windows when switching between users.

## 1. Player A Signup

Steps:
1. Open `/signup`.
2. Enter Player A full name, email, and password.
3. Submit the form.

Expected result:
- Player A account is created.
- Player A profile has `role = player` and `status = pending`.
- Player A is not added to `ladder_rankings`.
- Dashboard shows pending approval guidance.

## 2. Player B Signup

Steps:
1. Log out or use a private window.
2. Open `/signup`.
3. Enter Player B full name, email, and password.
4. Submit the form.

Expected result:
- Player B account is created.
- Player B profile has `role = player` and `status = pending`.
- Player B is not added to `ladder_rankings`.
- Dashboard shows pending approval guidance.

## 3. Admin Approval

Steps:
1. Open `/admin-login`.
2. Log in as admin.
3. Go to Admin Control Center.
4. Open the Pending tab.
5. Approve Player A and assign a rank.
6. Approve Player B and assign a rank.

Expected result:
- Both players have `profiles.status = approved`.
- Both players have rows in `ladder_rankings`.
- Assigned `rank_position` values are saved.
- No duplicate-rank error appears.

## 4. Challenge

Setup:
- Player A should be ranked lower than Player B, within 3 spots.

Steps:
1. Log in as Player A.
2. Open Dashboard.
3. Find Player B in Eligible Players.
4. Click Challenge.

Expected result:
- A pending match is created.
- Player A sees a waiting state.
- Player A cannot send another challenge while this match is active.

## 5. Accept

Steps:
1. Log in as Player B.
2. Open Activities or Dashboard match area.
3. Find the received challenge from Player A.
4. Click Accept.

Expected result:
- Match status changes to `accepted`.
- Both players can now propose match times.
- Neither player can start another active match.

## 6. Propose 3 Times

Steps:
1. Log in as Player A.
2. Open the accepted match.
3. Choose three future dates/time slots.
4. Use only available 90-minute slots.
5. Submit proposals.

Expected result:
- Up to 3 proposed times are saved.
- Duplicate proposed slots are blocked.
- Slots are exactly 1 hour 30 minutes.
- Slots are between 8:00 AM and 8:00 PM.
- Match status becomes `time_proposed`.

## 7. Select Time

Steps:
1. Log in as Player B.
2. Open the match with proposed times.
3. Select one proposed time.
4. Confirm the selection.

Expected result:
- Match status becomes `scheduled`.
- Selected start/end time is displayed clearly.
- Message appears: “Please call the tennis office to reserve the court.”
- Court contact info is visible.

## 8. Cancel

Steps:
1. With a pending, accepted, or time proposed match, click Cancel Match.
2. Enter an optional reason if shown.
3. Confirm cancellation.

Expected result:
- Match status becomes `canceled`.
- `canceled_at` is set.
- `canceled_by` is the current user.
- `cancel_reason` is saved if provided.
- Match disappears from active/scheduled sections.

Scheduled cancellation check:
1. Schedule a new match.
2. Verify the scheduled match does not show Cancel Match.
3. Click Request Cancellation.
4. Enter a short reason and confirm.
5. Log in as the other player.
6. Review the cancellation request.
7. Click either Accept Cancellation or Keep Match Scheduled.

Expected result:
- Requesting cancellation sets `status = cancellation_requested`.
- `cancellation_requested_by`, `cancellation_reason`, and `cancellation_requested_at` are saved.
- Other player sees the requester name and reason.
- Accept Cancellation sets `status = canceled`, `canceled_by` to the original requester, and `canceled_at`.
- Keep Match Scheduled returns `status = scheduled` and clears cancellation request fields.

## 9. Reschedule

Setup:
- Create and schedule another match.

Steps:
1. Open the scheduled match.
2. Click Request New Times.
3. Confirm or proceed into new-time flow.
4. Verify previous proposed times remain visible until new times are submitted.
5. Click Back to Proposed Times.
6. Re-enter Request New Times.
7. Submit replacement time proposals.

Expected result:
- User can return to previous proposed times before submitting.
- Old proposals are not erased until replacement proposals are submitted.
- New proposals replace old proposals after confirmation.
- Either player can request/propose new times.

## 10. Submit Winner

Setup:
- Match must be scheduled.

Steps:
1. Open the scheduled match.
2. Click Submit Winner.
3. Select the winner card.
4. Confirm “Complete match and update ladder?”

Expected result:
- `matches.winner_id` is saved.
- `matches.score` remains null or empty.
- `matches.status = completed`.
- `matches.stats_recorded = true`.
- `matches.ranking_updated = true`.
- Completed match shows `Winner: [Player Name]`.

## 11. Ranking Swap

Setup:
- Lower-ranked challenger beats higher-ranked opponent.
- Example: Rank 10 challenges Rank 9 and Rank 10 wins.

Steps:
1. Schedule the match.
2. Submit winner as the lower-ranked challenger.
3. Refresh Ladder page.

Expected result:
- Winner and loser swap `rank_position`.
- Winner moves to the opponent’s previous higher rank.
- Loser moves to the challenger’s previous lower rank.
- Wins/losses update once only.

Control test:
1. Higher-ranked player wins a scheduled match.

Expected result:
- No rank swap occurs.
- Wins/losses still update once.

## 12. Forgot Password

Steps:
1. Open `/login`.
2. Click forgot password link.
3. Enter account email.
4. Submit reset request.

Expected result:
- Supabase sends a reset email.
- Reset redirect points to `/reset-password`.

## 13. Reset Password

Steps:
1. Open the Supabase reset email link.
2. Verify the app opens `/reset-password`.
3. Enter new password and confirm password.
4. Submit.
5. Return to login and log in with the new password.

Expected result:
- Password validates at 6+ characters.
- Password mismatch is blocked.
- Password updates successfully.
- User can log in with the new password.

## 14. Account Edit

Steps:
1. Log in as an approved player.
2. Open `/account`.
3. Edit full name.
4. Save profile.
5. Update password with matching valid passwords.

Expected result:
- Email is visible but not editable.
- Full name updates in `profiles.full_name`.
- Missing profile row is created automatically if needed.
- Password updates through Supabase Auth.
- Success/error messages are clear.

## 15. Mobile Dashboard

Steps:
1. Open Dashboard on a phone viewport.
2. Review My Ranking.
3. Review Eligible Players.
4. Review active match notice if one exists.

Expected result:
- Layout stacks cleanly.
- Cards are readable.
- Buttons are tappable.
- No horizontal page overflow.
- Background image does not hurt readability.

## 16. Mobile Pyramid Centering

Steps:
1. Open Ladder page on a phone viewport.
2. Switch to Pyramid View if List View is default.
3. Wait for the pyramid to load.
4. Tap Find My Rank.
5. Try manual horizontal scrolling and zoom controls.

Expected result:
- Pyramid is visible without needing to hunt off-screen.
- Initial horizontal scroll is centered or near the logged-in player.
- Find My Rank scrolls smoothly to the user’s position.
- Manual scroll and zoom still work.
- Cards remain readable.
