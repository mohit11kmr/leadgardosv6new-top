---
name: queues
description: BullMQ/Redis job queue rules for apps/worker in LeadGuard OS V6 — queue definitions, retry/idempotency, and the outbox pattern. Use when adding a job type or debugging stuck/duplicate jobs.
---

# Queues (BullMQ + Redis)

## Purpose
Keep background jobs idempotent, crash-safe, and debuggable — this codebase has already fixed several real bugs in this area (see Failure conditions).

## When to use
Adding a new BullMQ queue/job, changing retry behavior, or debugging a job that ran twice or never ran.

## Repository-specific rules
- Queues are defined per-domain in `apps/worker/src/worker.ts` (audit, monitoring, vault, report, webhook, agency-prospect, agency-competitor, agency-pitch) plus a `setInterval`-based outbox-replay loop — not a BullMQ job itself.
- Every queue producer must actually be wired into a consumer that runs — this codebase has previously shipped a fully-implemented, fully-tested job (`MonitoringScheduler`) that nothing ever called `.start()` on, so it silently never ran in production. When adding a new recurring job, verify it's invoked from `worker.ts`, not just defined.
- Idempotency: BullMQ `jobId` should be deterministic where the operation must not double-fire (e.g. webhook delivery keys on `${outboxEventId}:${endpointId}`, not a fresh random ID each time) — a random ID per attempt defeats BullMQ's own dedup and can cause duplicate real HTTP deliveries on replay.
- Any job whose DB write and external side effect (webhook, email) must both happen or neither happen: wrap the DB write in `db.$transaction`, and do the external call *after* the transaction commits, fire-and-forget with error logging — see `apps/worker/src/audit/vaultScan.ts`.
- Outbox pattern: a `PENDING` `OutboxEvent` row is the durable record of intent; the periodic replay loop (`OUTBOX_REPLAY_INTERVAL_MS`, default 60s) picks up anything still `PENDING` and retries dispatch. Don't bypass this for anything that must eventually be delivered.

## Debugging workflow
```
API → Queue (BullMQ) → Redis → Worker → Scanner/Handler → Database
```
1. Check the job actually reached Redis: was `queue.add(...)` called, and did it throw (network/Redis down)?
2. Check a worker process is actually running and subscribed to that queue name.
3. Check the job handler for silent early returns (e.g. `if (run.status !== 'QUEUED' && ...) return` guards that can make a re-processed job look like a no-op).
4. Check `OutboxEvent`/`WebhookDelivery` rows directly in the DB for status/error fields before assuming "it should have worked."

## Verification requirements
- A test that asserts the new recurring job is actually started from `worker.ts` (source-inspection test, e.g. `tests/worker-wiring.test.ts`, is the established pattern here since spinning up a real long-running worker in a test is impractical).
- A test proving retry/replay doesn't duplicate the external side effect (mock the HTTP call, assert call count).

## Failure conditions
- A feature that "should" run periodically but never fires in production: check `worker.ts` for a missing `.start()`/interval registration first.
- Duplicate emails/webhooks on retry: check whether the job/delivery ID is random per attempt instead of deterministic.
