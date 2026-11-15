# Phase 5 — Analytics and portfolio release

Implementation proposal for owner review. No new architecture ADR is accepted automatically.

## Analytics choices

Current-status counts are easy but erase prior offers after rejection/reopening. Inferring every funnel step from later progress manufactures evidence. Recommended: submission cohorts and distinct observed milestones, with explicit dates and append-only corrections. Status-change events preserve actual offers; completed interview events provide interview evidence at their recorded completion time. Recruiter responses and human interactions require explicit owner records. Later stages do not imply missing earlier stages.

Each stage shows unique applications / submitted cohort and a conditional transition (applications with both stages / applications with the preceding stage). Skipped evidence can make stage totals non-monotonic. Current unresolved outcomes are reported separately from no recorded response: silence is not classified as rejection. Reopening changes current outcomes, not historical milestones. Future events and events before submission are excluded and reported as evidence issues. Explicit owner milestones can be voided; they remain in the timeline and exports.

Dates use UTC inclusive submission days, with an end-of-day exclusive boundary and one report as-of timestamp. Drafts and future submissions do not enter the cohort. Response latency uses the first valid recorded recruiter response, reports its sample size, median and p90; unanswered applications never become zero-duration responses. Comparisons use the captured source and the immutable artifact/version actually submitted. Sample sizes and unresolved outcomes accompany every comparison; no causal ranking or ATS success claim is made. Fewer than five applications is flagged as a small sample, a UI heuristic rather than a statistical significance test.

A pure shared TypeScript analytics package is recommended over separate web/API calculations (risk of drift) or a database-specific aggregate-only implementation (harder fixture verification). PostgreSQL owner-scoped queries gather evidence under a consistent transaction; workspaces above 10,000 applications fail explicitly rather than silently truncate. Detail rows show at most 50 applications; aggregate calculations still use the full cohort. Operational summaries use run creation dates, separate from the application submission cohort.

## Demo and deployment choices

Seeding the owner database risks leakage; a second demo database increases setup and credential costs. Recommended: immutable synthetic fixtures and a read-only demo explorer sharing the same analytics calculation and presentation. `/demo` performs no API requests and does not use owner cookies/data. A separate `compose.demo.yaml` build disables API proxy rewrites, serves the demo at the root, has no database/worker/Redis/secrets/volumes and binds loopback port 43173. Hosted publication is outside this phase and requires a reviewed configuration. The private owner deployment retains authentication and its existing ports.

## Delivery and checks

1. Shared calculation contract, fixtures and known-answer tests.
2. Owner milestone recording/correction, analytics API/export and operational summary.
3. Localized responsive analytics and application evidence UI; cohort/source/resume exploration.
4. Synthetic demo with isolated launch and privacy tests.
5. Build/test/browser gates, accessible tables and keyboard journeys, public screenshots, README and deployment instructions.

Verify repeated/skipped milestones, corrections, reopened applications, zero denominators, delayed/future evidence, cohort boundaries, response latency, source/resume attribution, owner isolation and export parity. Browser checks include the full owner scenario and demo filtering/preview in EN/RU/UK at 390 px. Preserve earlier phase review artifacts. Live AI and third-party feeds remain optional and are not called by the demo or CI.

## Superseding scope

The owner subsequently removed the demo and deferred hosting. Demo details above record the original Phase 5 scope; `codebase-review.md` records the current implementation.
