# Database

The Prisma schema covers identity, tenancy, websites, audits, scoring, revenue, reports, monitoring, billing, API access, webhooks, agencies, prospects, testimonials, and admin logs. UUIDs, UTC timestamps, tenant indexes, composite uniqueness, and targeted cascades are used. Evidence and diagnostic metadata use JSON only where flexible structure is necessary.

High-volume AuditRun, AuditFinding, MonitoringRun, ApiUsage, and WebhookDelivery tables should later gain partitioning/archival, read replicas, pooling, and aggregation strategies.
