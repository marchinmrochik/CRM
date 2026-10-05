# Phase 1 Review

## Delivered increment

A private, single-owner manual CRM with a PostgreSQL-backed session, company/vacancy creation and editing, archival/disposition actions, explicit application submission, status history, notes, next actions, interview scheduling/results, immutable uploaded PDFs, table filtering/pagination, CSV/JSON exports, basic counts, external source directory, and service-health view.

The web app is Next.js/React with TanStack Query. NestJS owns validation and transactional domain behavior. Prisma migrations create the relational schema and persistent session store. Both host-development and all-container profiles use project-specific ports.

## Code review map

| Area                                               | Entry point                                                       |
| -------------------------------------------------- | ----------------------------------------------------------------- |
| Relational model and migration history             | `apps/api/prisma/schema.prisma`, `apps/api/prisma/migrations/`    |
| Input contracts and lifecycle rules                | `apps/api/src/domain.ts`                                          |
| Transactions, owner scoping and immutable evidence | `apps/api/src/crm.service.ts`                                     |
| API routes and exports                             | `apps/api/src/crm.controller.ts`                                  |
| Sessions, CSRF, health and logging                 | `apps/api/src/main.ts`                                            |
| Navigation and CRM sections                        | `apps/web/components/workspace.tsx`                               |
| Application detail                                 | `apps/web/components/application-detail.tsx`                      |
| API errors and semantic forms                      | `apps/web/lib/api.ts`, `apps/web/components/ui.tsx`               |
| Infrastructure and lifecycle                       | `compose.yaml`, `Dockerfile`, `scripts/app.ps1`, `scripts/db.ps1` |
| Backups                                            | `scripts/backup.mjs`, `docs/backup-restore.md`                    |

## Owner walkthrough

1. Open `http://127.0.0.1:43170` and sign in with the private owner password. Run `scripts/show-password.ps1` locally to see it; do not paste it into issues or commits.
2. Add a company and save a vacancy with its complete description. Unknown eligibility remains visible.
3. Upload a PDF in Resumes. Prepare an application from the vacancy.
4. Mark it Applied with a submission time and the exact uploaded file, or explicitly select submission without a resume.
5. Add a note and next action; schedule and complete an interview. Inspect the event timeline.
6. Reload the page, filter the application table, export CSV/JSON, and download the pinned PDF.
7. Inspect System activity; use the infrastructure status/log commands for process and Docker diagnostics.
8. Create a backup and run the isolated restore verification.

Review records use synthetic company names and PDF fixtures. Browser tests create additional synthetic examples in the local workspace; database integrity tests clean up only their unique test owner records.

## Verification boundaries

### Results on October 5, 2026

| Check | Result |
| --- | --- |
| ESLint and TypeScript | Passed |
| API and web production builds | Passed on host and inside Docker |
| Vitest domain/PostgreSQL checks | 11 passed |
| Playwright CRM, localization and API security journeys | 3 passed in all-container mode after localization; the original 2 also passed in host mode |
| Mobile page width | Passed at 390 px; nested tables/navigation scroll internally |
| Occupied API port | Startup rejected the collision without stopping other services |
| PostgreSQL/API/web restart | Domain data, events, session and PDF survived unchanged |
| Fresh isolated backup restore | Passed; 7 referenced synthetic PDFs verified by checksum |
| Container readiness | PostgreSQL, API and web healthy; migration service exited successfully |
| English Markdown and PowerShell syntax | Passed |

The full container profile is left running for owner review. The local Git repository is initialized; the owner handles the initial commit and remote publication.

### Visual review artifacts

All screenshots contain synthetic records:

- [Desktop overview](reviews/phase-1/overview.png)
- [Application detail](reviews/phase-1/application.png)
- [Mobile overview](reviews/phase-1/mobile.png)
- [Ukrainian overview](reviews/phase-1/ukrainian.png)
- [Ukrainian mobile overview](reviews/phase-1/ukrainian-mobile.png)

The restart smoke check is available as `node scripts/verify-persistence.mjs` for the local all-container mode. It deliberately restarts only this project's services and should not run during unsaved work.

The check suite includes domain rules, real PostgreSQL integrity, cross-owner scoping, conflicting revisions, snapshot preservation, duplicate prevention, invalid uploads, private API/CSRF checks, and a complete browser journey. Desktop/mobile screenshots are inspected, including a page-level overflow assertion. Hosted GitHub Actions cannot be run until Git/remote setup exists; its workflow is prepared for later use.

The live local database uses the bootstrap administrator. PDF validation checks declared MIME type, signature and size, not antivirus or complete PDF semantic correctness. This increment is for a private local owner, not an externally hosted multi-user release.

## Deliberate phase limits

- No structured resume editor, generated resume versions, AI, imports, worker, Redis, or automatic applications.
- No per-operation retry history yet because all application operations are synchronous. Request errors expose correlation IDs; worker attempts/recovery are Phase 3.
- Vacancies have a bounded 500-record initial list; the application table has 20-row pagination. Advanced vacancy filters and source synchronization belong to later discovery work.
- Uploaded PDFs are immutable artifacts; structured version lineage arrives in Phase 2.
- The owner timezone currently comes from the browser; user preferences arrive when needed. Stored timestamps are UTC.
- Basic counts reflect recorded submission dates and current states. Cohort conversion analytics arrive in Phase 5.
- The restore drill is automated; switching real data to a restored database is an explicit reviewed recovery.
- UI forms use semantic browser validation plus server Zod validation. The component styling/tooling rationale is recorded in ADR 0001.

## Review gate

Stop after this increment. The owner reviews code, rendered behavior, infrastructure and known limits before authorizing Phase 2.
