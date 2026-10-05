# Job Search OS

A private remote job search workspace and portfolio project. Phase 1 provides a usable manual CRM: companies, vacancies, applications, interview history, next actions, notes, submitted PDFs, exports, and service health.

## Stack

Next.js 16 / React 19, NestJS 12, TypeScript, PostgreSQL 17, Prisma 7 with its PostgreSQL adapter, TanStack Query, Zod, persistent Express sessions, Vitest, Playwright, Docker Compose, and a prepared GitHub Actions workflow. Dependency versions are pinned in manifests and `pnpm-lock.yaml`.

## Local start

Prerequisites: Docker Desktop's Linux engine, Docker Compose v2 with `up --wait`, Node.js 24, pnpm 11.21.0, and PowerShell 5.1 or newer.

```powershell
./scripts/db.ps1 init
node scripts/configure-app.mjs
./scripts/db.ps1 start
pnpm install --frozen-lockfile
pnpm db:generate
pnpm db:migrate
pnpm build
./scripts/app.ps1 start
```

Open [Job Search OS](http://127.0.0.1:43170). To see your local owner password:

```powershell
./scripts/show-password.ps1
```

Initialization preserves existing credentials and generates random values for missing application credentials. Actual `.env` files are private and ignored. Never share the password, session secret, resolved Compose configuration, or runtime session files.

The persistent launcher starts API/web in the background and keeps them available after the terminal closes. Its logs and PID records live in ignored `storage/runtime/`.

```powershell
./scripts/app.ps1 status
./scripts/app.ps1 stop
./scripts/db.ps1 status
./scripts/db.ps1 logs
./scripts/db.ps1 restart
./scripts/db.ps1 stop
```

For source editing, use `pnpm dev` after stopping the persistent app processes. Development ports are fixed to the allocation below; do not run host and container app modes concurrently.

## All-container mode

After initialization, Docker can build and run the complete stack without a host Node installation:

```powershell
./scripts/app.ps1 stop
# Ensure application secrets were configured before selecting this mode.
docker compose --profile app up --build --detach --wait --wait-timeout 180
docker compose --profile app ps --all
docker compose --profile app logs --tail 100 --timestamps api web
```

The migration service must complete before the API starts. The web image uses the internal `api:43171` proxy target at build time. API/web containers run as the non-root Node user. Immutable PDFs share the private `storage/resumes/` directory between host and container modes.

```powershell
docker compose --profile app stop api web
```

Routine shutdown never deletes database volumes. Changing initialization credentials in `.env` does not change users in an existing database volume. A merely unhealthy container does not automatically restart; use health and logs to diagnose it.

## Ports

| Service       | Host endpoint     | State                     |
| ------------- | ----------------- | ------------------------- |
| Web           | `127.0.0.1:43170` | Implemented               |
| API           | `127.0.0.1:43171` | Implemented               |
| PostgreSQL    | `127.0.0.1:45432` | Persistent Docker service |
| Worker health | `127.0.0.1:43172` | Reserved for Phase 3      |
| Redis         | `127.0.0.1:46379` | Reserved for Phase 3      |

Database: `jobhunt`; bootstrap user: `jobhunt_local`; password: private `.env`. Container applications use `postgres:5432`. Default database ports are internal only. Host ports `3000`, `5000`, `8000`, and `1433` are never used.

Web/API currently use fixed reserved ports; PostgreSQL supports its validated `POSTGRES_PORT` setting. Document any future change before using it. No launch command terminates unrelated project services.

## Verification

```powershell
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm exec playwright install chromium
# Start the app before running browser checks.
pnpm test:e2e
```

Vitest includes real PostgreSQL tests and requires the migrated database and private configuration. Playwright tests run on the local application with synthetic records. They create additional review examples; never point them at an externally hosted personal production workspace.

API routes are discoverable at [API documentation](http://127.0.0.1:43171/api/docs) after signing in. To access documentation directly, the session cookie must also be present for the API host; use the same `127.0.0.1` hostname. OpenAPI currently documents routes; detailed generated client contracts can follow as shared consumers emerge.

## Backup and recovery

```powershell
node scripts/backup.mjs create
node scripts/backup.mjs verify backups/<printed-directory>
```

Verification restores into a fresh temporary database and checks referenced artifact checksums. It never overwrites the live database. See [backup and restore](docs/backup-restore.md) for real recovery. A Docker volume is not a backup; keep private backups outside this machine as well.

## Repository layout

```text
apps/web/             Next.js interface and interactive server state
apps/api/             NestJS domain/API, Prisma schema and migrations
apps/worker/          Future background execution boundary
packages/contracts/   Reserved public contract boundary
packages/config/      Reserved shared tooling boundary
scripts/              Lifecycle, credentials and backup tools
tests/                Domain, PostgreSQL and browser checks
docs/                 English product, architecture and review documents
compose.yaml          Database and optional complete app profile
Dockerfile            API/web build targets
.github/workflows/    Prepared CI configuration
```

Secrets, runtime uploads, backups, private exports, logs, dependencies, generated Prisma code and test artifacts are ignored. Lockfiles, migrations and synthetic fixtures stay tracked. `.dockerignore` keeps private files out of build contexts.

## Documentation and review

- [Phase 1 review and limits](docs/phase-1-review.md)
- [Implementation phases](docs/implementation-plan.md)
- [Product behavior](docs/product.md)
- [Architecture and logical model](docs/architecture.md)
- [Infrastructure](docs/infrastructure.md)
- [Observability and future operation history](docs/observability.md)
- [Decision proposals](docs/decisions.md)
- [Adopted Phase 1 foundation](docs/adr/0001-phase-one-foundation.md)

Documentation, Markdown and code comments use English. Each phase ends with owner code/visual review. Phase 2 is not authorized automatically. No AI key is required, no experience is fabricated, and no applications are sent automatically.

This is a private local owner release. Hosted deployment requires HTTPS, restricted database credentials, reviewed access, and independent backup storage. The current application deliberately does not include AI, automatic source imports, Redis or a worker.

## Interface languages

The interface supports English, Russian and Ukrainian. Use the language selector on the sign-in screen or in the workspace header. The selection is saved in this browser and restored after reload. Navigation, forms, statuses, dates, activity events and known API errors are localized; candidate-authored content and stored status codes remain unchanged. Documentation remains in English.
