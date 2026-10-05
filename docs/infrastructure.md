# Infrastructure and Operations

## Local development topology

PostgreSQL runs in Docker Compose from the first executable phase. Web/API initially run on the host for fast development feedback. A complete containerized app profile is added before the first reviewable CRM release. Redis and a worker are introduced only when durable asynchronous processing is implemented.

## Reserved project ports

| Service | Host binding | Container/internal port | Introduction |
| --- | --- | --- | --- |
| Web | `127.0.0.1:43170` | `43170` | Phase 1 |
| API | `127.0.0.1:43171` | `43171` | Phase 1 |
| Worker health | `127.0.0.1:43172` | `43172` | Phase 3 |
| PostgreSQL | `127.0.0.1:45432` | `5432` | Phase 1 |
| Redis | `127.0.0.1:46379` | `6379` | Phase 3 |

Standard database ports are allowed only inside the isolated Docker network. No project service binds a default host port. Host ports `3000`, `5000`, `8000`, and `1433` are explicitly prohibited. Any future service must receive a documented non-default host port before being added.

The proposed host ports had no TCP listeners during the initial planning check. Recheck before startup because availability can change. Fail with a clear collision report; never kill another service or silently choose a different port. Expose port settings through validated environment variables and maintain one authoritative allocation table.

Use Compose project name `jobhunt-crm` and a project-scoped network/volumes. Prefer Compose service names over global `container_name` values. Database/Redis bindings remain loopback-only. Worker health need not be published in the all-container profile.

## Persistence

- PostgreSQL uses a named volume; stopping/restarting containers preserves data.
- Private artifacts use a separate project volume in container mode and a documented ignored directory in host development mode.
- When Redis is introduced, enable persistent queue storage; PostgreSQL remains the authoritative operation history.
- Routine shutdown must never use `down --volumes`.
- A separately documented destructive reset requires explicit owner intent and identifies exactly what will be lost.
- Back up PostgreSQL and referenced artifacts together using a manifest/checksums. A volume is not a backup.
- Validate restoration into isolated storage before claiming backup readiness.

## Configuration

Commit `.env.example` with placeholders only. Ignore actual environment files, uploads, backups, exports containing private data, and logs. Separate host and container database connection URLs: host uses port `45432`; containers address the database service at `5432`.

Validate configuration at boot and report missing variable names without printing secret values. Pin dependency versions and container image versions at bootstrap. Commit the package manager lockfile. Run migrations explicitly; never use destructive schema synchronization for real data.

## Startup and recovery

Startup sequence: configuration/port checks -> database healthy -> explicit migrations -> API ready -> web ready. Add Redis/worker checks when those components exist. A dependency container being started does not mean it is ready.

Container restart policies recover exited processes; they do not automatically recover a merely unhealthy process. Health failures remain visible. Worker startup reconciles unfinished attempts before accepting work. Development hot reload is a developer event, not a successful job retry.

Phase 1 provides `compose.yaml`, `scripts/db.ps1`, and `scripts/app.ps1` for persistent local startup and diagnostics, plus the optional complete `app` Compose profile. PostgreSQL uses `postgres:17.11-bookworm`; database health and Docker restart information are visible through the status command. `scripts/backup.mjs` creates private backups and verifies them through an isolated restore drill. See `backup-restore.md` for recovery and `phase-1-review.md` for verification boundaries. Host development servers run under an owner-visible persistent launcher rather than a temporary tool session.

## Health endpoints

- API `/health/live`: process can respond; do not fail solely because a provider is down.
- API `/health/ready`: database and required configuration are ready.
- Worker health: process readiness plus recent heartbeat and queue availability.
- Web: reachable page and successful access to required API functionality.
- AI/source failures are feature degradation; they do not make the whole CRM unavailable.

Health responses and operational details are owner-only where appropriate. API errors must not leak stack traces to public clients.

## CI and hosted deployment

GitHub Actions runs frozen-lockfile install, lint, typecheck, unit tests, PostgreSQL integration tests, production build, and critical Playwright journeys. CI databases are disposable, private data is excluded, and required artifacts include test reports and failure traces with synthetic data.

Deploy target remains open until the owner chooses a budget and hosting model. Keep one web app, one modular API, managed or containerized PostgreSQL, private artifact storage, and later one worker/Redis deployment. Production uses HTTPS ingress and private database networking; local reserved ports are not a requirement to expose production services publicly.

Before external deployment, define authentication, backup/restore, migration rollback or forward recovery, log retention, and secret management. Demonstration and personal production environments must remain isolated.
