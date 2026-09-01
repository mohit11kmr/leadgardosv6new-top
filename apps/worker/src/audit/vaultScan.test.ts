import { describe, it, expect } from 'vitest';
import { classifyRetestTransitions } from './vaultScan.js';

describe('classifyRetestTransitions (LG-040 retest -> verified loop)', () => {
  it('marks a live OPEN finding as FIXED when it no longer reproduces', () => {
    const live = [{ id: 'f1', normalizedIssueKey: 'SEC_DEBUG_MODE', status: 'OPEN' }];
    const result = classifyRetestTransitions(live, new Set());
    expect(result.toFixIds).toEqual(['f1']);
    expect(result.toVerifyIds).toEqual([]);
  });

  it('marks a live TRIAGED finding as FIXED when it no longer reproduces', () => {
    const live = [{ id: 'f1', normalizedIssueKey: 'SEC_DEBUG_MODE', status: 'TRIAGED' }];
    const result = classifyRetestTransitions(live, new Set());
    expect(result.toFixIds).toEqual(['f1']);
  });

  it('promotes an already-FIXED finding to VERIFIED when it still does not reproduce', () => {
    const live = [{ id: 'f1', normalizedIssueKey: 'SEC_DEBUG_MODE', status: 'FIXED' }];
    const result = classifyRetestTransitions(live, new Set());
    expect(result.toFixIds).toEqual([]);
    expect(result.toVerifyIds).toEqual(['f1']);
  });

  it('leaves a finding untouched (neither fix nor verify) when it still reproduces', () => {
    const live = [{ id: 'f1', normalizedIssueKey: 'SEC_DEBUG_MODE', status: 'OPEN' }];
    const result = classifyRetestTransitions(live, new Set(['SEC_DEBUG_MODE']));
    expect(result.toFixIds).toEqual([]);
    expect(result.toVerifyIds).toEqual([]);
  });

  it('handles a mixed batch: some fixed, some verified, some still open', () => {
    const live = [
      { id: 'open-1', normalizedIssueKey: 'SEC_DEBUG_MODE', status: 'OPEN' },
      { id: 'fixed-1', normalizedIssueKey: 'SEC_EXPOSED_BACKUP', status: 'FIXED' },
      { id: 'still-open', normalizedIssueKey: 'SEC_MISSING_HSTS', status: 'OPEN' },
    ];
    const result = classifyRetestTransitions(live, new Set(['SEC_MISSING_HSTS']));
    expect(result.toFixIds).toEqual(['open-1']);
    expect(result.toVerifyIds).toEqual(['fixed-1']);
  });
});
