# Phase 3 Design: Durable Operations and Optional AI

Status: implementation proposal authorized by the owner on October 5, 2026. Major decisions remain reviewable until owner approval; no accepted ADR is added automatically.

## Architecture alternatives

| Problem           | Alternatives                                                                                     | Recommendation and trade-off                                                                                                                      |
| ----------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Durable execution | API-only synchronous work; PostgreSQL polling worker; Redis/BullMQ worker with PostgreSQL ledger | BullMQ transport plus PostgreSQL ledger, matching the phase plan. Extra Redis service, but queue loss cannot erase the operation or its attempts. |
| Worker packaging  | Separate microservice repository; same API package with separate process; API process worker     | Separate process in the API package. Share domain code and deployment image; no network service boundary for domain writes.                       |
| AI integration    | OpenAI SDK throughout domain; provider interface with HTTP adapter; local model only             | Provider interface with optional OpenAI Responses adapter. No vendor types in domain contracts, no key required for manual workflows.             |
| PDF isolation     | Render in API; worker event loop; bounded child process                                          | Child process with termination deadline. Prevent layout from blocking lease renewal and kill pathological work.                                   |

## Durable state

PostgreSQL owns run state, immutable input snapshots, attempts, safe error codes/reasons, retry schedule, accepted AI output and per-suggestion decisions. Redis transports only run identifiers and generation numbers. Queued rows are an outbox: the worker repeatedly dispatches them, including after queue loss. Deterministic generation-specific job IDs and transactional claims tolerate duplicate delivery.

Run states: queued, running, retrying, succeeded, failed. Each real execution adds an attempt. A database lease and active attempt token fence late workers. Expired leases mark the interrupted attempt explicitly before retrying. Three automatic attempts use bounded exponential backoff; manual retry extends the budget for eligible transient failures and preserves previous attempts. Permanent configuration, stale input and invalid output failures do not retry automatically.

Worker heartbeats are persistent; readiness distinguishes a stopped worker, unavailable Redis, and disabled/configuration-incomplete AI. A built-in synthetic diagnostic exercises success, transient failure/recovery, permanent failure and interruption without candidate data or provider requests.

Request limits allow 600 reads and 120 mutations per IP/minute, with a separate 10-login/minute gate. Status polling remains compatible with the normal workflow without removing mutation/login protection.

## Resume publication

Explicit publication approval schedules a PDF operation for the saved draft revision. The worker renders in a bounded child process, then commits version, artifact identity, draft revision, successful attempt and run result together. Duplicate or late attempts cannot publish twice. Profile/draft changes fail with a visible stale-input reason. Existing uploaded and published PDFs remain available during queue outages.

## AI workflow

Owner explicitly confirms sending the captured vacancy and approved resume facts to the configured provider. Contacts are omitted. The adapter uses a fixed HTTPS OpenAI endpoint, configured model, strict structured output, no tools, bounded input/output and a timeout. API keys are read only by the worker and never returned or logged.

Output contains exact vacancy quotes with approved fact references and optional text-only suggestions for existing blocks. Runtime validation rejects invented references, unsupported claims marked supported, mismatched quotations, duplicate targets and excessive text. Structural grounding cannot prove semantic truth; the owner reviews every suggestion. Accept/reject decisions are persisted independently. Acceptance modifies only the saved draft at the expected revision and rechecks the current profile; it never publishes or changes sent applications. Existing publication diff/approval is still required.

Without a key the analysis action is disabled with a reason. Provider fixtures are test-only, never a substitute presented as real AI. Live paid provider testing requires owner configuration and is not part of CI.

## Sources

- [BullMQ stalled jobs](https://docs.bullmq.io/guide/workers/stalled-jobs)
- [BullMQ retries](https://docs.bullmq.io/guide/retrying-failing-jobs)
- [OpenAI structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs)

## Verification

Test duplicate claims, lease expiry and late results, Redis/outbox recovery, retries and preserved failures, permanent failures, snapshot invalidation, provider refusal/invalid output/rate limits, absent keys, individual decisions, atomic PDF publication and owner isolation. Check complete flows in the rendered browser, including English/Russian/Ukrainian and mobile layouts. Back up the PostgreSQL ledger with artifacts; Redis is reconstructible transport.
