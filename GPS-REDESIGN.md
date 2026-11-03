# Organized GPS update

Includes all previous project updates, including November launch safety, database backup/check tools, directory/account deletion, historical hours, photo evidence and admin approvals.

The old GPS attendance screen has been replaced by a single organized flow:
1. Enable location explicitly.
2. See the event boundary, live device marker, distance and accuracy.
3. Confirm check-in/check-out only when the current reading meets server rules.

Denied permission, poor accuracy and outside-event states provide retry guidance. Map controls have large touch targets. Technical coordinates/privacy details are collapsible. Tracking stops on screen close. Unnecessary map animations have been removed, including an animation/unmount error found during testing.

GPS remains device-reported evidence. Existing server checks, immutable original GPS/times, geotag photo uploads, admin approval and ledger accounting remain unchanged. A missing street-map tile does not bypass GPS checks.

## Apply
This ZIP contains the complete source, not only a patch. Keep your existing private .env.local and database configuration. Do not upload credentials to GitHub.

If the previous November launch-safety patch is already applied, replace only:
- app/gps-map.tsx
- app/globals.css

If that patch is not applied, also copy:
- app/seva-app.tsx
- lib/photos.ts
- package.json
- scripts/backup-database.mjs
- scripts/check-database.mjs
- scripts/restore-backup.py
- scripts/test.mjs
- tests/operations.cjs
- tests/photo-finalization.cjs
- LAUNCH-UPDATE.md

From your project folder: npm ci, npm test, npm run typecheck, npm run build. Then commit and push the intended changed files. No new database migration or reset is required. This chat has not deployed the change.

## Validation
Automated suites, TypeScript and production build passed. Isolated browser tests used simulated GPS: denied permission, outside radius and poor accuracy blocked confirmation; valid GPS enabled and completed the confirmation callback. Widths 360/390/768/1024/1440 had no horizontal overflow. The map tile failure fallback was tested with network requests intentionally blocked. This is not a real-device GPS test or live private-photo/storage test.
