# Queues

Reserved queues: audit, audit-page, audit-finalize, monitoring, report, prospect, email, webhook, cleanup. The worker uses Redis, bounded concurrency, exponential retry defaults, and retained completed/failed jobs. Production handlers must add idempotency keys, timeouts, dead-letter routing, and deterministic job IDs.
