# Worker Application Boundary

The Phase 3 worker runs as `apps/api/src/worker.ts` in a separate process using the API package and Docker image. This folder remains reserved for a later package split if independent dependencies justify it.

It reuses backend services and owns dispatch/reconciliation, heartbeat, bounded task child processes, retries and recovery. Local health port: `43172`; Redis host port: `46379`. Cancellation is a future extension. See [Phase 3 design](../../docs/phase-3-design.md).
