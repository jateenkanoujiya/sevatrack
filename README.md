# SevaTrack

NSS Activity & Service Hours Management. Next.js on Vercel, Turso/libSQL for persistent records, and private Vercel Blob for participation photos.

## Deployment

The Vercel project is `jateen-conqueror/sevatrack`. Node.js 22 is required. Production functions and the database use Mumbai.

Connect a Turso database and a **private** Vercel Blob store to Production. Required server-only environment variables:

- `TURSO_DATABASE_URL`
- `TURSO_AUTH_TOKEN`
- `BLOB_READ_WRITE_TOKEN`

For the initial administrator, securely add `SEVATRACK_ADMIN_EMAIL`, `SEVATRACK_ADMIN_NAME`, and `SEVATRACK_ADMIN_PASSWORD` (16–128 characters). These are read only when no administrator exists. After verifying the first login, remove the bootstrap password variable. Subsequent deployments never overwrite an existing administrator or password. No visitor can create an administrator account.

Upload the source archive or connect the repository to Vercel. `npm run vercel-build` applies checksum-verified SQL migrations in atomic transactions, then builds Next.js. Preview deployment is intentionally blocked until a separate preview database is provisioned; never attach production records to an untrusted preview.

No sample accounts, events, photos, hours, or directory entries are inserted. The fresh database receives only program defaults and the explicitly configured administrator. Configure the institution, academic dates, batches, departments and categories after signing in.

## Integrity and permissions

All APIs authenticate an active account using a hashed, expiring session. Incoming ChatGPT/platform identity headers are not trusted. Students can access only their attendance, evidence, correction requests and ledger. Faculty attendance and evidence access is scoped to events they coordinate; the student directory includes program-wide progress. Administrators manage settings and accounts.

Original check-in/out times are immutable. Faculty edits change effective times, require a reason, use a revision guard, and append immutable adjustment, audit and ledger records in one transaction. Hours are calculated from the append-only ledger. Year 1 and Year 2 remain independent; defaults are 120 hours each. Event cancellation reverses credits atomically.

Private photos upload directly to Blob using a short-lived token scoped to a server-generated path. Authentication and attendance scope are checked before minting the token and before finalization. Only JPEG/PNG/WebP up to 5 MB and 25 megapixels are accepted; server validation checks the actual bytes. Evidence is exposed only through an authenticated, role-scoped, non-cacheable application route. Blob URLs grant no public access. GPS is supporting evidence and does not prove presence by itself.

## Operations

Create faculty and student accounts in Accounts, then issue single-use recovery links through a verified secure channel. CSV imports support up to 200 students per transaction. Recovery does not send email automatically. Notifications are in-app; event reminders are generated on account visit. Maps load only on request.

Attendance, events, evidence, history, corrections, reports and audit records support server-side search and pagination. Bulk reviews support 50 students per operation with individual results. Exports include all authorized records.

## Verification

- `python tests/vercel-integrity.py`: disposable in-memory SQLite tests for immutable original times, identity, audit history, atomic rollback, ledger corrections and evidence constraints. No production connection.
- `npx tsc --noEmit`: TypeScript validation after installing dependencies.
- `npm run build`: Next.js production build without database mutations.
- `npm run db:migrate`: production schema migration; run only against the intended configured database.

The earlier Cloudflare deployment remains on the main branch. This Vercel migration lives on `deploy/vercel`; its runtime and SDK integration must pass the Vercel build and live role/upload verification before launch sign-off.
