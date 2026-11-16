# SevaTrack operations

Production deployments run a read-only migration checksum preflight, then build the site. They no longer mutate production databases. For a release that changes schema, take a successful backup, run `npm run db:migrate` with the protected production environment, check institute health, then deploy. A missing main migration blocks deployment; each institute's schema status is reported separately in the owner console. Use backward-compatible migrations when old and new app versions overlap.

## Backups

The production cron calls `/api/maintenance/backup` daily at 02:00 UTC. It requires the `CRON_SECRET` bearer header; owner-authenticated, same-origin POST `/api/platform/backup` is the manual alternative. Only production has the cron and encryption secrets. Owner console → Database health & backups shows the last successful backup and the most recent failed attempt.

Backups include the platform database, all ACTIVE/SUSPENDED institute databases, and each snapshot's referenced evidence photos. Each database uses its own read transaction; this is not a simultaneous cross-database snapshot. Files use AES-256-GCM with `SEVATRACK_BACKUP_KEY` and private Blob storage. Every uploaded object is downloaded, decrypted and checksummed before the completion manifest is written. Interrupted runs have no completed manifest. One institute failure does not erase its last successful recovery point. A ten-minute database lease prevents overlapping runs and expires after a crashed invocation.

Keep both `SEVATRACK_BACKUP_KEY` and `SEVATRACK_TENANT_KEY` in protected recovery credentials; do not rotate or remove them without preserving the old keys. Database backups contain encrypted tenant credentials, so the tenant key remains necessary for platform recovery. Backups are in the same private Blob account as evidence, not an independent off-account disaster recovery copy. No automatic retention deletion is enabled. Review storage use and establish an approved retention policy before pruning. Erasing a user from the live app does not erase retained encrypted recovery points.

The current job has a 240-second processing budget within a 300-second function. A large database/photo collection may exceed it; the owner dashboard then records failure. Move to queued per-institute jobs before outgrowing this limit. A missed cron invocation is visible as an old backup timestamp; there is no external alerting integration in this release.

## Recovery rehearsal

With private Blob credentials and the backup encryption key available only in the process environment:

1. Read the last successful manifest pathname from the owner health endpoint (authenticated) or the private Blob `backups/v2/` prefix.
2. Run `npm run backup:download -- <manifest-pathname> <new-private-directory>`.
3. Run `python3 scripts/restore-backup.py <directory>/database.json <new-local-file.db>`; this refuses an existing destination and checks SQLite integrity and foreign keys.
4. Run `npm run backup:verify -- <directory>` to verify photo counts and hashes.
5. For a photo recovery rehearsal, set `RESTORE_BLOB_READ_WRITE_TOKEN` for a NEW EMPTY PRIVATE store and run `npm run backup:restore-photos -- <directory>`. It refuses the source store and nonempty destinations.

Do not replace live database mappings until the restored copy, institute identity, accounts, hours and photos have been reviewed. Production restoration is deliberately not a dashboard button.

## Deletion protection

Automatic institute provisioning enables database deletion protection before issuing a token. Each backup run enables and verifies protection on the configured institute group; the owner health panel reports the result. The platform database can belong to a different Turso organization and must be protected separately. Failed provider protection checks do not stop backups. Protection does not replace backups or prevent SQL record deletion.

## Release validation

Automated tests cover encrypted round trips, tamper rejection, exact integer/blob restoration to a new SQLite file, private photo namespaces, failed/incomplete backups, run overlap, owner-only endpoints, institute isolation and the attendance workflow. A real phone still needs a check-in/out, GPS permission, geofence, camera/upload, approval and resulting-hours test.
