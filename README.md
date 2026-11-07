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

All APIs authenticate an active account using a hashed, expiring session. Incoming ChatGPT/platform identity headers are not trusted. Role order is Admin → Faculty → Volunteer → Student. Students and Volunteers can access only their own attendance, evidence, correction requests and ledger. Volunteer is a senior participant designation; it does not grant staff approval or account-management access. Administrators assign it in Accounts → Manage → Role. Faculty attendance and evidence access is scoped to events they coordinate; the student directory includes program-wide progress. Administrators manage settings and accounts.

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

## Institute registration and platform ownership

Open `/institutes` for public registration, application status and the approved institute directory. Open `/platform` for the owner-only approval console. The existing college remains at `/` (choose **Existing college login** to return to it).

The original database holds the platform registry and its original college records. Every newly approved institute gets a **separate Turso database**, its own users and sessions, settings, events, attendance and hours. Platform metadata is never copied into institute databases. New institute administrators have no platform-owner privileges. The owner identity is pinned to the existing administrator's immutable user ID at initial setup; other college administrators cannot modify, recover or delete that account.

Production configuration:

- `SEVATRACK_PLATFORM_ENABLED=1`
- `SEVATRACK_PLATFORM_OWNER_EMAIL`: email of the existing active administrator who owns the platform; only used to initialize the pinned owner ID.
- `SEVATRACK_TENANT_KEY`: a securely generated 32-byte key encoded as 64 hex characters. Back this up securely; do not replace it without re-encrypting stored institute credentials.
- `SEVATRACK_TURSO_ORGANIZATION`, `SEVATRACK_TURSO_GROUP`, `SEVATRACK_TURSO_API_TOKEN`: enable automatic database creation. The existing `TURSO_AUTH_TOKEN` is a SQL token and cannot provision databases.

Create an organization-scoped Turso API token with only `read`, `db:create` and `db:mint-token` scopes, then put it in the Vercel Production environment. See https://docs.turso.tech/api-reference/authentication. Database creation is subject to the organization's plan and quotas; SevaTrack does not upgrade a billing plan. Without provider credentials, the owner can attach a **new empty** Turso database during approval. Existing databases, the original college database and databases already bound to a different institute are rejected.

Applicants choose a password of at least 16 characters. The owner verifies the institute/contact and provides a reason before approving. The administrator exists only after schema setup succeeds. Failed provisioning remains blocked and can be retried; no approval emails are sent automatically. Applicants check `/institutes` → **Application status**, then use their registered email/password in the approved workspace.

Suspension blocks all institute API access, including existing sessions. Reactivation clears institute sessions before restoring access. Institute credential records use authenticated encryption bound to the institute ID. The private Blob store is shared with strict per-institute object prefixes and database-authorized viewing; databases are physically separate, photo stores are not. Existing college photo paths remain unchanged. Account deletion cleanup cannot cross institute prefixes.

Deployments apply checksum-verified migrations to every active/suspended managed database. Back up the original registry database **and each institute database**, plus private photos and the tenant encryption key; the legacy backup CLI does not automatically enumerate self-service institute databases. Do not reset the original database: it contains the owner binding and institute registry. Institute recovery links select the correct workspace before password setup.

Tests: `node tests/institute-platform.cjs` exercises real isolated SQL databases and HTTP handlers. Provider API and physical phone/browser GPS verification are separate from these automated tests.


### Institute leadership and owner workspace access

Hierarchy: Platform Owner → Institute Super Admin → Admin → Faculty → Volunteer → Student.

- Each new institute's verified registration contact becomes its Super Admin on approval. Existing institute initial admins are promoted by migration 011; passwords, student records and hours are preserved. The original workspace promotes its earliest active admin, and its pinned platform owner retains leadership access.
- Only Super Admins (and the owner within that institute) can open Institute Settings, save programme configuration, manage directories or run system checks. Ordinary Admins retain event, attendance, report and student management duties.
- A Super Admin can create Admin, Faculty, Volunteer and Student accounts within its own database. Ordinary Admins cannot create, change, recover or delete Admin/Super Admin accounts. Only the platform owner can appoint additional Super Admins or manage another Super Admin. The final active institute Super Admin cannot be removed.
- In `/platform`, choose **Open workspace as owner**, enter an access reason, and manage the selected active institute. A visible owner banner includes **Return to owner console**. The access reason is recorded in platform and institute audit histories; subsequent mutations retain the owner's attributed identity.
- Owner workspace access lasts at most four hours, requires the still-valid owner login on every request, and is bound to one institute. Opening another workspace, leaving it, signing out of the owner console or suspending the institute revokes access. Support identities cannot sign in or receive recovery links through institute login.
- Databases and private photo prefixes remain isolated. Changing an institute cookie does not move a user's session or owner access grant to another college.
