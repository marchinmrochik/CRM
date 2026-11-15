# Phase 4 Review

## Delivered increment

Remote vacancy discovery with Remotive and Arbeitnow public JSON API connectors, separate owner inbox, six-hour source scheduling/request quotas, durable import runs and attempt history, content-hash repeat safety, immutable changed snapshots, possible-duplicate review, saved searches and literal match explanations. Manual promotion creates one CRM vacancy without overwriting later application evidence. Seen/shortlist/dismiss decisions survive provider refreshes. Eligibility remains unknown until the owner checks hiring geography.

Monitoring is disabled by default. A live local check imported 17 Remotive software-development listings and 14 remote Arbeitnow listings on October 5, 2026; availability and counts will change. Remotive publication delay and Arbeitnow first-page coverage are disclosed. Existing directory links remain available. No source resumes, applicant profiles or private documents are transmitted. RSS is a future connector implementation; no scraping was added.

## Review walkthrough

1. Open Sources. Inspect coverage, last success, next fetch and source/run health. Import when due or enable six-hour monitoring. Inspect an import's attempts, result counts, failure code and deferred retry time.
2. Open Discovery. Filter all keyword words, location text, source, disposition and unseen status. Save a named search, change filters, restore it or delete it.
3. Select a listing. Inspect the original attributed source link, first/last seen timestamps, unknown eligibility, matching reasons and possible duplicate listings. Review older changed snapshots.
4. Mark seen, shortlist/dismiss, or return to inbox. Save a chosen listing to CRM, then use Prepare application. Review its captured description and existing resume-tailoring flow. Future imports do not rewrite that evidence.
5. Repeat in Russian/Ukrainian and on a narrow viewport. All documentation remains English; provider content stays in its original language.

## Changed areas

| Area                                            | Files                                                                                                                        |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Source contracts, validation and request limits | `apps/api/src/discovery.connectors.ts`                                                                                       |
| Scheduling, snapshots, filters and promotion    | `apps/api/src/discovery.service.ts`, `discovery.controller.ts`                                                               |
| Durable execution                               | `apps/api/src/worker.ts`, `operations.service.ts`, `ai.provider.ts`                                                          |
| Database and exports                            | `apps/api/prisma/schema.prisma`, migration `20261005180000_discovery`, `crm.service.ts`                                      |
| Review interface and localization               | `apps/web/components/discovery-workspace.tsx`, `workspace.tsx`, `operations-workspace.tsx`, `translations.ts`, `globals.css` |
| Verification                                    | `tests/discovery.test.ts`, `tests/e2e/discovery.spec.ts`, `scripts/verify-discovery.mjs`, `verify-persistence.mjs`           |

## Verification

Local verification on October 5, 2026:

- 46 Vitest tests passed across seven files: adapter fixtures, format drift, unsafe/credential-bearing URLs, response size/rate-limit behavior, repeated/changed imports, source overlap and scheduling, stale source health, owner isolation, saved filters, idempotent promotion and expired commit leases, plus earlier CRM/resume/operation regression tests.
- Seven browser scenarios verified: six earlier scenarios passed in the full regression run; the new discovery scenario passed after correcting its repeated-run fixture to use an independent company. EN/RU/UK, 390 px overflow check, source failure history, matching reasons, saved searches, snapshots, duplicate candidates, safe text rendering and promotion/application preparation were exercised.
- Lint, TypeScript checks and production Docker API/worker/web builds passed. Seven migrations applied. No new ports or services were introduced.
- Live connector check succeeded for both providers without enabling monitoring or bypassing request intervals. Third-party network access is excluded from CI tests.
- JSON export schema version 4 covers source configuration/quotas, listings with snapshots, searches and operation attempts. The database/API/web/worker restart check passed, including discovery records, source request intervals, authenticated session and PDF bytes.
- Backup `backups/2026-10-05T12-14-29-394Z` restored successfully into an isolated temporary database; 24 referenced PDF artifacts passed checksum verification. The live database was not overwritten.
- The final discovery test file was rerun after the credential-bearing URL fixture cleanup: all 17 tests passed. Git candidate audit found no local credentials or credential patterns; runtime/provider data and backups remain ignored.

Public screenshots use synthetic records: [Discovery](reviews/phase-4/discovery.png), [Ukrainian mobile](reviews/phase-4/mobile.png), [source failure history](reviews/phase-4/source-history.png). Earlier phase screenshot packets are preserved. Private live provider records, credentials, backups, exports and generated files remain ignored by Git. No commit or push was performed.

## Practical limits

Two fixed API endpoints, not complete market coverage. Maximum 500 records/8 MiB per response; invalid records fail the whole import instead of silently disappearing. Source outages preserve the last successful data; absence from a partial feed is not proof of closure. Six-hour request spacing includes manual requests and retries; Retry-After can defer further. Disabling monitoring stops future scheduling, not existing queued/retrying work. A stopped worker performs no monitoring; reconciliation resumes on restart.

Keyword searches require all literal words, location filters are literal text, and reasons are transparent matches rather than AI suitability scores. Company/title duplicate candidates require owner review; no automatic cross-source merge is performed. The detail view displays the latest 20 changed snapshots; older history remains in exports/backups. Source descriptions are normalized plain text; original formatting remains available through the provider link. No live auto-application, notifications, email/calendar integration or eligibility inference.

## Remaining plan

Phase 5: cohort conversion analytics with denominators and unresolved outcomes, response timing, source/resume comparisons with sample sizes, operational summaries, isolated synthetic demo, final accessibility/responsive review and portfolio release documentation. Additional connectors, RSS, DOCX and notifications remain later extensions. Phase 5 and hosted deployment require a separate owner instruction.
