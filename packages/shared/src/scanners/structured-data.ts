import type { PageRecord } from '../types.js';

export interface JsonLdBlock {
  raw: string;
  valid: boolean;
  schemaType: string[] | null;
  parseError?: string;
}

export interface StructuredDataScanResult {
  jsonLdBlocks: JsonLdBlock[];
  hasValidJsonLd: boolean;
  hasMalformedJsonLd: boolean;
  /** @type values that appear on more than one valid JSON-LD block on this SAME page — a deterministic, explainable duplicate-block signal, not a schema-correctness judgment. */
  duplicateTypes: string[];
  hasMicrodata: boolean;
  hasRdfa: boolean;
}

const JSON_LD_BLOCK_PATTERN = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

function extractSchemaTypes(parsed: unknown): string[] {
  if (Array.isArray(parsed)) {
    return parsed.flatMap((entry) => extractSchemaTypes(entry));
  }
  if (parsed && typeof parsed === 'object') {
    const obj = parsed as Record<string, unknown>;
    const type = obj['@type'];
    const graph = obj['@graph'];
    const types: string[] = [];
    if (typeof type === 'string') types.push(type);
    else if (Array.isArray(type)) types.push(...type.filter((t): t is string => typeof t === 'string'));
    if (Array.isArray(graph)) types.push(...extractSchemaTypes(graph));
    return types;
  }
  return [];
}

/**
 * Detects and validates JSON-LD structured-data blocks, plus a coarse
 * presence check for Microdata/RDFa (both "where practical" per scope —
 * presence only, not deep attribute validation). Deliberately does not
 * attempt to be a Google Rich Results / full schema.org validator: it only
 * ever reports deterministic problems (JSON.parse failure, an @type
 * appearing in more than one block on the same page), never a judgment
 * about whether a schema is "complete" or "correct" for a given rich-result
 * type.
 */
export function scanStructuredData(page: PageRecord): StructuredDataScanResult {
  const html = page.html;
  const jsonLdBlocks: JsonLdBlock[] = [];

  let match: RegExpExecArray | null;
  JSON_LD_BLOCK_PATTERN.lastIndex = 0;
  while ((match = JSON_LD_BLOCK_PATTERN.exec(html)) !== null) {
    const raw = (match[1] ?? '').trim();
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw);
      jsonLdBlocks.push({ raw, valid: true, schemaType: extractSchemaTypes(parsed) || null });
    } catch (err) {
      jsonLdBlocks.push({
        raw,
        valid: false,
        schemaType: null,
        parseError: err instanceof Error ? err.message : 'Invalid JSON',
      });
    }
  }

  const allValidTypes = jsonLdBlocks.filter((b) => b.valid).flatMap((b) => b.schemaType ?? []);
  const seen = new Set<string>();
  const duplicateTypes: string[] = [];
  for (const t of allValidTypes) {
    if (seen.has(t)) {
      if (!duplicateTypes.includes(t)) duplicateTypes.push(t);
    } else {
      seen.add(t);
    }
  }

  return {
    jsonLdBlocks,
    hasValidJsonLd: jsonLdBlocks.some((b) => b.valid),
    hasMalformedJsonLd: jsonLdBlocks.some((b) => !b.valid),
    duplicateTypes,
    hasMicrodata: /\bitemscope\b/i.test(html) && /\bitemtype\s*=/i.test(html),
    hasRdfa: /\btypeof\s*=/i.test(html) && /\bvocab\s*=/i.test(html),
  };
}
