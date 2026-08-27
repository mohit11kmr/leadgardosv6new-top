/**
 * Deterministic Tuple-Based Cursor Pagination
 * Uses (createdAt, id) composite cursors encoded as opaque base64url strings.
 */

export interface CursorPayload {
  createdAt: string; // ISO 8601 string
  id: string;
}

export interface DecodedCursor {
  createdAt: Date;
  id: string;
}

export interface PaginationMeta {
  limit: number;
  hasNextPage: boolean;
  nextCursor: string | null;
}

export interface PaginatedEnvelope<T> {
  items: T[];
  meta: PaginationMeta;
}

/**
 * Encodes an item's (createdAt, id) tuple into an opaque base64url cursor string
 */
export function encodeCursor(item: { createdAt: Date | string; id: string }): string {
  const dateStr = item.createdAt instanceof Date ? item.createdAt.toISOString() : item.createdAt;
  const payload: CursorPayload = { createdAt: dateStr, id: item.id };
  return Buffer.from(JSON.stringify(payload)).toString('base64url');
}

/**
 * Decodes an opaque base64url cursor string into (createdAt, id)
 */
export function decodeCursor(cursorStr?: string | null): DecodedCursor | null {
  if (!cursorStr || typeof cursorStr !== 'string') return null;

  try {
    // Try base64url decode first
    const raw = Buffer.from(cursorStr, 'base64url').toString('utf8');
    const parsed = JSON.parse(raw);
    if (parsed && parsed.createdAt && parsed.id) {
      const d = new Date(parsed.createdAt);
      if (!isNaN(d.getTime())) {
        return { createdAt: d, id: String(parsed.id) };
      }
    }
  } catch {
    // Fallback: If legacy raw UUID string is passed, cannot infer date, ignore cursor
    return null;
  }

  return null;
}

/**
 * Builds deterministic Prisma where filter for (createdAt, id) composite cursor pagination
 */
export function buildCursorWhereClause(decodedCursor: DecodedCursor | null) {
  if (!decodedCursor) return undefined;

  return {
    OR: [
      { createdAt: { lt: decodedCursor.createdAt } },
      {
        createdAt: decodedCursor.createdAt,
        id: { lt: decodedCursor.id },
      },
    ],
  };
}
