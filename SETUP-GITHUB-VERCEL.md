# SevaTrack — source, GitHub and database setup

This is the native Vercel version of SevaTrack (Next.js frontend and API, Turso database, private Vercel Blob photos). Extract the ZIP and open the SevaTrack folder containing package.json.

## What is included

All version-controlled application source, UI components, server API, authentication, photo handling, SQL schema/migrations, integrity tests, deployment configuration and an empty .env.example. No sample database, production data dump, passwords, tokens, Git history, node_modules or generated builds are included. npm install recreates dependencies.

The archive includes the latest defensive database result-mapping patch, which was not in the last verified live deployment. Batch deletion is not implemented. Private Blob was awaiting connection at handover. Live GPS/camera and all authenticated role workflows still need final verification.

## 1. Push to GitHub from Windows

Install Git for Windows and Node.js 22. Create a new PRIVATE GitHub repository called sevatrack. Leave README, .gitignore and license unchecked so the repository is empty.

Open the extracted SevaTrack folder in VS Code. Open Terminal > New Terminal. Run each line:

```powershell
git init
git branch -M main
git config user.name "YOUR NAME"
git config user.email "YOUR VERIFIED GITHUB EMAIL"
git add .
git status
git commit -m "Initial SevaTrack application"
git remote add origin https://github.com/YOUR-USERNAME/sevatrack.git
git push -u origin main
```

Replace YOUR-USERNAME with your GitHub username. Complete GitHub sign-in in the browser if prompted. Your GitHub account password is not used as a Git HTTPS password. Review git status before committing: no .env.local, tokens, database dumps or personal exports should appear. The blank .env.example is safe to commit.

## 2. Connect the EXISTING Vercel project

Open Vercel > JateenConqueror > sevatrack > Settings > Git. Connect GitHub and select your sevatrack repository. Give Vercel access to that repository. Use main as the production branch (check Settings > Environments > Production if needed).

Keep the existing project, domain, Turso connection and environment variables. Do not create a replacement project or database merely to connect GitHub.

Expected configuration:
- Framework: Next.js
- Node: 22.x
- Root directory: repository root (package.json is here)
- Install: npm install --no-audit --no-fund
- Build: npm run vercel-build
- Output directory: Next.js default

vercel.json already provides the install/build configuration. To trigger a deployment after connecting if none starts automatically:

```powershell
git commit --allow-empty -m "Deploy connected GitHub repository"
git push
```

Wait for Ready in Vercel Deployments. Connecting source must not remove existing database variables. Preview builds are deliberately blocked by the migration script; setting a preview database alone does not enable them. A separate reviewed preview workflow is needed.

## 3. Database and photo storage

| Component | Stores | Location |
|---|---|---|
| Turso | Accounts, events, attendance, hours ledger, audits, settings, photo metadata | Existing sevatrack-db, connected to Production |
| Private Vercel Blob | Actual attendance photo files | Connection still pending at handover |
| GitHub | Source and database migration SQL | Your new private repository |

Your database is hosted separately: pushing code does not copy, replace or delete its records. Keep using the existing connection to preserve students and attendance.

Production variables in Vercel > Settings > Environment Variables:

| Variable | Purpose |
|---|---|
| TURSO_DATABASE_URL | Existing database address, installed by Turso integration |
| TURSO_AUTH_TOKEN | Server-only database credential, installed by integration |
| BLOB_READ_WRITE_TOKEN | Server-only private photo store access |

Do not prefix these with NEXT_PUBLIC_. Do not put their actual values in GitHub or send them in chat.

For photos, open the existing Vercel project's Storage page, create/connect a PRIVATE Blob store (Mumbai), and attach its read/write token. Prefer Production-only connection when available; do not give untrusted previews production credentials. Redeploy after connecting it. Uploaded photos must remain private; the application serves them through authorized API routes.

### Schema and migration files

- database/migrations/001_initial.sql: full initial schema and integrity triggers.
- database/migrations/002_private_uploads.sql: private-upload intent schema and evidence constraints.
- scripts/migrate.mjs: checksum-tracked, transactional migration runner.

npm run vercel-build applies unapplied migrations before building. Already-applied migrations are skipped. Never edit an applied SQL migration: add a new numbered SQL file and separate statements using the existing '--> statement-breakpoint' convention. Review and back up production data before schema changes. Do not run the raw initial SQL against the existing database manually.

This ZIP contains schema, not a backup of live records or photos. Use Turso's database backup/export facilities for records and a separate private Blob backup for photo objects. CSV reports are not a full restorable database backup. Keep backup exports outside your Git repository.

### Initial admin on a NEW database only

For a new database, add SEVATRACK_ADMIN_EMAIL, SEVATRACK_ADMIN_NAME and SEVATRACK_ADMIN_PASSWORD securely in Vercel. Initial password must be 16–128 characters. Deploy, verify login, then remove the bootstrap password environment variable. Existing admin accounts are never overwritten by this script; changing bootstrap variables does not reset an existing password.

## 4. Run locally with a separate development database

Do not use production database credentials for experiments. Create a separate Turso development database; use a separate private Blob store if testing photo uploads.

```powershell
npm install
Copy-Item .env.example .env.local
```

Fill .env.local locally with development credentials and, for its first admin, bootstrap values. Then:

```powershell
node --env-file=.env.local scripts/migrate.mjs
npm run dev
```

Open http://localhost:3000. Next.js reads .env.local automatically; the standalone migration command requires the explicit --env-file option above. npm run db:migrate alone requires variables already exported into the shell.

After npm install, commit the newly generated package-lock.json for reproducible installs. Do not commit .env.local or node_modules.

Verification:
```powershell
npx tsc --noEmit
npm run build
python tests/vercel-integrity.py
```
The Python tests use disposable in-memory SQLite; they do not modify production.

## 5. Future changes from AI

Ask the AI for updated source files. Replace only the changed files in this Git folder; keep its .git folder. Review changes, then:

```powershell
git diff
git add .
git status
git commit -m "Describe the changes"
git push
```

Vercel builds the new main commit automatically once connected. Changes in an AI conversation do not reach GitHub until actually pushed. Vercel's Redeploy button rebuilds existing uploaded source; it does not fetch unpushed files from the AI workspace.

## Official references

https://docs.github.com/en/migrations/importing-source-code/using-the-command-line-to-import-source-code/adding-locally-hosted-code-to-github
https://vercel.com/docs/git/vercel-for-github
https://vercel.com/docs/project-configuration/git-settings
