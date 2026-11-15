# Backup and Restore

After a live restore, re-run `node scripts/runtime-role.mjs` before restarting API/worker to reapply runtime grants and protected-table restrictions. Restore drills deliberately use `--no-owner --no-acl` and do not verify production role grants by themselves. Keep the private `.env` credentials separately protected; database dumps do not reconstruct service passwords. Server-side authentication age is enforced, so restored or legacy sessions may require signing in again.

## Create and verify

```powershell
node scripts/backup.mjs create
node scripts/backup.mjs verify backups/<printed-directory>
```

A backup contains a PostgreSQL custom-format dump, immutable PDF artifacts, and a checksum manifest. It is private and ignored by Git. Keep an additional copy outside the laptop. Configuration secrets are intentionally excluded; protect `.env` separately.

Verification restores into a newly created `jobhunt_restore_<timestamp>` database inside the project PostgreSQL service. It verifies the dump checksum and each restored resume reference against its artifact checksum, then removes only that temporary database. It never overwrites the live database.

Current artifact writes are immutable and no purge endpoint exists, so copying artifacts after the consistent database dump can include harmless extra files. Before adding artifact deletion or multi-process purge, implement snapshot coordination. The development database currently uses the local bootstrap administrator; a hosted application requires a restricted role.

## Recover real data

1. Stop API/web/worker. Preserve a separate backup of the damaged state.
2. Verify the selected backup with the command above.
3. Create a new explicitly named recovery database. Restore its dump with `pg_restore --exit-on-error --no-owner --no-acl`; do not overwrite an existing database.
4. Copy the backup's `resumes` directory into a new private artifact directory.
5. Point a separately reviewed configuration at the recovered database and artifact directory. Preserve the original directories/volume.
6. Inspect application counts, timelines, selected resume downloads, and readiness. Invalidate restored sessions before opening external access.
7. Switch the local configuration only after inspection, then start the app and repeat the critical journey.

The verification command automates an isolated restore drill; a production cutover remains explicit. Never use volume deletion as recovery.

Phase 3 backups include operation inputs, results, decisions and attempt history in the PostgreSQL dump. Redis is reconstructible transport, not the authoritative ledger. After recovery, keep the worker stopped until candidate snapshots and pending operations have been reviewed; restarting it resumes queued work and reconciles expired leases. AI retries can repeat provider charges after ambiguous timeouts. Existing successful records are not republished.
# Phase 4 data coverage

PostgreSQL backups also include discovery source configurations and request intervals, normalized listings, every changed snapshot, saved searches and their import run/attempt history. JSON export schema version 4 includes these owner-scoped records. Redis remains reconstructible transport. Stop the worker before a restore/cutover and review restored source quotas/pending runs before restarting monitoring; never use restoration to bypass provider request limits. A controlled restart check requires quiescent sources: disable scheduling and let active runs finish first.
