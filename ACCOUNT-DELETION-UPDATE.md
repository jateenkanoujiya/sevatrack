# SevaTrack permanent account deletion update

Built from the two files you uploaded on 2 October 2026. Your working batch-delete code is preserved. This package has not been deployed and no real accounts have been deleted.

## Install

1. Back up your Turso production database before deploying this destructive feature.
2. Extract this ZIP. Copy its app, lib, database and tests folders into your existing SevaTrack repository, merging folders and replacing only the listed files. Keep your .git folder, configuration and environment variables.
3. The package changes/adds:
   - app/seva-app.tsx (replace)
   - app/api/[...path]/route.ts (replace)
   - lib/account-deletion.ts (new)
   - database/migrations/003_account_deletion.sql (new)
   - tests/account-deletion.py (new)
   - tests/account-deletion-service.cjs (new)
4. Do not edit or replace migrations 001 or 002. Migration 003 is automatically applied by your existing npm run vercel-build command. No new environment variables or dependencies are required.
5. In the project terminal run:

```powershell
npm install
npx tsc --noEmit
npm run build
python tests/account-deletion.py
node tests/account-deletion-service.cjs
git add app lib database tests ACCOUNT-DELETION-UPDATE.md
git commit -m "Add permanent account deletion with safeguards"
git push
```

Python is needed only to run the database tests. Check that Vercel uses npm run vercel-build, then wait for the production deployment to show Ready. A frontend deployed without the migration will not work.

## Use

Admin > Accounts > Manage the target account > Permanently delete account.
Review the live counts; enter the TARGET account email, YOUR administrator password, a reason, and the acknowledgement checkbox. Submit once. Password confirmation is limited to five attempts per 15 minutes.

Students, faculty and other admins may be deleted. You cannot delete yourself. The last active admin is protected. Managed events transfer to the deleting admin so registrations and other students' records survive.

Deletion removes the target's account row, attendance, hour ledger, adjustments, corrections, evidence metadata, notifications, sessions, recovery records and associated structured account/attendance/evidence audit records. Other students' hours and records remain unchanged. Historical actor references on retained records point to one non-login “Deleted account” system identity, not to the deleted personal account. That identity is excluded from account management.

## Photo cleanup — required final step

Database deletion is transactional; external Blob deletion cannot be part of that transaction.
After deletion, Accounts shows a pending photo-cleanup panel. Click Retry photo cleanup to remove the deleted account's private photo objects. Retry after at least 20 minutes for a final sweep of uploads whose short-lived tokens were issued before deletion. The queue remains until the prefix is empty and the grace period has passed. Large queues may need several clicks. Storage failures remain visible and retriable. Keep BLOB_READ_WRITE_TOKEN configured. Cleanup is admin-triggered, not a scheduled background job.

Photos are inaccessible through the app once the database evidence/account is removed. Physical deletion is not complete while the queue remains. Blob CDN removal may also take a short time. The queue stores only the random account-ID prefix and is removed after cleanup.

## Retained information and limits

A minimal deletion receipt, deleting administrator and reason remain in the audit trail. Avoid putting the deleted person's personal information into the reason. A generic non-login attribution row remains to preserve other people's records. References inside someone else's free-text remarks, event text, historical JSON snapshots, backups, previously exported CSV/PDF files or downloaded images are not exhaustively scrubbed. This is permanent removal of the account and its owned operational records, not a guarantee that every mention in every copy has disappeared.

There is no Undo. Restoring an old database backup can resurrect deleted records; manage backups and exports separately. Do not casually roll back the code after applying migration 003: the attribution identity and deletion queue require this version or compatible code.

## Verification performed

- 11 SQLite integration tests passed, using all actual migrations and foreign keys enabled: deletion, other-admin deletion, preservation of peer records/hours, atomic rollback, history guards, wrong confirmation, stale authorization and last-admin protection.
- 13 mocked service checks passed: role/password validation, confirmation, bounded Blob cleanup, grace period, failures, and prefix isolation.
- Existing 9 database integrity tests passed.
- TypeScript/TSX syntax transpilation passed. Full TypeScript/build verification in this workspace was blocked by missing @libsql/client and @vercel/blob dependencies; run the install/build commands above and check Vercel's build.
- Real Blob deletion and the browser confirmation flow have not been exercised against your production app. Test using a deliberately disposable account before using it on real records.
