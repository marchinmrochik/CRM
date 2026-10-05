# Worker Application Boundary

Reserved for durable background operations in Phase 3. No worker process or Redis service is started in the current bootstrap.

Reuse backend domain services; own job execution, heartbeat, cancellation, retries, and recovery. Reserved health port: `43172`.
