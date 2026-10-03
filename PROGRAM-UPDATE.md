# SevaTrack — October 2026 update

This is an update to the existing Next.js/Vercel application. It does not rebuild the project, reset the database, create demonstration accounts or replace existing attendance workflows. Existing batch and account deletion features are retained.

## Install on your PC and deploy

1. Back up your project folder and take a database backup before applying the migration.
2. Extract this ZIP. Copy the contents of its `SevaTrack-update` folder into your existing `SevaTrack` project folder, merging folders and replacing matching files. Do not delete other project files or your environment settings. If you have newer local changes to these same files, merge them first.
3. In the project terminal run:

   ```bat
   npx tsc --noEmit
   npm run build
   git status
   git add app lib public/nss-logo.png database/migrations/004_program_update.sql tests/program-update.py tests/program-service.cjs PROGRAM-UPDATE.md
   git commit -m "Add NSS branding, geotag app proof and historical service hours"
   git push origin main
   ```

   The project expects Node.js 22. No new production packages are required.
4. Your connected Vercel project should deploy the push. Keep its build command as `npm run vercel-build` (already specified by `vercel.json`), not just `npm run build`. That command applies the new migration before building. Keep the existing Turso and private Blob environment variables and the same database.
5. Confirm the deployment log includes `Applied migration: 004_program_update.sql` the first time. Do not edit or rerun old migrations manually. Migrations 001–003 must already be present in your project; this update is based on the account-deletion version you built successfully.
6. Open the production URL and sign in. If the migration fails, keep the previous deployment active and inspect the deployment log. A migration checksum error means an older migration file was changed; restore its original version rather than dropping the database.

This ZIP has not been pushed to your GitHub account or deployed to your live Vercel project.

## 1. NSS and college branding

The login/loading page uses the NSS logo without college branding. The signed-in sidebar and mobile workspace display the college name and uploaded logo alongside the NSS branding.

Admin → Settings → Institution name and College logo → choose a PNG/JPG/WebP under 140 KB → enter a reason → Save program settings. Use your institution's approved logo. The logo is validated on the server; SVG and external image URLs are not accepted for this setting.

**College boundary:** the existing application uses one institution per deployment/database. This update makes that institution configurable; it does not add a shared, isolated multi-college tenant system. Use a separate Vercel deployment, Turso database and private Blob store for each unrelated college. Do not enrol unrelated colleges into one existing database expecting isolation. Existing users inherit their deployment's college branding.

## 2. Geotag camera app photos

Student → Attendance → View participation → Participation proof → Photo source → Photo from a geotag camera app.

Choose the original stamped photo (JPG, PNG or WebP, up to 5 MB), enter the app name, capture time and coordinates shown on it, and submit. Enter the timestamp in the device's local time zone, converting from the photo's zone if necessary. The existing camera/library option remains available.

The server keeps declared capture details separate from live upload GPS. If live GPS is denied, the submission can still go to faculty review. Declared coordinates and visible stamps are not independently verified; they never overwrite check-in coordinates or timestamps. Faculty see both sets of information and compare the image stamp before approving. No automatic EXIF authenticity claim is made.

Images still use authenticated access and the existing private Blob upload/validation flow. A real Blob upload must be smoke-tested on your configured deployment; local tests did not use production storage credentials.

## 3. NSS categories

The migration installs twelve described categories under Regular activities and Special camping, including all ten requested activity areas plus orientation and campus work. Existing custom categories and events remain. Selecting a category shows its simple explanation and programme guidance. The 7-day camping description does not auto-award hours; use the existing daily attendance/review workflow for multi-day camps.

Sources used for concise original descriptions:
- https://nss.gov.in/en/regular-activities
- https://nss.gov.in/special-camping-programme
- NSS logo asset: https://ldce.ac.in/NSS/national-service-scheme.png

These are programme configuration entries, not sample events or demo data.

## 4. Historical hours

Faculty or Admin → Students → Historical hours.

- Select a student and NSS year, enter their TOTAL historical hours for that year, and supply the verified register/logbook reference and reason.
- Include service completed **through 6 October 2026**, meaning before 7 October. Exclude hours already present in attendance.
- Faculty may save until **7 October 2026, 11:59:59 p.m. India time**. The lock starts at `2026-10-07T18:30:00.000Z` (8 October, midnight IST). API and database checks enforce the cutoff.
- Admins can enter/correct these balances after the cutoff. Students cannot write historical hours.
- Account creation, student CSV imports and student account editing remain admin-only before and after the cutoff. This does not grant faculty new account-management permissions.
- Ordinary event registration, check-in/out, faculty attendance review and ongoing service hours are NOT frozen by this historical-entry cutoff.
- For bulk entry, check Import multiple students from CSV and download the current balances/template. Edit `hours`; retain `nss_id`, `year`, and `revision`. Submit at most 200 rows per file. Split larger exports into smaller files while retaining the header.
- Duplicate student/year rows, unknown NSS IDs, invalid hours or stale revisions reject the whole submitted batch. Download a fresh template if records changed.

Example: a student's historical total is 12. Correcting it to 10 creates a -2 ledger entry; it does not overwrite the 12 entry or add another 10 hours. Repeating an unchanged total does not award extra hours. Year 1/Year 2 progress, student totals, dashboard totals, history and student/history exports include the net balance. Event attendance reports continue to describe actual events only.

Every change records who, when, reason, source, previous/new balance and revision. Students see credits and corrections in Activity history. Staff can see the historical ledger in the entry form; Admin → Audit trail also contains the changes. Original check-in/out and attendance ledgers are untouched. Existing confirmed account deletion also removes that student's historical hours and preserves other students' balances.

No historical hours are automatically assumed or generated: administrators/faculty must enter verified values.

## Verification performed

- 71 automated checks across database integrity, account deletion, historical cutoff/revisions/atomicity, IDOR, photo metadata and logo validation.
- TypeScript passed; production build passed with Next's webpack build option in the verification environment.
- Real local API checks: all three role logins, historical entry/correction, audit, student totals/history, stale-edit and unauthorized-access rejection.
- Browser: admin login, historical correction submitted successfully, category descriptions, logo setting, and historical-form overflow checks at 360, 390, 768, 1024 and 1440 px.
- All test data stayed in disposable local storage; it is excluded from this ZIP and migrations.

After deployment, smoke-test a real college logo, one student's historical balance, a private geotag-app photo upload/review, and the normal registration/check-in/out/approval flow using your own configured services.
