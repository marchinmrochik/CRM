# Phase 3 Review

## Delivered increment

Durable background operations with a PostgreSQL run/attempt ledger, Redis/BullMQ transport, a separate worker, transactional claims, lease fencing, heartbeat and outbox reconciliation. PDF publication now runs in a bounded child process and atomically commits its version/artifact with the successful attempt and run result. Automatic retries and owner-requested retries preserve every earlier failure and identify the worker and trigger.

The optional provider-independent AI boundary has one OpenAI Responses adapter. It extracts exact vacancy quotations, maps approved evidence and proposes wording for existing blocks. Contacts are omitted and outbound analysis requires explicit consent. Requirements require review before import; suggestions require individual accept/reject decisions. Accepted wording modifies only the saved draft, and immutable publication still requires the Phase 2 diff/accuracy approval.

The interface remains English/Russian/Ukrainian, including desktop and mobile operation history. PostgreSQL, Redis, API, worker and web remain on project-specific ports.

## Owner walkthrough

1. Open System activity. Inspect worker/Redis/AI health.
2. Run the transient diagnostic. Inspect failed attempt 1 and successful automatic attempt 2.
3. Run the exhausted diagnostic. After three failures, retry manually and inspect the successful fourth attempt. Earlier failures remain visible.
4. Run the permanent diagnostic and confirm there is no retry action.
5. In Resumes, review a saved draft and publish. Observe its queued/running operation, then open the immutable version/PDF and pin it to an application.
6. Without an AI key, verify manual tailoring/publication still work. To enable AI, follow the private configuration instructions in README; save the draft and consent before analysis.
7. Review extracted quotes/evidence. Import only after confirmation. Accept/reject each suggestion separately, then inspect the publication diff. Profile/source changes invalidate old approvals rather than silently migrating suggestions.

Public review screenshots and browser examples are synthetic. The AI screenshot uses a validated test-only completed analysis, not a live paid provider response. No mock AI provider is available in production settings.

## Code review map

| Area                                    | Entry points                                                                                                                 |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Ledger and audit metadata               | `apps/api/prisma/schema.prisma`, migrations `20261005150000_durable_operations` and `20261005160000_attempt_triggers`        |
| Claims, leases, retry budget, decisions | `apps/api/src/operations.service.ts`                                                                                         |
| Routes and authorization                | `apps/api/src/operations.controller.ts`, existing session/CSRF middleware                                                    |
| Reconciliation and transport            | `apps/api/src/worker.ts`                                                                                                     |
| Isolated rendering/provider execution   | `apps/api/src/task-child.ts`                                                                                                 |
| AI contract, validation and adapter     | `apps/api/src/ai.provider.ts`                                                                                                |
| Atomic publication                      | `apps/api/src/resume.service.ts`                                                                                             |
| History, review and localization        | `apps/web/components/operations-workspace.tsx`, `resume-workspace.tsx`, `translations.ts`                                    |
| Runtime and startup                     | `compose.yaml`, `scripts/app.ps1`, `.env.example`                                                                            |
| Tests and disruption drill              | `tests/operations.test.ts`, `tests/e2e/operations.spec.ts`, `tests/e2e/suggestions.spec.ts`, `scripts/verify-operations.mjs` |

## Verification

Verified locally on October 5, 2026:

| Check               | Result                                                                                                                                                                                                                      |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Vitest              | 29 tests passed, including duplicate claims, atomic publication, expired-lease fencing, automatic/manual/recovery triggers, permanent failures, explicit suggestion decisions, stale evidence and mocked provider contracts |
| Playwright          | All 6 scenarios passed: CRM, localization, operation recovery/history, queued PDF publication, security and individual AI review                                                                                            |
| Final UI refinement | Publication and suggestion scenarios passed again after adding immediate library refresh and failure-state unlocking                                                                                                        |
| Static/build checks | ESLint and TypeScript passed; production Docker API/worker/web builds passed                                                                                                                                                |
| Disruption drill    | Synthetic transport-job removal reconciled successfully; worker SIGKILL preserved an interrupted attempt and recovered; queued requests survived Redis unavailability                                                       |
| Backup restore      | Isolated database restore passed; all 21 referenced artifacts in the verified backup passed checksum verification                                                                                                           |
| Restart persistence | CRM/profile/draft/version records, full operation/attempt/decision history, session and generated PDF bytes survived PostgreSQL/API/web/worker/Redis restart                                                                |
| Visual review       | Desktop/mobile history and synthetic suggestion review inspected; English/Russian/Ukrainian checks passed, with no horizontal overflow at 390 px                                                                            |
| Git audit           | No credential matches in candidate files; private runtime data/backups excluded and whitespace diff check passed                                                                                                            |

Screenshots: [automatic recovery](reviews/phase-3/recovery.png), [mobile attempt history](reviews/phase-3/mobile-history.png), and [synthetic suggestion review](reviews/phase-3/suggestions.png). Earlier phase review screenshots were preserved.

The disruption drill does not flush Redis or delete project volumes. No live paid AI call was made. Phase 3 remote CI results are pending the owner's commit/push; local results are not described as GitHub results.

## Limits and trade-offs

- Redis is transport; PostgreSQL queued rows are the outbox. Dispatch may be delayed by the two-second reconciliation interval. No separate microservice or distributed exactly-once claim is introduced.
- Worker leases last 30 seconds and renew every five seconds. Worker health is considered stale after 20 seconds. Two tasks run concurrently; PDF child deadline is 12 seconds, AI child deadline is 50 seconds.
- Automatic retries are limited to three total attempts with exponential backoff. Manual retry extends the same run by three attempts, capped at 30; permanent validation/configuration failures require correcting input/configuration and starting from a newly saved draft.
- Run state uses `retrying`; interruptions are preserved failed attempts with `WORKER_INTERRUPTED`, and the next attempt has trigger `recovery`. Cancellation and per-step traces remain future extensions.
- Only the latest 100 runs are shown per history view; full owner history remains in the JSON export/backup. Retention/purge is not implemented.
- Model output validation proves structural grounding, not semantic truth. The owner must check suggested wording. AI never changes profile facts or publishes automatically.
- The adapter uses a configured model; no default model or key is supplied. Live API availability, model access, output quality and charges are unverified without owner configuration. A timeout can produce ambiguous provider completion and repeat charges on retry.
- AI keys and raw provider error bodies are not returned or logged. Provider model configuration is private `.env`; the adapter has a fixed HTTPS endpoint and no tools.
- Database/publication failures roll back new artifact references and remove the newly written file. A process kill between filesystem write and database commit can leave an unreferenced private PDF; automated orphan purge remains deferred to avoid deleting unknown files.
- Stopping the worker is required before direct ledger integration tests so it cannot claim synthetic fixtures. Browser and recovery checks require the full running stack.
- Redis uses loopback host access and the trusted local workspace boundary. Hosted deployment needs separate credential/network hardening.

## Review gate and remaining plan

Stop here for owner code and visual review. Phase 4 adds supported vacancy discovery/monitoring: first one RSS/API source, then another, saved searches, normalization, provenance, deduplication and source outage history. Phase 5 adds conversion/cohort analytics, source/resume comparisons with sample sizes, isolated demo data and portfolio/deployment documentation. DOCX, additional templates/connectors, notifications and other integrations remain later extensions. Git commit/push and hosted deployment remain owner-controlled.
