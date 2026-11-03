# SevaTrack launch verification — November 2026

## Delivered in this update

- Retains organized student GPS, adaptive accuracy within the event boundary, the interactive admin event map, catalogs/deletion, historical hours and all previous updates.
- Domain-based college isolation for a single application deployment, using separate Turso databases and private Blob stores. API, login/session lookup, evidence reads/uploads/deletion, reports and mutations all resolve within request-local college context. Unknown domains and invalid/shared-store configuration fail closed when multi-college mode is enabled.
- Immutable original attendance times and GPS remain enforced. Effective-time edits retain actor, timestamp and mandatory reason in the audit/adjustment history.
- New additive migration 006 blocks concurrent reuse of password reset links and evidence inserts that finish after attendance is finalized. Existing migrations were not rewritten.
- Admin Settings → System health checks deployed schema checksums, foreign keys, ledger identity/balances, historical balances and failed photo cleanup jobs. These checks do not edit records.
- Full backup tooling includes every database table and all referenced private evidence photo bytes, with SHA-256 checksums. Incomplete backups never receive a completion manifest. Photo restore requires a different, empty private Blob store and verifies restored bytes.

## Evidence and limits

- `npm test`: existing regressions plus real SQL/API workflow, college concurrency, photo backup corruption and reset race tests.
- `tests/full-workflow.cjs`: 111 real-handler requests with real disposable SQLite databases, password hashing, session authentication, migrations and triggers. Includes student registration/GPS/photo/checkout, faculty time edits and photo review, admin approval/hours, audit/history, IDOR denial, catalog deletion, reports/exports, account persistence and deletion cleanup. GPS readings and the Blob provider are substituted; this is not a real-phone/live-storage test.
- `npm run build` and TypeScript verification.
- Local browser audit: real application login and role pages across 360, 390, 768, 1024 and 1440 pixels. 115 role/page/width checks passed, with no page overflow or uncaught errors; theme switching, System health and keyboard dialog dismissal passed. This does not establish every accessibility requirement.
- No production database reset, account deletion or synthetic attendance was performed.

## Live work still requiring access or a physical device

1. Real phone GPS permission, accuracy and check-in/out at an actual event.
2. Live private Blob upload, authorized viewing, denied viewing and final deletion sweep. Existing credentials are write-only in Vercel, and an authenticated live application session is still required.
3. Full production workflow and the historical login-failure investigation. Isolated tests demonstrate persistence, but do not establish why a particular live account previously failed.
4. Take a production backup and rehearse its restoration, including real photo bytes. Tooling is implemented; a production backup has not been taken by this update.
5. Provision a second college's own domain, database, private store and administrator, then enable configuration below. Current deployment remains its existing single college until those resources are connected.

## Multi-college setup

No existing college data is moved or reset. Keep `SEVATRACK_COLLEGES` unset for the current single-college installation.

For multiple colleges in ONE Vercel deployment:

1. Back up the existing database/photos first.
2. Provision a separate Turso database and a separate **private** Blob store for each additional college. Reuse the existing database/store for the existing college.
3. Add each college's exact domain to the same Vercel project and verify DNS. Choose distinct domains/subdomains; do not use a client-supplied college ID to select data.
4. Add private server environment variables for each database URL, database token and Blob read/write token. Never prefix these with `NEXT_PUBLIC_`.
5. Add `SEVATRACK_COLLEGES` as JSON; values are environment variable NAMES, not credentials:

```json
[
  {"id":"primary","hosts":["project-vr57r.vercel.app"],"databaseUrlEnv":"TURSO_DATABASE_URL","databaseTokenEnv":"TURSO_AUTH_TOKEN","blobTokenEnv":"BLOB_READ_WRITE_TOKEN"},
  {"id":"college-b","hosts":["nss.college-b.example"],"databaseUrlEnv":"COLLEGE_B_DATABASE_URL","databaseTokenEnv":"COLLEGE_B_DATABASE_TOKEN","blobTokenEnv":"COLLEGE_B_BLOB_TOKEN"}
]
```

Include every production alias you intend to use in the appropriate college's `hosts`; unknown aliases intentionally cannot access APIs. Replace the example second hostname with the institution's real verified domain.

6. For a new college, add `SEVATRACK_COLLEGE_B_ADMIN_EMAIL`, `SEVATRACK_COLLEGE_B_ADMIN_PASSWORD` (16–128 characters) and optional `SEVATRACK_COLLEGE_B_ADMIN_NAME`. College IDs convert to uppercase with hyphens replaced by underscores. Existing administrators are preserved and bootstrap credentials do not overwrite passwords.
7. Deploy. The migration runner validates all configured storage targets, applies checksum-controlled migrations to each database, and bootstraps only databases without an admin. Remove bootstrap password environment variables after confirming login.
8. Log in independently on each domain; set institution branding and catalogs. Verify a session from college A cannot read college B, and test private photo upload per college. Cookie values are host-only and all SQL clients/storage tokens are request-scoped.

This design provides separate persistence per college, not row-level tenancy in a shared database. There is no cross-college super-admin interface. Configuring the same database or Blob store for two colleges is rejected.

## Backup and restore runbook

Run in a trusted operator environment with the existing college's private `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN` and `BLOB_READ_WRITE_TOKEN`; these commands are not needed to use the deployed website. Do not paste credentials into chat, commit them, or include backups in source archives.

```sh
npm run db:check
npm run backup:full -- backups/2026-11-03-college
npm run backup:verify -- backups/2026-11-03-college
python scripts/restore-backup.py backups/2026-11-03-college/database.json backups/rehearsal.db
```

On systems where Python is named `python3`, use that name. Backup directories must not already exist. Keep them encrypted with access controls and a retention policy. Database snapshots are transactionally consistent; photos are copied after the snapshot. If concurrent deletion removes a referenced photo, the backup fails clearly instead of silently omitting it. Unfinished uploads are excluded.

For a photo restoration rehearsal, provision a NEW EMPTY PRIVATE Blob store and set only `RESTORE_BLOB_READ_WRITE_TOKEN` to its token, then:

```sh
npm run backup:restore-photos -- backups/2026-11-03-college
```

Source-store restore and overwrites are rejected. If the network interrupts restoration, use a fresh empty target and repeat; the partial target is not activated. Compare restored database row counts and ledger checks, and verify photo checksums before a controlled cutover. Database restoration intentionally creates only a new local SQLite file; importing that verified file into a new Turso database and changing production connection variables are separate operator actions. Never restore over the running database.

## Deployment discipline

Run `npm test`, `npm run typecheck`, `npm run build`, then deploy through the repository's Vercel integration. `vercel-build` applies migrations before building. Preview migrations remain blocked until a separately reviewed preview database workflow exists. After deployment, sign in as admin and run Settings → System health, then verify a real student workflow. Do not equate build success with completed live-device verification.
