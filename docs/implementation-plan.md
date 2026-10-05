# Implementation Phases and Review Gates

## Delivery protocol

Each phase is a complete vertical increment: domain behavior, API, persistence, UI, errors, verification, and documentation. End with a review packet and stop for owner review. Do not proceed automatically to the next phase. Necessary fixes to the current phase remain within that phase.

The review packet includes scope, startup instructions, migrations, changed areas, browser walkthrough, screenshots, test results, known limitations, and proposed next scope. Use synthetic fixtures for public artifacts. A build passing is not visual verification: inspect the running interface after reload.

Create one logical phase branch/commit sequence. The local Git repository is initialized; the owner handles the initial commit and remote publication.

## Phase 0 — Approve the product and architecture

Deliver English product specification, screen/flow sketches, logical schema refined into an ERD, API outline, security boundaries, port map, operational state machine, and approved decision records.

Review the main scenario, lifecycle corrections, resume immutability, source limits, deployment assumptions, and architecture alternatives. No application scaffolding is required. Current documents are the starting proposal, not the final physical schema.

**Exit:** owner approves the first implementation scope and major architecture choices.

## Phase 1 — Foundation and usable manual CRM

Build the workspace, Docker PostgreSQL persistence, configuration validation, migrations, API/web skeleton, and owner access. Add companies, manual vacancy capture, application drafts/submission, table filters, status history, notes, next actions, basic interview scheduling/completion, and existing-resume upload/linking. Include a source directory with external search links and simple application totals.

Complete a single application detail screen rather than distributing unfinished features across many pages. Provide health endpoints, structured request logs, safe error responses, and an initial System activity service-health panel. Database writes and uploaded documents survive restart. Include JSON/CSV export and a documented backup/restore workflow.

**Visual review:** add a vacancy, prepare an application, attach the actual resume, mark submitted, update status, record an interview, inspect history, filter applications, and reload.

**Verification:** transaction/event consistency, owner isolation, upload validation, filter/pagination behavior, persistence after restart, backup restoration, occupied-port startup failure, and one full Playwright CRM journey. Provide an all-container launch profile.

**Exit:** the owner can use the CRM instead of a separate spreadsheet. No AI or automatic source import is required.

## Phase 2 — Structured resumes and manual tailoring

Build approved profile facts, a structured resume editor, manual requirement extraction/mapping, before/after review, immutable versions, and one PDF export template. Pin the selected version to a submitted application and retain the original vacancy snapshot.

**Visual review:** create a profile, tailor a draft to a vacancy, review changes, publish/export, submit with that version, edit the base draft, and confirm submitted evidence remains unchanged.

**Verification:** revision conflicts, immutable versions, missing-evidence handling, download authorization, PDF text extraction, rendered page layout, and the full manual tailoring journey. Exports may be synchronous with explicit timeout/error handling at this scale; durable export jobs follow in Phase 3.

**Exit:** truthful vacancy-specific resumes can be prepared without AI.

## Phase 3 — Durable operations and optional AI

Introduce Redis/BullMQ, a worker, persistent run/attempt records, heartbeats/leases, outbox/reconciliation, retry policies, and System activity history. Move suitable document exports to durable jobs. Add the AI provider interface and one adapter for structured extraction and grounded suggestions.

AI runs use approved profile revisions and vacancy snapshots. Validate output references, show individual suggestion approval, and keep manual workflows available with AI disabled.

**Visual review:** run analysis, inspect progress, review suggestions, simulate failure, inspect the reason, observe retry, and manually rerun an eligible failure.

**Verification:** mocked provider contracts, invalid output, absent key, transient/permanent errors, worker termination/recovery, duplicate delivery, database/queue enqueue consistency, and preservation of historical failures after success. Live AI smoke testing is optional with owner-provided configuration, never required by CI.

**Exit:** background behavior is understandable and recoverable; AI cannot silently change approved experience.

## Phase 4 — Discovery and monitoring

Research and implement one supported RSS/API connector first, then a second through the same boundary. Add scheduling, normalization, provenance, snapshots, repeat-import safety, reviewable duplicates, saved searches, explanations, and seen/shortlist/dismiss actions.

**Visual review:** configure a source, import vacancies, inspect matching reasons and unknown eligibility, save a search, promote a vacancy to an application, and inspect a source outage.

**Verification:** fixture-backed connectors, format changes, rate limits, incremental/repeated imports, scheduler overlap, unsafe destinations, and stale source health. Confirm actual source terms/limits before enabling each integration.

**Exit:** supported sources regularly expand the owner's opportunity database without flooding it with duplicates.

## Phase 5 — Analytics and portfolio release

Build cohort-based milestone analytics, response timing, source/resume comparisons with sample sizes and unresolved outcomes, and operational summaries. Finish isolated demo mode, responsive/accessibility checks, reproducible startup, public README/screenshots, and deployment documentation.

**Visual review:** investigate a synthetic search cohort, inspect denominators, compare sources, explore a resume version, and browse the demo without accessing personal data.

**Verification:** known-answer analytics fixtures, skipped/repeated stages, reopened applications, export consistency, complete demo isolation, CI gates, and production build smoke checks. Hosted deployment remains a separate explicit action with a concrete reviewed configuration.

**Exit:** the repository demonstrates a coherent product and the private workspace supports a real search.

## Later extensions

DOCX export/import, additional resume templates, more supported connectors, notifications, browser capture extension, interview preparation, email/calendar synchronization, local AI adapters, and multi-user access. Select these from actual usage rather than adding them to the first release.
