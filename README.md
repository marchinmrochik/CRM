# Job Search OS

A private remote job search workspace and portfolio project. Phases 1–5 provide a manual CRM, evidence-based resume studio, durable background operations, optional AI suggestions, remote vacancy search and cohort analytics. Track the resume actually submitted, real conversations/interviews/offers and the evidence behind every conversion metric.

## Local workspace

Open [the private workspace](http://127.0.0.1:43170). Imported listings are available under **Job search**; configure sources under **Sources**. The standalone demo, synthetic production fixtures and demo routes have been removed. Hosting is deferred.

## Stack

See [the security policy](SECURITY.md) and [November 2026 architecture/security review](docs/security-architecture-review-2026.md). Runtime services use restricted database credentials; Redis is authenticated. On Windows, protect private files with `./scripts/protect-private-files.ps1`. Existing sessions require signing in once after the security update.

Next.js 16 / React 19, NestJS 12, PDFKit with embedded Noto Sans fonts, TypeScript, PostgreSQL 17, Prisma 7, Redis 8 / BullMQ 6, TanStack Query, Zod, persistent Express sessions, Vitest, Playwright, Docker Compose, and GitHub Actions. Dependency versions are pinned in manifests and `pnpm-lock.yaml`.

## Local start

Prerequisites: Docker Desktop's Linux engine, Docker Compose v2 with `up --wait`, Node.js 24, pnpm 11.21.0, and PowerShell 5.1 or newer.

```powershell
./scripts/db.ps1 init
node scripts/configure-app.mjs
./scripts/db.ps1 start
pnpm install --frozen-lockfile
pnpm db:generate
pnpm db:migrate
node scripts/runtime-role.mjs
docker compose --profile app up redis --detach --wait
pnpm build
./scripts/app.ps1 start
```

Open [Job Search OS](http://127.0.0.1:43170). To see your local owner password:

```powershell
./scripts/show-password.ps1
```

Initialization preserves existing credentials and generates random values for missing application credentials. Actual `.env` files are private and ignored. Never share the password, session secret, resolved Compose configuration, or runtime session files.

The persistent launcher starts API/worker/web in the background and keeps them available after the terminal closes. PostgreSQL and Redis must already be running. Its logs and PID records live in ignored `storage/runtime/`. The worker uses compiled child processes; rebuild the API after editing worker/task code.

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

After initialization and runtime-role provisioning, Docker runs the complete stack. Initial provisioning uses host Node once:

```powershell
./scripts/app.ps1 stop
# Ensure application secrets were configured before selecting this mode.
docker compose up --detach --wait postgres
docker compose --profile app build api worker migrate web
docker compose --profile app run --rm migrate
node scripts/runtime-role.mjs
docker compose --profile app up --no-build --detach --wait --wait-timeout 180
docker compose --profile app ps --all
docker compose --profile app logs --tail 100 --timestamps api web worker redis
```

The migration service must complete before API/worker start. The web image uses the internal `api:43171` proxy target at build time. API/worker/web containers run as the non-root Node user. Immutable PDFs share the private `storage/resumes/` directory. Redis uses AOF persistence and no eviction; PostgreSQL owns the operation ledger and can reconstruct queued transport jobs.

```powershell
docker compose --profile app stop api web worker
```

Routine shutdown never deletes database volumes. Changing initialization credentials in `.env` does not change users in an existing database volume. A merely unhealthy container does not automatically restart; use health and logs to diagnose it.

## Ports

| Service       | Host endpoint     | State                     |
| ------------- | ----------------- | ------------------------- |
| Web           | `127.0.0.1:43170` | Implemented               |
| API           | `127.0.0.1:43171` | Implemented               |
| PostgreSQL    | `127.0.0.1:45432` | Persistent Docker service |
| Worker health | `127.0.0.1:43172` | Implemented               |
| Redis         | `127.0.0.1:46379` | Persistent Docker service |

Database: `jobhunt`; bootstrap user: `jobhunt_local`; password: private `.env`. Container applications use `postgres:5432`. Default database ports are internal only. Host ports `3000`, `5000`, `8000`, and `1433` are never used.

Web/API currently use fixed reserved ports; PostgreSQL supports its validated `POSTGRES_PORT` setting. Document any future change before using it. No launch command terminates unrelated project services.

## Verification

```powershell
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm exec playwright install chromium
# Build images before the isolated browser checks (the owner stack may stay running).
docker compose --profile app build api web
node scripts/test-e2e.mjs
```

Run unit/component checks with `pnpm test:unit`. `pnpm test` and `pnpm test:coverage` start their own disposable PostgreSQL database and private test PDF directory; the personal worker can stay running. Browser tests use a separate disposable stack through `pnpm test:e2e`. Run suites sequentially with `pnpm test:all`. Direct integration/browser runs against personal data are blocked. AI tests use mock responses, never a paid provider. See [test strategy, coverage scope and commands](tests/README.md). Reports are generated under ignored `coverage/` and uploaded by CI.

API routes are discoverable at [API documentation](http://127.0.0.1:43171/api/docs) after signing in. To access documentation directly, the session cookie must also be present for the API host; use the same `127.0.0.1` hostname. OpenAPI currently documents routes; detailed generated client contracts can follow as shared consumers emerge.

## Resume studio

1. In Profile, enter contact details and real facts. Approve each fact explicitly; editing a fact clears its approval.
2. In Resumes, create a named draft for a saved vacancy. The profile and vacancy are captured at creation.
3. Reword or omit approved facts and manually quote vacancy requirements. Map supporting facts or keep an unsupported/uncertain gap visible.
4. Save, review the exact changes and requirement coverage, confirm accuracy, and publish the immutable version with its PDF.
5. Select that PDF when recording application submission. Published content and bytes remain unchanged after later edits.

The initial template uses one English single-column layout with selectable text; candidate content supports English, Russian and Ukrainian. A browser content preview is not an exact PDF pagination preview. No renderer guarantees ATS ranking. Published PDFs are bounded to 20 pages/2.5 MB. If the profile changed, create a new draft; a version can be forked using unchanged currently approved facts.

PDFKit and licensed static fonts run offline in bounded worker child processes; no external browser or paid service is needed. Publication returns a durable operation, and the UI tracks it until the immutable PDF/version is committed. Private PDF storage and backups are shared with uploaded resumes.

## Background operations and optional AI

System activity shows worker/Redis/AI health, run states, attempt times, worker identities, error codes/reasons, automatic recovery and owner-requested retries. Synthetic diagnostics exercise transient/permanent failures without candidate data or paid calls. Three attempts use exponential backoff; eligible manual retries preserve history and extend the budget up to 30 attempts. A dead worker lease is fenced before retrying; late results cannot publish twice.

AI is disabled by default. To enable the optional OpenAI adapter, set `AI_PROVIDER=openai`, `OPENAI_MODEL` to an available Responses/structured-output model, and `OPENAI_API_KEY` in private `.env`, then recreate the worker/API containers. No model is silently selected. In the editor, save the draft and explicitly consent to sending approved facts and the captured vacancy. Contacts are omitted. Review the extracted requirements and accept/reject each wording suggestion separately. Publication still requires the existing manual diff review. Structural evidence validation does not prove semantic truth; review accuracy yourself.

The OpenAI adapter is implemented against [official structured-output guidance](https://developers.openai.com/api/docs/guides/structured-outputs). Live provider availability, quality and costs are not verified without owner configuration. Provider failures never store response bodies or keys in logs.

```powershell
# Local synthetic disruption drill; temporarily affects only this project's worker/Redis.
node scripts/verify-operations.mjs
```

## Backup and recovery

```powershell
node scripts/backup.mjs create
node scripts/backup.mjs verify backups/<printed-directory>
```

Verification restores into a fresh temporary database and checks referenced artifact checksums. It never overwrites the live database. See [backup and restore](docs/backup-restore.md) for real recovery. A Docker volume is not a backup; keep private backups outside this machine as well.

## Repository layout

```text
apps/web/             Next.js interface and interactive server state
apps/api/             NestJS API/domain, separate worker/task processes, Prisma migrations
apps/worker/          Reserved; executable worker shares the API package and image
packages/contracts/   Reserved public contract boundary
packages/config/      Reserved shared tooling boundary
scripts/              Lifecycle, credentials and backup tools
tests/                Domain, PostgreSQL and browser checks
docs/                 English product, architecture and review documents
compose.yaml          Database and optional complete app profile
Dockerfile            API/worker and web build targets
.github/workflows/    Prepared CI configuration
```

Secrets, runtime uploads, backups, private exports, logs, dependencies, generated Prisma code and test artifacts are ignored. Lockfiles, migrations and synthetic fixtures stay tracked. `.dockerignore` keeps private files out of build contexts.

## Documentation and review

- [Phase 1 review and limits](docs/phase-1-review.md)
- [Phase 2 review and limits](docs/phase-2-review.md)
- [Phase 3 design](docs/phase-3-design.md)
- [Phase 3 review and verification](docs/phase-3-review.md)
- [Phase 4 design and source research](docs/phase-4-design.md)
- [Phase 4 review and verification](docs/phase-4-review.md)
- [Phase 5 design](docs/phase-5-design.md)
- [Phase 5 review and verification](docs/phase-5-review.md)
- [Analytics definitions](docs/analytics.md)
- [Deployment and release scope](docs/deployment.md)
- [Phase 2 design](docs/phase-2-design.md)
- [Resume format and renderer research](docs/resume-export-research.md)
- [Approved PDF export decision](docs/adr/0002-resume-pdf-export.md)
- [Implementation phases](docs/implementation-plan.md)
- [Product behavior](docs/product.md)
- [Architecture and logical model](docs/architecture.md)
- [Infrastructure](docs/infrastructure.md)
- [Observability and future operation history](docs/observability.md)
- [Decision proposals](docs/decisions.md)
- [Adopted Phase 1 foundation](docs/adr/0001-phase-one-foundation.md)

Documentation, Markdown and code comments use English. Each phase ends with owner code/visual review. All five implementation phases are delivered for review; hosted publication and later extensions require a separate instruction. No AI key is required for manual workflows, and no applications are sent automatically.

This is a private local owner release. Hosted deployment requires HTTPS, restricted database credentials, reviewed access, and independent backup storage. Provider listings are private runtime data, not public demo fixtures.

## Job search and monitoring

Open **Sources** to import Remotive, Arbeitnow, Jobicy, Himalayas and Remote OK listings. All five adapters use fixed official public API URLs without keys. Monitoring starts disabled; enable it separately for each source. Himalayas uses a 24-hour interval; the others use six hours. Manual requests and retries share persisted cooldowns. Coverage caps are displayed per source. Disabling monitoring stops future scheduled runs; already queued/retrying runs continue. Failures, retry times and attempts are visible in Sources and System activity. The directory also links to boards requiring accounts or manual entry; those are clearly marked as not connected.

Open **Job search** to search imported listings using all-word keywords, company, source, location, publication age, disposition and unseen filters. Save searches, inspect reasons and snapshots, mark seen, shortlist or dismiss. Original provider links and attribution remain visible. Possible duplicates use company/title and require review. **Save to CRM** creates one vacancy and company as needed; **Prepare application** then creates an application. Later imports preserve the captured CRM description. Eligibility remains unknown until verified manually. An expired feed entry does not prove vacancy closure. See [source research and priorities](docs/job-source-research.md) and [codebase review](docs/codebase-review.md).

Coverage is intentionally bounded: Remotive software-development category only (provider publication delay), Arbeitnow remote records from the first page only. No LinkedIn, DOU or Djinni scraping. Source attribution/original links stay visible. Normalized snapshots and searches are included in JSON export schema version 4 and PostgreSQL backups. The UI exposes the latest 20 changed snapshots per listing; older snapshots remain in exports/backups.

`node scripts/verify-discovery.mjs` performs a quota-controlled live import for each due source. Third-party availability is not required for CI. Never reset source intervals to bypass provider limits. See the Phase 4 research for the source policies and compatibility checks.

## Outcomes and analytics

Record actual recruiter response, human interaction, interview/final interview and offer milestones on an application after submission. Use the actual date and a short evidence note. Correct an erroneous explicit milestone with a reason; its original and correction remain in the timeline/export. Reopening an application preserves earlier progress. Completed interviews and historical offer transitions also provide evidence; scheduled/cancelled interviews and a generic In progress status do not prove contact.

Analytics cohorts use inclusive UTC submission days. Each stage displays its full-cohort denominator plus conditional conversion among applications with both adjacent stages. Missing earlier evidence is visible, so counts may not form a decreasing funnel. Response-time median/p90 use answered applications only, with sample size. Unresolved outcomes, their age, captured sources, submitted immutable resume versions and small comparison samples remain explicit. Comparisons describe observations and do not establish causation or guarantee ATS passage. Aggregates use the full supported cohort; the detail table displays its latest 50 applications. JSON export uses the same calculation as the interface.

`packages/analytics` is the shared pure calculation boundary, used by the API and owner UI. Root build/typecheck/test/dev scripts build it first. After editing the package during host development, rebuild it and restart affected consumers. UI languages are EN/RU/UK; candidate-authored resume names and text stay in their original language.

## Interface languages

The interface supports English, Russian and Ukrainian. Use the language selector on the sign-in screen or in the workspace header. The selection is saved in this browser and restored after reload. Navigation, forms, statuses, dates, activity events and known API errors are localized; candidate-authored content and stored status codes remain unchanged. Documentation remains in English.
