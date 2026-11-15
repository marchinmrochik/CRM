# Phase 5 Review

## Delivered increment

Submission-cohort analytics with full and adjacent-stage denominators, real response timing, explicit unresolved outcomes and ages, captured-source and actually-sent resume comparisons, sample sizes, evidence gaps, reopening history and operational summaries. All calculations share one pure TypeScript package between API and demo. No ATS score, automatic application or fabricated funnel progress is introduced.

Applications now accept actual dated milestone records and append-only corrections with reasons and optimistic revision guards. Generic status changes do not manufacture recruiter/human contact. Historical offers and completed interviews remain evidence after status changes. See [analytics contract](analytics.md) for legacy completion-time limits and exact definitions.

A read-only synthetic explorer is available at `/demo` without authentication or API calls. A separate Docker demo project on 43173 has no API proxy, owner secrets, private data mounts, database, queue or worker. It can run alongside the owner application. The login page links to the demo. Demo interactions include cohort/source/resume filtering, example application inspection and synthetic resume preview in EN/RU/UK.

README now leads with a synthetic screenshot and Docker-only demo startup. Deployment documentation distinguishes local owner access, isolated demo hosting and remaining private-hosting requirements. CI includes a separate demo build/isolation gate. No hosted deployment, commit, push or remote green CI claim is made.

## Code map

| Boundary                                             | Files                                                                                                                                                           |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Shared evidence calculations and synthetic fixtures  | `packages/analytics/src/index.ts`, package/build manifests                                                                                                      |
| Owner report/export and guarded recording/correction | `apps/api/src/analytics.service.ts`, `analytics.controller.ts`, `main.ts`                                                                                       |
| Analytics, evidence and demo UI                      | `apps/web/components/analytics-workspace.tsx`, `milestone-form.tsx`, `demo-workspace.tsx`, `application-detail.tsx`, `workspace.tsx`                            |
| Isolated demo route/runtime                          | `apps/web/app/demo/page.tsx`, `app/page.tsx`, `next.config.ts`, `Dockerfile`, `compose.demo.yaml`                                                               |
| Localization and readability                         | `apps/web/lib/translations.ts`, `lib/api.ts`, `app/globals.css`                                                                                                 |
| Verification/release                                 | `tests/analytics*.ts`, `tests/e2e/analytics.spec.ts`, `demo-isolation.spec.ts`, `scripts/verify-demo.mjs`, `verify-persistence.mjs`, `.github/workflows/ci.yml` |

No new migration was needed: explicit milestones/corrections use the existing application event ledger and are already included in owner JSON export schema version 4. Analytics report/export schema is version 1.

## Owner walkthrough

1. Open an existing submitted application. Record actual recruiter response, human interaction and interview dates with evidence notes. Correct an explicit record with a reason; inspect its original and correction in the timeline, then record a replacement.
2. Open Analytics. Choose inclusive UTC submission dates and a captured source or sent resume. Inspect each denominator and the applications missing earlier evidence. Compare unanswered with unresolved counts, median/p90 and timing sample sizes. Inspect the latest 50 detail applications or open their published resume version.
3. Export the loaded report. Reopening an application changes its current outcome without erasing historical offers/contacts. Invalid date ranges retain a clearly labeled previous valid report until corrected.
4. Inspect the operational summary, then System activity/Source history for individual failed attempts and retry reasons.
5. Open the standalone demo. Explore source/resume filters, click a synthetic application and preview its synthetic resume. Switch RU/UK, use the keyboard and narrow viewport. It needs no owner password and reads no personal state.

## Verification evidence

Verified locally on October 5, 2026:

- 57 Vitest tests passed across nine files, including known-answer analytics, earliest/repeated/skipped milestones, offer/reopening preservation, corrections, invalid/future evidence, UTC boundaries, median/nearest-rank p90, null denominators, bounded detail/full aggregates, immutable attribution, owner isolation and operation history, plus earlier phase regressions.
- All 10 Playwright scenarios passed in the full final run, including the isolated demo enabled with `DEMO_BASE_URL`. New checks cover recording/correction, native-dialog Escape, filtered analytics/export parity, invalid-filter recovery, anonymous demo access with zero API requests, synthetic application/resume inspection, EN/RU/UK and 390 px page width.
- Lint and TypeScript checks passed. Production API/worker/owner-web and separate demo images built successfully from the frozen lockfile; consumers build the shared package first.
- `scripts/verify-demo.mjs` passed: one healthy service, no owner secret/configuration variables, no mounts, no data services, and 404 private API routes. The standalone browser additionally verifies no owner session cookie.
- Visible keyboard focus, labeled controls, table captions/column/row headers, focusable horizontal table regions and text rather than color-only metrics were verified. Muted text, table headings, eyebrows and info banners were darkened after contrast spot checks; this is not a complete screen-reader/conformance audit.
- Public screenshots use synthetic content only. Earlier phase screenshots are preserved. Private runtime data, PDFs, live feed records, backups and test traces remain ignored by Git.

Screenshots: [historical synthetic owner cohort on mobile](reviews/phase-5/owner-mobile.png).

- The final project restart drill passed: milestone event/correction history, cohort stages, response timing, source/resume comparisons, domain snapshots, owner session and PDF bytes survived PostgreSQL/API/web/worker/Redis restart.
- Backup `backups/2026-10-05T13-30-58-492Z` restored successfully into an isolated temporary database; 26 referenced PDF artifacts passed checksum verification. The live database was not overwritten.
- Owner API/web/worker/PostgreSQL/Redis and separate demo services are healthy. Earlier phase screenshots match their pre-phase-5 copies byte-for-byte. Final Git candidate audit found no local credential matches or credential patterns; no commit/push was performed.

## Practical limits and remaining work

Analytics describe owner-recorded observations rather than controlled causal effects. Explicit response/contact history starts when recorded; missing data is visible and is never inferred from a later stage. Legacy interview completion time is its recording time. Source/resume groups can differ by geography, vacancy quality and chronology. Small-sample labeling is a heuristic. Workspaces above 10,000 applications require a later aggregate/offline path; only 50 detail rows are displayed, while supported aggregates remain complete.

The demo is intentionally read-only and uses fixed synthetic as-of time; local language preference can persist. It does not simulate live AI, integrations or durable editing. The current owner deployment remains single-owner loopback HTTP with a bootstrap database role; hosted private use requires the ingress/cookie/proxy/database/backup work in [deployment](deployment.md). No automated source/resume ranking or universal ATS compatibility is promised.

All five implementation increments are delivered for owner review. Remaining actions are owner code/visual review, user-controlled commit/push and confirmation of remote CI after publication. Hosted demo/private deployment is a separate explicit action. Later extensions include more supported connectors/RSS, DOCX, notifications, calendar/email integrations, local AI and multi-user access, selected from actual usage.

## Subsequent owner request

On October 5, 2026 the owner deferred hosting and requested removal of the demo. The demo application, route, build target, Compose project, synthetic runtime exports and demo screenshots were removed. The verification evidence above records the historical Phase 5 state. Current verification and source coverage are recorded in `codebase-review.md` and `job-source-research.md`.
