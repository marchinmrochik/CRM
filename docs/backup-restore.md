# Backup and Restore

## Create and verify

```powershell
node scripts/backup.mjs create
node scripts/backup.mjs verify backups/<printed-directory>
```

A backup contains a PostgreSQL custom-format dump, immutable PDF artifacts, and a checksum manifest. It is private and ignored by Git. Keep an additional copy outside the laptop. Configuration secrets are intentionally excluded; protect `.env` separately.

Verification restores into a newly created `jobhunt_restore_<timestamp>` database inside the project PostgreSQL service. It verifies the dump checksum and each restored resume reference against its artifact checksum, then removes only that temporary database. It never overwrites the live database.

Current artifact writes are immutable and no purge endpoint exists, so copying artifacts after the consistent database dump can include harmless extra files. Before adding artifact deletion or multi-process purge, implement snapshot coordination. The development database currently uses the local bootstrap administrator; a hosted application requires a restricted role.

## Recover real data

1. Stop API/web and any future worker. Preserve a separate backup of the damaged state.
2. Verify the selected backup with the command above.
3. Create a new explicitly named recovery database. Restore its dump with `pg_restore --exit-on-error --no-owner --no-acl`; do not overwrite an existing database.
4. Copy the backup's `resumes` directory into a new private artifact directory.
5. Point a separately reviewed configuration at the recovered database and artifact directory. Preserve the original directories/volume.
6. Inspect application counts, timelines, selected resume downloads, and readiness. Invalidate restored sessions before opening external access.
7. Switch the local configuration only after inspection, then start the app and repeat the critical journey.

The verification command automates an isolated restore drill; a production cutover remains explicit. Never use volume deletion as recovery.
