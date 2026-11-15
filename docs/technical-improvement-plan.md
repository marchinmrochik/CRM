# Technical improvement plan

Status: proposed, not implemented. Prepared November 1, 2026 against the current repository. This plan extends the original product phases; it does not reopen completed work or treat historical test counts as current verification.

Follow-up: the isolated test baseline (T0) and a security-hardening subset of T8 have since been implemented. See [test evidence](../tests/README.md) and the [November security review](security-architecture-review-2026.md). T1–T7 and the remaining T8 release work are still proposed; this update does not mark the entire plan complete.

## Objective and constraints

Improve maintainability, API reliability, search scalability, provider ingestion, accessibility and security while preserving the daily job-search workflow. Keep the TypeScript modular monolith, Next.js web application, NestJS API, PostgreSQL/Prisma and existing durable worker. No hosting, microservice split, automatic applications or multi-user expansion is included.

All documentation and code comments remain English. Product changes support EN/RU/UK. Keep owner ports 43170–43172, PostgreSQL 45432 and Redis 46379. Disposable browser tests use their existing isolated stack and ports. Never seed the personal database with demonstration data or run browser fixtures against it.

Each phase must deliver a small, reviewable result. Finish its verification and provide a code/UI walkthrough before starting the next phase. Do not combine a structural refactor with unrelated behavior changes. Major architectural choices remain proposals until their alternatives and trade-offs have been reviewed with the owner and recorded in an approved ADR.

## Sequence

| Phase | Result | Dependencies | Database change |
| --- | --- | --- | --- |
| T0 | Verified baseline and complete test isolation | None | Disposable test configuration only |
| T1 | Feature boundaries and predictable navigation state | T0 | None |
| T2 | Validated API contracts and generated client | T1 | None expected |
| T3 | Measured search and duplicate-query improvements | T2 | Evidence-backed indexes if justified |
| T4 | Resumable imports and visible source coverage | T2; T3 before large backfill | Import checkpoint and coverage state |
| T5 | Structured job metadata and new source adapters | T4 | Additive nullable fields/tables |
| T6 | Operational diagnostics and safe retention | T4; can precede T5 | Retention metadata if needed |
| T7 | Accessibility and failure-recovery quality gate | T1–T6; checks throughout | None expected |
| T8 | Security and portfolio release evidence | Earlier phases | Least-privilege roles if approved |

T0–T3 are the first implementation block. T4–T6 expand ingestion and operations. T7–T8 consolidate quality. Reassess priorities after each block using actual daily usage; a complete phase is preferable to partial changes across the whole plan.

## T0 — Establish a trustworthy baseline

1. Record current runtime versions, migrations, services, routes, commands and Git state without printing secrets.
2. Verify an owner backup through an isolated restore before migration work.
3. Run current lint, TypeScript, build and browser/domain checks; record actual results rather than copying old reports.
4. Move local database integration tests, not only browser tests, to a disposable test database. They currently rely on separate test owner IDs and require pausing the personal worker. Keep all synthetic operation claims away from the personal worker.
5. Verify CI and local test commands select the intended database/storage, clean up after failure and preserve unrelated services.

**Acceptance:** tests run while the personal workspace remains available; owner domain counts and referenced PDF checksums remain unchanged; test teardown removes only its named disposable resources.

**Review:** reproducible commands, environment boundaries and a failure/cleanup drill. Baseline reports stay free of personal content and credentials.

## T1 — Introduce feature boundaries

Extract feature modules for Today, job search, applications, resume studio, sources, analytics and operations. Keep shared primitives in a small UI layer. Move API calls, query keys and query/mutation hooks beside their owning features. Extract workspace navigation and URL parsing from the large workspace component.

Preserve current URLs and browser back/forward behavior. Define validated URL state for filters, sorting, pagination, selected listing and application/resume return context. Keep transient form state local. Avoid a new global state library unless a concrete cross-feature requirement justifies it. Load feature-specific data when needed and invalidate only affected queries after mutations.

**Acceptance:** no intended product behavior change; search reload/back/forward, resume dirty-state protection and application return links work. Today and application data refresh after relevant mutations. Review the directory map and query ownership rather than file count.

**Verification:** existing isolated journeys plus focused navigation regressions, malformed URL recovery and loading/error states. Do not create tests that merely mirror extracted component structure.

**ADR if needed:** compare feature-local query hooks, context and a global store for any actual shared-state problem. Keep the current query-driven approach as the starting recommendation.

## T2 — Make the API contract executable

Inventory the existing endpoints and request/response types. Zod runtime schemas, TypeScript interfaces and Swagger metadata must describe the same contract; do not generate a client from incomplete documentation.

Compare two realistic approaches: generate the OpenAPI document from runtime schemas, or document typed DTOs and validate their parity with runtime schemas. Recommend a single authoritative runtime contract with generated artifacts, subject to a small compatibility spike and owner review.

Define stable operation IDs, response/error envelopes, dates, nullability, pagination and enum semantics. Generate a typed client into a dedicated package, wrapped by the existing same-origin session transport. Migrate one feature first, then the remaining consumers. Keep generated files separate from handwritten adapters; never expose Prisma models as the public contract.

**Acceptance:** CI detects a stale generated client/document; incorrect requests fail runtime validation; web types match the published responses; sessions, CSRF headers and request identifiers work through the new transport. No breaking route rename is required.

**Verification:** representative success, validation, unauthorized, conflict, null and paginated responses, plus a clean generation/build from the frozen lockfile. Document additive versus breaking changes and an explicit migration policy.

## T3 — Improve search using measurements

Use synthetic representative datasets in the disposable database. Measure listing count/page, duplicate candidates and company/title matching. Capture query counts, plans and repeated-run latency on a documented machine and dataset size.

Replace per-result duplicate-count queries with an owner-scoped batch operation. Preserve case-insensitive matching and human review; candidate similarity must not silently merge applications or distinct vacancies. Add indexes only when query plans justify them. Compare PostgreSQL trigram and full-text search before changing substring/all-word semantics; do not introduce a separate search service at this stage.

Publication dates are currently stored as normalized text. Assess a migration to a timestamp column, validate legacy values and explicitly preserve unknown dates. Stable ordering must include a unique tie-breaker. Use keyset pagination only if measured depth/concurrency justifies its UI and contract trade-offs.

**Acceptance:** duplicate-query count no longer grows per displayed row; existing filter and owner-isolation semantics remain intact; unknown publication dates sort predictably. Before implementation, agree a local latency budget from the baseline rather than inventing an unsupported performance claim.

**Verification:** identical results before/after on known fixtures, Unicode/case variants, duplicate candidates across providers, deep pages and concurrent imports. Review plans and measured results alongside the UI.

## T4 — Make imports resumable and coverage explicit

Persist per-source traversal state, opaque cursors, traversal start time, page/record counters, provider update time, last success, coverage cap and completion state. Distinguish a bounded successful page batch from a fully traversed feed. Keep polling interval separate from the provider's permitted sequential page requests.

Compare page-level commits with whole-batch atomic commits. Recommend bounded page batches with an atomic checkpoint and listing upserts under the existing operation fencing model, subject to ADR review. Advance a cursor only with its successful commit; preserve personal dispositions and captured CRM/application snapshots.

Handle cursor expiry, repeated cursors, overlapping runs, network failures, 429/Retry-After, invalid records, changed formats and worker restarts. Define an explicit policy for rejecting a batch versus quarantining records. Quarantine must be bounded and private; it must never fabricate missing fields or hide import loss.

**Acceptance:** a restart resumes the permitted traversal without duplicate domain records or skipped committed pages. Sources shows freshness, coverage, partial completion, failure reason and next permitted action. Retries cannot evade quotas. Missing feed entries are not automatically marked closed.

**Verification:** fault injection before/after checkpoint commits, expired leases, stale attempts, cursor loops, queue reconstruction and provider fixture changes. Live checks are opt-in, bounded and respect provider terms.

## T5 — Normalize metadata and expand sources

Split into two separately reviewable deliveries:

1. Add optional provider-backed country restrictions, timezone restrictions, employment type, seniority and salary range/currency/period. Retain original provider text and provenance. Backfill only supported facts; unknown remains unknown. Salary filters must not silently compare different currencies or pay periods. Do not equate a remote country tag with the owner's legal eligibility.
2. Add a bounded RSS adapter for DOU/Djinni and a curated employer watchlist for Greenhouse, Lever and Ashby. Recheck official documentation, attribution and reuse conditions at implementation time. Fixed provider hosts and validated employer identifiers remain mandatory. Credential-required aggregators follow only when account settings and access conditions are available.

**Acceptance:** structured filters explain which records lack metadata; provider changes do not overwrite personal decisions; each adapter has a visible scope and attribution. Unsupported sources remain directory links rather than pretending to be connected.

**Verification:** nullable metadata, timezone/country combinations, salary-period differences, malicious/oversized XML, external entities, redirects, invalid board identifiers and duplicate imports. Review both an empty state and actual supported source records privately.

## T6 — Improve diagnostics and retention

Build on the existing PostgreSQL operation ledger and worker heartbeat. Separate service health, source freshness, individual run status and historical failed attempts. Expose retry eligibility, next attempt time, interrupted-run recovery and correlation IDs in owner-readable language.

Add operational summaries and redacted structured logs without recording resume text, candidate contacts, cookies or API keys. Introduce retention only after defining what is disposable versus immutable evidence. For orphaned artifacts, start with a dry-run report, database-reference checks, a grace period and reversible quarantine; recheck references immediately before any removal. Protect backups and active/in-flight publication files.

**Acceptance:** the owner can tell what failed, why, whether a retry happened and what action is available. Retention cannot delete referenced PDFs or application evidence. Cleanup is observable, bounded and safe to repeat.

**Verification:** worker termination, database/Redis outage, provider outage, retry exhaustion and artifacts created just before a crash. Verify recovery using disposable data and an isolated backup restore.

## T7 — Accessibility and practical resilience

Audit keyboard navigation, focus after selection/navigation, dialog focus restoration, dirty-form warnings, labeled controls, status announcements, readable errors and contrast. Verify search/Today/application/resume flows at mobile widths and increased text size. Test loading, slow responses, connection loss, session expiry, empty results and resuming work after reload.

Keep automated accessibility checks focused on critical pages and supplement them with manual keyboard/screen-reader checks. Review task completion with the owner: find a suitable role, prepare a truthful resume, record submission, schedule a follow-up and recover from an error. Measure confusing steps and unnecessary actions rather than assigning an unverified perfect score.

**Acceptance:** no keyboard trap, lost unsaved resume edits or inaccessible primary action in reviewed flows. Errors identify a useful next step. Record remaining accessibility limitations honestly.

## T8 — Security and portfolio evidence

Add secret/dependency scanning and a repeatable vulnerability-triage policy. Evaluate PDF parsing/resource limits for uploads. Recheck session expiration/logout, CSRF, rate limits, owner isolation, unsafe destinations, log redaction and artifact access. Separate migration credentials from a least-privilege runtime role if approved and prove required functionality still works.

Run synthetic-only CI and review artifact retention for accidental personal-data capture. Update architecture diagrams, approved ADRs, startup instructions and sanitized screenshots. Include reproducible performance and recovery evidence; do not publish provider dumps, personal resumes, credentials or backups.

**Acceptance:** a clean checkout can build and run the documented local workflow; security findings have severity and disposition; private files are excluded from Git and build contexts. Remote CI success is claimed only after an authorized push and observed run.

Hosting remains a separate request and review. HTTPS ingress, trusted proxy configuration, secure cookies, external backup storage and threat testing must be addressed before public exposure; this phase does not authorize deployment.

## Shared phase completion checklist

- State the problem, chosen scope and user-visible effect.
- Record approved major decisions and migration/recovery steps where relevant.
- Run lint, typecheck and appropriate tests; add targeted checks for new behavior.
- Build affected runtime images and inspect the rendered desktop/mobile workflow when UI changes.
- Confirm personal records and referenced artifacts were not replaced by fixtures.
- Provide a concise review packet: changes, evidence, known limits and next phase.
- Do not commit, push, publish or begin another major phase without the owner's corresponding instruction.
