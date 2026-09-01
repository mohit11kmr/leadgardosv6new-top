import { describe, it, expect } from 'vitest';
import { generateAutoFixScript, isAutoFixable, isManualFixRequired } from './auto-fix.js';
import type { Finding } from './types.js';

function makeFinding(internalKey: string): Finding {
  return {
    ruleId: 'LG-001',
    internalKey,
    normalizedIssueKey: internalKey,
    category: 'LEAD',
    scope: 'WEBSITE',
    severity: 'MEDIUM',
    title: 'Test finding',
    description: 'desc',
    evidence: { source: 'test', observed: '', location: '', why: '', recommendation: '' },
    recommendation: 'rec',
    scoreImpact: 5,
  };
}

describe('Auto-Fix Script Studio', () => {
  it('generates a real, distinct snippet for each auto-fixable finding type', () => {
    for (const key of ['GA4_MISSING', 'GTM_MISSING', 'META_PIXEL_MISSING', 'WHATSAPP_MISSING']) {
      const script = generateAutoFixScript(makeFinding(key));
      expect(script).not.toBeNull();
      expect(script!.snippet.length).toBeGreaterThan(20);
      expect(script!.internalKey).toBe(key);
      expect(isAutoFixable(makeFinding(key))).toBe(true);
    }
  });

  it('never fabricates a real tracking ID — snippets only contain placeholder tokens', () => {
    const ga4 = generateAutoFixScript(makeFinding('GA4_MISSING'))!;
    expect(ga4.snippet).toContain('G-XXXXXXXXXX');
    expect(ga4.placeholders).toContain('G-XXXXXXXXXX');

    const pixel = generateAutoFixScript(makeFinding('META_PIXEL_MISSING'))!;
    expect(pixel.snippet).toContain('YOUR_PIXEL_ID');
  });

  it('returns null (no fake script) for findings requiring a server-side fix', () => {
    for (const key of ['SEC_HEADER_CSP', 'SEC_HEADER_HSTS', 'TLS_ERROR', 'CART_CHECKOUT_BROKEN']) {
      expect(generateAutoFixScript(makeFinding(key))).toBeNull();
      expect(isAutoFixable(makeFinding(key))).toBe(false);
      expect(isManualFixRequired(makeFinding(key))).toBe(true);
    }
  });

  it('returns null for unknown/unmapped finding keys rather than guessing', () => {
    expect(generateAutoFixScript(makeFinding('SOME_UNKNOWN_KEY'))).toBeNull();
  });
});
