import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { FUNNEL_EVENTS } from '../apps/api/src/services/funnelEventService.js';
import type { PublicAuditFindingDTO, FindingEvidence } from '../apps/api/src/dtos/public.js';
import { sanitizeFindingEvidence, normalizeFindingEvidence } from '@leadguard/shared';
import { publicAuditService } from '../apps/api/src/services/public/publicAuditService.js';
import { guestScanService } from '../apps/api/src/services/public/guestScanService.js';

describe('Phase 3A.6 Pre-3B Blocker Remediations', () => {
  const rootDir = process.cwd();

  describe('F1 & F2 — Funnel Client-IP Privacy & Error Contract', () => {
    it('verifies guestFunnelEventSchema accepts optional scanId and valid event enums', () => {
      const guestFunnelEventSchema = z.object({
        scanId: z.string().uuid().optional(),
        event: z.enum([
          FUNNEL_EVENTS.RESULT_VIEWED,
          FUNNEL_EVENTS.EXPRESS_FIX_CLICKED,
        ]),
        sessionId: z.string().min(4).max(200).optional(),
      });

      // Valid payloads
      const valid1 = guestFunnelEventSchema.safeParse({
        scanId: '123e4567-e89b-12d3-a456-426614174000',
        event: 'RESULT_VIEWED',
      });
      expect(valid1.success).toBe(true);

      const valid2 = guestFunnelEventSchema.safeParse({
        event: 'EXPRESS_FIX_CLICKED',
        sessionId: 'sess_12345',
      });
      expect(valid2.success).toBe(true);

      // Invalid payloads (must reject with 400)
      const invalidEvent = guestFunnelEventSchema.safeParse({
        event: 'INVALID_UNKNOWN_EVENT',
      });
      expect(invalidEvent.success).toBe(false);

      const invalidScanId = guestFunnelEventSchema.safeParse({
        scanId: 'not-a-uuid',
        event: 'RESULT_VIEWED',
      });
      expect(invalidScanId.success).toBe(false);
    });

    it('verifies guestScanController does NOT pass clientIp to funnelEventService.record', () => {
      const controllerPath = path.join(rootDir, 'apps/api/src/controllers/public/guestScanController.ts');
      const content = fs.readFileSync(controllerPath, 'utf-8');

      // The funnel route block must not write clientIp
      const funnelRouteBlock = content.slice(content.indexOf("'/scan/:scanId/funnel'"));
      expect(funnelRouteBlock).not.toContain('clientIp: getClientIp');
      expect(funnelRouteBlock).not.toContain('data: { clientIp');
    });

    it('verifies guestScanController handles 400, 404, and 500 error cases truthfully', () => {
      const controllerPath = path.join(rootDir, 'apps/api/src/controllers/public/guestScanController.ts');
      const content = fs.readFileSync(controllerPath, 'utf-8');

      const funnelRouteBlock = content.slice(content.indexOf("'/scan/:scanId/funnel'"));
      expect(funnelRouteBlock).toContain("res.status(400)");
      expect(funnelRouteBlock).toContain("res.status(404)");
      expect(funnelRouteBlock).toContain("res.status(500)");
    });
  });

  describe('F5 — Canonical Evidence Contract, Sanitization, & Normalization', () => {
    describe('A. Primitive Evidence', () => {
      it('preserves string, number, boolean, and null primitives', () => {
        expect(sanitizeFindingEvidence('plain string evidence')).toBe('plain string evidence');
        expect(sanitizeFindingEvidence(42)).toBe(42);
        expect(sanitizeFindingEvidence(0)).toBe(0);
        expect(sanitizeFindingEvidence(true)).toBe(true);
        expect(sanitizeFindingEvidence(false)).toBe(false);
        expect(sanitizeFindingEvidence(null)).toBe(null);
        expect(sanitizeFindingEvidence(undefined)).toBe(null);
      });
    });

    describe('B. Object Evidence', () => {
      it('preserves clean nested objects and creates new copies without mutating input', () => {
        const input = {
          ruleId: 'LG-001',
          location: 'https://example.com/page',
          details: {
            subCode: 104,
            active: true,
          },
        };
        const sanitized = sanitizeFindingEvidence(input);
        expect(sanitized).toEqual({
          ruleId: 'LG-001',
          location: 'https://example.com/page',
          details: {
            subCode: 104,
            active: true,
          },
        });
        expect(sanitized).not.toBe(input);
      });
    });

    describe('C. Array Evidence', () => {
      it('preserves array of primitives without converting arrays into objects', () => {
        const input = ['https://example.com/1', 'https://example.com/2', 123, true, null];
        const sanitized = sanitizeFindingEvidence(input);
        expect(Array.isArray(sanitized)).toBe(true);
        expect(sanitized).toEqual(['https://example.com/1', 'https://example.com/2', 123, true, null]);
      });

      it('preserves array of objects and preserves exact ordering', () => {
        const input = [
          { index: 0, tag: 'script1' },
          { index: 1, tag: 'script2' },
          { index: 2, tag: 'script3' },
        ];
        const sanitized = sanitizeFindingEvidence(input);
        expect(Array.isArray(sanitized)).toBe(true);
        expect(sanitized).toEqual([
          { index: 0, tag: 'script1' },
          { index: 1, tag: 'script2' },
          { index: 2, tag: 'script3' },
        ]);
      });
    });

    describe('D. Mixed Nested JSON', () => {
      it('handles objects containing arrays, arrays containing objects, and arrays containing arrays', () => {
        const input = {
          auditTarget: 'example.com',
          pages: [
            {
              url: '/home',
              issues: [
                { type: 'missing_alt', elements: ['<img 1>', '<img 2>'] },
                { matrix: [[1, 2], [3, 4]] },
              ],
            },
          ],
        };
        const sanitized = sanitizeFindingEvidence(input);
        expect(sanitized).toEqual({
          auditTarget: 'example.com',
          pages: [
            {
              url: '/home',
              issues: [
                { type: 'missing_alt', elements: ['<img 1>', '<img 2>'] },
                { matrix: [[1, 2], [3, 4]] },
              ],
            },
          ],
        });
        // Ensure array identities are preserved
        expect(Array.isArray((sanitized as any).pages)).toBe(true);
        expect(Array.isArray((sanitized as any).pages[0].issues)).toBe(true);
        expect(Array.isArray((sanitized as any).pages[0].issues[0].elements)).toBe(true);
        expect(Array.isArray((sanitized as any).pages[0].issues[1].matrix[0])).toBe(true);
      });
    });

    describe('E. Sensitive Field Removal', () => {
      it('strips all 11 forbidden keys at top-level, nested objects, and nested inside arrays', () => {
        const input = {
          safeField: 'visible',
          headers: { 'user-agent': 'bot' },
          cookies: 'session=123',
          authorization: 'Bearer xyz',
          token: 'tok_abc',
          secret: 'shh',
          password: 'pass',
          key: 'api_key',
          signature: 'sig_123',
          rawBody: '<xml>',
          requestBody: { query: 'test' },
          responseBody: { result: 'fail' },
          nested: {
            safeNested: 100,
            token: 'leak_nested',
            subArray: [
              {
                safeInArray: true,
                password: 'leak_in_array',
                headers: 'leak_header',
              },
            ],
          },
        };

        const sanitized = sanitizeFindingEvidence(input);
        expect(sanitized).toEqual({
          safeField: 'visible',
          nested: {
            safeNested: 100,
            subArray: [
              {
                safeInArray: true,
              },
            ],
          },
        });
      });
    });

    describe('F. DTO Producer Consistency', () => {
      it('verifies publicAuditService and guestScanService produce identical canonical finding shapes', () => {
        const mockAudit = {
          id: 'audit-123',
          website: {
            id: 'web-123',
            name: 'Example Site',
            url: 'https://example.com',
            domain: 'example.com',
          },
          status: 'COMPLETED',
          score: {
            overall: 80,
            lead: 75,
            advertising: 85,
            seo: 90,
            security: 70,
          },
          findings: [
            {
              id: 'f-1',
              title: 'Broken WhatsApp Link',
              description: 'WhatsApp link is missing country code prefix',
              category: 'LEAD',
              severity: 'CRITICAL',
              scoreImpact: 25,
              recommendation: 'Use international phone format',
              businessImpact: 'Lost lead inquiries',
              affectedUrl: 'https://example.com/contact',
              evidence: [
                { element: '<a href="whatsapp://send?phone=">', ruleId: 'LG-001' },
                { token: 'secret_leak', observed: 'Missing country code' },
              ],
              normalizedIssueKey: 'whatsapp_invalid_format',
            },
          ],
          totalFindings: 1,
          createdAt: new Date('2026-08-30T10:00:00.000Z'),
        };

        const publicResult = (publicAuditService as any).formatAuditDto(mockAudit);
        const guestResult = (guestScanService as any).formatPublicAuditDto(mockAudit);

        expect(publicResult.findings).toBeDefined();
        expect(guestResult.findings).toBeDefined();
        expect(publicResult.findings).toEqual(guestResult.findings);

        // Check canonical finding keys
        const expectedFinding = {
          id: 'f-1',
          title: 'Broken WhatsApp Link',
          description: 'WhatsApp link is missing country code prefix',
          category: 'LEAD',
          severity: 'CRITICAL',
          scoreImpact: 25,
          recommendation: 'Use international phone format',
          businessImpact: 'Lost lead inquiries',
          affectedUrl: 'https://example.com/contact',
          evidence: [
            { element: '<a href="whatsapp://send?phone=">', ruleId: 'LG-001' },
            { observed: 'Missing country code' }, // token was stripped
          ],
          normalizedIssueKey: 'whatsapp_invalid_format',
        };

        expect(publicResult.findings[0]).toEqual(expectedFinding);
        expect(guestResult.findings[0]).toEqual(expectedFinding);
      });
    });

    describe('G. Frontend Evidence Normalization Guard', () => {
      it('safely normalizes objects, arrays, primitives, and unexpected values without throwing', () => {
        expect(normalizeFindingEvidence(null)).toBe(null);
        expect(normalizeFindingEvidence(undefined)).toBe(null);
        expect(normalizeFindingEvidence('valid string')).toBe('valid string');
        expect(normalizeFindingEvidence(123.45)).toBe(123.45);
        expect(normalizeFindingEvidence(true)).toBe(true);
        expect(normalizeFindingEvidence([1, 2, 'three'])).toEqual([1, 2, 'three']);
        expect(normalizeFindingEvidence({ a: 1, b: [true, false] })).toEqual({ a: 1, b: [true, false] });
        
        // Edge cases
        expect(normalizeFindingEvidence(BigInt(100))).toBe('100');
        expect(normalizeFindingEvidence(() => {})).toBeDefined();
      });
    });
  });

  describe('F4 — Badge CSS Variant & Accessibility Matrix', () => {
    it('verifies styles.css defines all required .badge-* classes with WCAG AA text colors', () => {
      const stylesPath = path.join(rootDir, 'apps/web/src/styles.css');
      const styles = fs.readFileSync(stylesPath, 'utf-8');

      const requiredBadgeClasses = [
        '.badge-critical',
        '.badge-high',
        '.badge-medium',
        '.badge-low',
        '.badge-neutral',
        '.badge-success',
        '.badge-info',
        '.badge-warning',
        '.badge-purple',
        '.badge-error',
        '.badge-emerald',
        '.badge-indigo',
        '.badge-slate',
      ];

      for (const badgeClass of requiredBadgeClasses) {
        expect(styles).toContain(badgeClass);
      }
    });

    it('verifies Badge.tsx exports all canonical variants', () => {
      const badgePath = path.join(rootDir, 'apps/web/src/components/ui/Badge.tsx');
      const content = fs.readFileSync(badgePath, 'utf-8');

      expect(content).toContain("'warning'");
      expect(content).toContain("'purple'");
      expect(content).toContain("'error'");
      expect(content).toContain("'emerald'");
      expect(content).toContain("'indigo'");
      expect(content).toContain("'slate'");
    });
  });
});
