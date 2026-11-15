# Daily workflow release

The daily workspace prioritizes reviewing jobs, preparing applications and following up. Search filters, sort, page and selected listing persist in the URL. Text queries are debounced and previous results remain visible while loading. Publication sorting puts unknown dates last; import sorting remains available. Search saving is collapsed to keep results closer to the top.

Imported listing details offer direct application preparation and tailored-resume creation. Both retain explicit promotion, existing duplicate-application confirmation and manual resume approval. Resume creation preselects the originating vacancy. The overview presents overdue and upcoming actions, scheduled interviews within the next seven days, unseen jobs and draft-application counts. Lists are capped at 20 and do not fabricate evidence or automatically submit applications.

## Verification

The daily workflow is checked with TypeScript, lint, 59 domain/integration tests and eight isolated browser journeys. The discovery journey verifies URL restoration after reload, a preselected resume vacancy, return to the application, and mobile width. Browser fixtures run only in the disposable E2E stack. No personal workspace seed data is added.

## Later portfolio engineering backlog

See [the phased technical improvement plan](technical-improvement-plan.md) for dependencies, acceptance criteria, review checkpoints and verification.

- Split workspace orchestration into route-focused modules and shared query contracts.
- Add OpenAPI-generated client contracts and documented API compatibility policy.
- Batch duplicate detection and add search indexes after representative profiling.
- Add provider contract monitoring, resumable backfill and coverage metrics.
- Add structured country, timezone, contract and salary metadata with unknown states.
- Add RSS and curated employer-board adapters with provider-specific terms.
- Improve observability dashboards, retention and orphan-artifact cleanup.
- Expand accessibility audits and realistic usability sessions.
- Add dependency/security scanning, least-privilege database roles and deployment hardening before hosting.
- Record ADRs and publish benchmark/recovery evidence after the daily workflows stabilize.
