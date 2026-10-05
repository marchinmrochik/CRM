# Execution Status and Observability

## Required behavior

The owner can answer: what ran, whether it succeeded, where it failed, why it failed, whether it retried, who requested the retry, and what happened after process recovery.

Separate three concepts:

1. Service health: process, database, queue, and connector availability.
2. Logical operation: one import, extraction, comparison, export, or search evaluation.
3. Attempt: one execution of that operation, including retry and interrupted execution history.

## Logical run model

Run states: `queued`, `running`, `retry_wait`, `succeeded`, `failed`, `cancelled`, `interrupted`.

```text
queued -> running -> succeeded
running -> retry_wait -> queued
running -> failed
running -> interrupted -> retry_wait | failed
queued | retry_wait -> cancelled
running -> cancelled (only after cooperative cancellation acknowledgment)
```

Store run ID, operation type, subject ID, initiator, creation/start/finish timestamps, last heartbeat, current step, attempt count, retry limit, next retry time, safe error category/message, request/trace ID, input revision, and related prior run ID.

Each attempt stores its own number, worker/process identity, trigger (`initial`, `automatic_retry`, `manual_retry`, `recovery`), step history, timestamps, heartbeat, outcome, and failure classification. Completed attempt records are never overwritten by a later success.

Percentages are shown only when a trustworthy total exists. Otherwise show named steps and elapsed time.

## Failure categories and retry policy

| Category | Default behavior |
| --- | --- |
| Network timeout / temporary upstream failure | Bounded exponential backoff with jitter |
| Provider rate limit | Respect retry timing where supplied; bounded retry |
| Database/queue temporary outage | Retry safe operations after dependency recovery |
| Invalid configuration / missing credentials | Fail with a corrective action; no automatic retry loop |
| Authentication/authorization failure | Require configuration correction |
| Invalid input / unsupported source format | Fail with validation details |
| Invalid AI schema / unsupported fact reference | Bounded repair attempt, then fail reviewably |
| Lost worker heartbeat / process exit | Mark attempt interrupted; reconcile before requeue |

Proposed initial policy: one initial attempt plus at most two automatic retries for transient failures. Per-operation overrides require a documented reason. Persist the policy used for each run.

Manual retry creates a new run linked to the failed run, preserving old history. The UI previews the action, rejects ineligible retries, and prevents concurrent equivalent runs. A restart button must not imply that the whole service needs restarting.

## Restart and delivery semantics

Workers provide at-least-once execution, not an exactly-once promise. Use stable idempotency keys and database constraints so redelivery does not duplicate vacancies, published versions, or artifacts.

Use leases/heartbeats and ownership checks. A worker that loses its lease cannot finalize the operation. A restart records a new service instance; stale attempts are classified as interrupted, then safely retried or failed according to policy. Queue stalled-job handling and database reconciliation must agree on attempt ownership to avoid double scheduling.

Queue persistence alone does not make database/enqueue writes atomic. Phase 3 introduces a transactional outbox or equivalently documented reconciliation mechanism. A committed operation must eventually be enqueued, and duplicate enqueueing must be harmless.

For external AI calls, a timeout may occur after the provider processed a request. Record ambiguous completion and potential duplicate cost; do not claim external side effects are exactly once.

## UI

System activity lists operation type, subject, state, current step, elapsed time, attempt count, last error, and next retry. Detail shows a chronological attempt/step history and links to the affected vacancy/resume/source.

Source cards distinguish disabled, healthy, degraded, failed, and never run; show last attempted run separately from last successful import. Service health displays the observation time and becomes `unknown` when observations are stale.

If the API itself is unreachable, the web UI shows connection failure rather than a misleading green status. Container/process recovery history outside the API is available through the documented infrastructure status/log command. The application cannot report its own total outage while it is offline.

## Logs and metrics

Emit structured JSON logs with timestamp, severity, service, instance ID, request ID, run ID, attempt, step, duration, and safe error code. Stack traces stay in protected diagnostic logs. Never log resume contents, secrets, full authorization headers, or private connector payloads.

Initial metrics: HTTP latency/error count, run outcomes, attempt/retry count, queue depth/oldest age, import counts, last successful source sync, and worker heartbeat age. Use a lightweight owner dashboard first; a separate monitoring stack is optional later.

Proposed retention: full operation/attempt records for 90 days and local rotating diagnostic logs for 14 days. Application history and submitted resume versions are not operational logs and remain until explicit archival/purge. Retention is configurable and reviewed before hosted deployment.

## Acceptance scenarios

- Force an import timeout: the UI shows its step/error and automatic retry timing.
- Force invalid credentials: failure is actionable and no retry loop occurs.
- Stop the worker mid-import: old attempt becomes interrupted and recovery history remains visible.
- Redeliver an import: no duplicate vacancy is created.
- Fail PDF generation: draft/version stays available; retry does not overwrite the submitted artifact.
- Disconnect the API: the web UI reports unavailable status and preserves unsaved input where possible.
