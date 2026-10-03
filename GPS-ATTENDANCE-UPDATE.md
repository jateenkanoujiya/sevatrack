# Mandatory GPS → photo → admin approval

Apply this update AFTER the October update (migration 004). It replaces four application files and adds one database migration. No database reset is needed.

## Files to install

Replace these matching files in your existing project with the files in this ZIP:

- app/seva-app.tsx
- app/api/[...path]/route.ts
- lib/domain.ts
- lib/photos.ts

Add this new file:

- database/migrations/005_verified_attendance.sql

The included tests are development checks; copy them into tests/ if you maintain the test suite. Existing fixture updates now supply valid GPS and approved photo evidence before creating credited attendance.

Run `npx tsc --noEmit` and `npm run build`, then commit and push to your connected GitHub main branch. Keep Vercel's build command as `npm run vercel-build`; it applies migration 005 before the build. Existing migrations must remain unchanged. This archive is not already deployed.

## Student workflow

1. Register for the event.
2. At the event, choose Verify GPS & check in. The server checks a fresh GPS reading against the event geofence.
3. Submit a participation photo. The geotag-camera-app option remains available. Photo upload is blocked until an on-site check-in is recorded.
4. At the end, choose Verify GPS & check out. Location is checked again.
5. Once both check-out and photo submission are present, active admins receive a review notification. Attendance remains pending with zero credited hours.
6. Staff/admin review the image and its location information. The admin reviews original/effective times and GPS, approves the photo, then approves attendance and sets the NSS hours.
7. Only the final admin approval credits the attendance ledger and updates the student's progress.

Photos may be uploaded before or after check-out; the record cannot be finally approved without both. GPS verification alone never grants attendance or hours.

## GPS rules

- Location permission and GPS are required for both check-in and check-out.
- Readings older than two minutes or more than 30 seconds in the future are rejected.
- Accuracy must be positive and no worse than the smaller of 50 metres or half the event radius.
- The reported location plus its accuracy margin must fit within the event radius. Students near its edge may need to move farther inside.
- Denied/unavailable GPS, poor accuracy and outside-geofence readings produce actionable errors and do not mark check-in/out.
- Choose a realistic event centre and radius. GPS may be unreliable inside buildings.

Browser GPS is device-reported and can be spoofed; this is enforced location validation, not a claim of tamper-proof physical presence. Geotag image stamps and manually declared photo coordinates also need human review. They never replace the original attendance GPS.

## Review, hours and history

Faculty may review photos and adjust pending effective times with reasons. Only admins can grant final APPROVED/PARTIAL attendance and positive attendance hours. Faculty cannot modify an already approved attendance record through the review API. Admins handle those corrections.

Photo exceptions cannot bypass the gate. An admin must first reopen attendance as Pending review (reversing its credited hours) before rejecting a photo that supports approved attendance.

Manually adding a participant now enrols them as REGISTERED; it does not fabricate attendance. The student still needs GPS, a photo and check-out. Existing original times are retained, and captured original GPS cannot be overwritten.

Existing awarded hours are not recalculated or erased by migration. Older pending records without valid GPS or photo evidence cannot be newly approved using edited effective times alone. Do not replace original evidence to make such records pass. Historical pre-7-October balances remain governed by their separate, previously requested import/correction policy.

## Verification

GPS gate tests cover denied, stale, future, inaccurate, outside and boundary readings. Actual API-handler tests with a mocked database cover role authorization, photo/GPS prerequisites, blocked override attempts, faculty pending reviews, and credit only on admin approval. Production SQLite migration tests cover ledger gating, immutable GPS, evidence protection and transaction rollback. Existing integrity, historical hours and account deletion suites were updated to use valid verification fixtures.

A real-device GPS and private Blob upload/review smoke test is still required after deployment; these tests do not access your production database, camera or storage.
