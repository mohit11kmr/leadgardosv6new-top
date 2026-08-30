/**
 * Canonical JSON-compatible types and evidence sanitization / normalization.
 */

export type JsonPrimitive = string | number | boolean | null;

export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue | undefined };

export type FindingEvidence = JsonValue;

/**
 * Forbidden sensitive keys to strip recursively during evidence sanitization.
 */
export const SENSITIVE_EVIDENCE_KEYS = new Set([
  'headers',
  'cookies',
  'authorization',
  'token',
  'secret',
  'password',
  'key',
  'signature',
  'rawbody',
  'requestbody',
  'responsebody',
]);

/**
 * Sanitizes evidence recursively to ensure it is safe JSON and strips sensitive keys.
 * Preserves array ordering, primitive values, null, and nested structures without mutating input.
 */
export function sanitizeFindingEvidence(evidence: unknown): FindingEvidence {
  if (evidence === null || evidence === undefined) {
    return null;
  }

  if (typeof evidence === 'string' || typeof evidence === 'number' || typeof evidence === 'boolean') {
    return evidence;
  }

  if (Array.isArray(evidence)) {
    return evidence.map((item) => sanitizeFindingEvidence(item));
  }

  if (typeof evidence === 'object') {
    const sanitized: { [key: string]: JsonValue } = {};
    for (const [k, v] of Object.entries(evidence as Record<string, unknown>)) {
      if (!SENSITIVE_EVIDENCE_KEYS.has(k.toLowerCase())) {
        sanitized[k] = sanitizeFindingEvidence(v);
      }
    }
    return sanitized;
  }

  try {
    return String(evidence);
  } catch {
    return null;
  }
}

/**
 * Normalizes unknown evidence into a guaranteed canonical JsonValue or null.
 * Never throws on malformed or unexpected data.
 */
export function normalizeFindingEvidence(value: unknown): JsonValue | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => normalizeFindingEvidence(item));
  }

  if (typeof value === 'object') {
    const result: { [key: string]: JsonValue } = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      result[k] = normalizeFindingEvidence(v);
    }
    return result;
  }

  try {
    return String(value);
  } catch {
    return null;
  }
}
