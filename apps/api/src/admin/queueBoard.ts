import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import type { Job, Queue } from 'bullmq';
import type { Request, Response, NextFunction, Router } from 'express';
import { adminService } from '../services/adminService.js';
import type { AuthRequest } from '../routes.js';

/**
 * Operator queue visibility (Revenue Foundation phase, Item 4). Mounts Bull
 * Board over the EXISTING BullMQ queues this codebase already defines — no
 * new queue system, no hardcoded/fake queue list (see the caller in
 * routes.ts for the real, imported Queue instances).
 *
 * SECURITY:
 *   - Never mounted without requirePlatformAdmin() + requirePlatformCapability
 *     in front of it (enforced by the caller, not here — this module only
 *     builds the router, routes.ts is responsible for gating it).
 *   - Job payload sanitization: the webhook queue's job data includes
 *     `secretHash` (the endpoint's webhook signing secret hash) — the only
 *     sensitive field found across every queue's producer call sites in
 *     this codebase (audit/monitoring/vault/report/prospect/pitch/competitor
 *     jobs all carry IDs/options only, confirmed by direct source
 *     inspection). SanitizedQueueAdapter wraps only that one queue,
 *     redacting the field before Bull Board ever serializes it — every
 *     other queue is registered with its real Queue instance directly.
 *   - Mutation auditing: Bull Board's own router has no audit-log hook, so
 *     mutating requests (retry/remove/promote/clean — anything other than a
 *     GET) are intercepted by auditBullBoardMutations() below, which writes
 *     an AdminAuditLog entry for the attempt before handing off to Bull
 *     Board's own handler.
 */

const SENSITIVE_JOB_DATA_KEYS = new Set(['secretHash', 'secret', 'apiKey', 'password', 'token', 'refreshToken']);

function redactJobData(data: unknown): unknown {
  if (!data || typeof data !== 'object') return data;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
    out[key] = SENSITIVE_JOB_DATA_KEYS.has(key) ? '[REDACTED]' : value;
  }
  return out;
}

function redactJob<T extends Job | undefined>(job: T): T {
  if (job) {
    (job as Job).data = redactJobData((job as Job).data);
  }
  return job;
}

/**
 * Wraps a real BullMQ Queue so Bull Board's adapter only ever sees
 * sanitized job data — every other Queue method is delegated unchanged
 * (proxy pattern), so retry/remove/promote/pause etc. still operate on the
 * real underlying jobs; only the two read paths that hand job objects back
 * to Bull Board for display are intercepted.
 */
function createSanitizingQueueProxy(queue: Queue): Queue {
  return new Proxy(queue, {
    get(target, prop, receiver) {
      const original = Reflect.get(target, prop, receiver);
      if (prop === 'getJob' && typeof original === 'function') {
        return async (...args: unknown[]) => redactJob(await (original as (...a: unknown[]) => Promise<Job | undefined>).apply(target, args));
      }
      if (prop === 'getJobs' && typeof original === 'function') {
        return async (...args: unknown[]) => {
          const jobs = await (original as (...a: unknown[]) => Promise<Job[]>).apply(target, args);
          return jobs.map((j) => redactJob(j));
        };
      }
      return original;
    },
  });
}

export interface QueueBoardQueues {
  [label: string]: Queue;
}

export function buildQueueBoardRouter(queues: QueueBoardQueues): Router {
  const serverAdapter = new ExpressAdapter();
  serverAdapter.setBasePath('/api/v1/admin/queues');

  const adapters = Object.entries(queues).map(([label, queue]) => {
    const wrapped = label === 'webhook' ? createSanitizingQueueProxy(queue) : queue;
    return new BullMQAdapter(wrapped);
  });

  createBullBoard({ queues: adapters, serverAdapter });
  return serverAdapter.getRouter();
}

/**
 * Classifies a Bull Board mutation path into a specific, human-meaningful
 * event name. Bull Board's real route table (verified from
 * @bull-board/api/dist/routes.js) puts the action in the PATH, not the HTTP
 * method — nearly every mutation is PUT or PATCH (retry, promote, clean,
 * pause, resume, obliterate, empty), so method-based naming would collapse
 * almost everything into one generic bucket. Path-based classification is
 * the only way to produce the distinct queue_job_retried/_removed/_promoted
 * events Item 9 requires.
 */
function classifyQueueMutation(path: string): string {
  if (/\/retry(\/|$)/.test(path)) return 'queue_job_retried';
  if (/\/promote(\/|$)/.test(path)) return 'queue_job_promoted';
  if (/\/(clean|obliterate|empty)(\/|$)/.test(path)) return 'queue_job_removed';
  if (/\/(pause|resume)(\/|$)/.test(path)) return 'queue_job_paused_or_resumed';
  return 'queue_job_mutated';
}

/**
 * Audits any non-GET request reaching the queue board (retry/remove/
 * promote/clean/pause/etc.) before handing off to Bull Board's own router.
 * Best-effort: logging failure must never block the underlying action
 * (matches the fire-and-forget-but-logged pattern used elsewhere in this
 * codebase), and the action itself is not re-implemented here — Bull
 * Board's own handler still performs it.
 */
export function auditBullBoardMutations() {
  return async (request: Request, response: Response, next: NextFunction) => {
    if (request.method !== 'GET') {
      const authReq = request as AuthRequest;
      try {
        await adminService.recordAdminAction(
          authReq.auth?.sub ?? null,
          `QUEUE_${request.method}`,
          'QUEUE_JOB',
          request.path,
          { method: request.method, path: request.path },
          request.ip
        );
        const eventName = classifyQueueMutation(request.path);
        console.log(JSON.stringify({ level: 'info', service: 'api', event: eventName, path: request.path, actorUserId: authReq.auth?.sub }));
      } catch (err) {
        console.error(
          JSON.stringify({ level: 'error', service: 'api', event: 'queue_audit_log_failed', error: err instanceof Error ? err.message : 'Unknown error' })
        );
      }
    }
    next();
  };
}
