# SevaTrack launch update — 3 November 2026

## Confirmed source
Based on your GitHub main commit d9059eb (gps), which matches the latest Vercel production deployment. All October, GPS approval, map and directory features are already in that commit. No old update ZIPs need to be reapplied.

## New changes
- Finalized attendance no longer accepts new photo uploads. Backend checks apply to preparation, upload authorization and finalization. The student upload form is hidden on finalized records. An admin must reopen attendance first.
- Correction help now correctly distinguishes faculty time corrections from admin hour approval.
- `npm test` runs all Python database and JavaScript service tests, including new photo finalization, migration persistence, integrity-check and backup/restore tests.
- `npm run db:check` checks migrations/checksums, database/foreign-key integrity, administrator/settings existence and ledger balances. Read-only, reports no personal data, exits nonzero on failures.
- `npm run db:backup -- backups/snapshot.json` creates an exclusive, private logical database snapshot in a consistent read transaction. Does not reset or modify your database.
- `python scripts/restore-backup.py backups/snapshot.json backups/rehearsal.db` restores into a NEW LOCAL SQLite file and validates constraints/integrity. Existing files cannot be overwritten. Only restore trusted snapshots, since they include SQL schema definitions.

## Apply on Windows
1. Keep a copy of your current source. Copy the files in this patch into the matching project paths. It is based on commit d9059eb; compare any newer local edits first.
2. Open Command Prompt in the project directory. Use Node 22 as required by package.json. Python 3 must be installed and available as `python` for database tests and restore rehearsal.
3. Run `npm ci`, `npm test`, `npm run typecheck`, then `npm run build`.
4. Keep Turso credentials in a private `.env.local` file, not in source/chat. Load them explicitly for these commands:
   `node --env-file=.env.local scripts/check-database.mjs`
   `node --env-file=.env.local scripts/backup-database.mjs backups/before-launch.json`
5. Rehearse recovery: `python scripts/restore-backup.py backups/before-launch.json backups/rehearsal.db`. Keep snapshots encrypted in your own secure backup destination. They contain account/password hashes and personal records. The backups folder is ignored by Git.
6. Inspect `git diff`, then commit and push these changes. Vercel should continue using `npm run vercel-build`; never modify previously applied migration files. This update adds no migrations and requires no database reset.
7. Confirm the production build is ready, then test the workflow below. This patch has NOT been pushed/deployed by this chat.

## Deployment smoke test
Use authorized test accounts and a dedicated clearly named test event; avoid changing real students' hours for testing.
- Student login and register. Denied GPS and outside-radius readings must block check-in.
- On a phone at the event: map shows live marker/accuracy and boundary; verify check-in; upload a real photo; verify checkout. Hours stay at zero while pending.
- A different student must not view the attendance/photo URL. Signed-out requests must be denied too.
- Faculty review photo and adjust pending effective times with a reason. Originals remain unchanged; faculty cannot finalize credit.
- Admin approve photo, then attendance and hours. Student dashboard and history agree. Original times/GPS and who/when/why remain in audit.
- Approved attendance has no student upload form; direct upload requests are also rejected.
- Reopening must reverse credited hours, then permit new evidence; final approval adds only the correct net amount.
- Check mobile at 360/390px and desktop. Confirm real map tiles, camera/file picker, denied GPS messages and private Blob uploads.
- Retry queued account-deletion Blob cleanup, including the final sweep after 20 minutes, for any intentionally deleted test account.

## Boundaries still requiring production work
- The database backup contains photo references, NOT photo bytes. Preserve the private Blob objects separately; a database-only restore cannot recover deleted photos. No automatic backup schedule or Blob export is implemented here.
- No production database credentials were read or changed. Live migrations, ledger health, private Blob storage and previously reported login failures are not certified by local tests.
- Physical GPS/camera testing needs your device. Browser coordinates can be spoofed; GPS plus evidence and human review is supporting evidence, not absolute proof of presence.
- Current architecture remains one college per deployment/database. Use a separate project, database and private Blob store per college. Shared multi-college tenancy needs a separate schema/auth migration and cross-college isolation testing; it is NOT implemented by this patch.
- Full visual/accessibility/performance re-audit and hundreds-of-students browser workflow are not completed in this update.
- Audit-log clearing remains intentionally absent; immutable history is preserved.

## Verification in this chat
Existing automated suites passed, plus new finalized-proof and operational backup/restore tests. TypeScript and standard production Turbopack build passed. Migration repetition preserved existing records; checksum tampering was detected. Real production database/storage/device end-to-end approval was not exercised.
