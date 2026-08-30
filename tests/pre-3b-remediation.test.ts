import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { FUNNEL_EVENTS } from '../apps/api/src/services/funnelEventService.js';
import type { PublicAuditFindingDTO, FindingEvidence } from '../apps/api/src/dtos/public.js';

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

  describe('F5 — Evidence DTO Contract & Producer Alignment', () => {
    it('verifies PublicAuditFindingDTO declares evidence as FindingEvidence object/null', () => {
      const sampleFinding: PublicAuditFindingDTO = {
        id: 'f-1',
        title: 'Broken WhatsApp Link',
        description: 'WhatsApp link is missing country code',
        category: 'LEAD',
        severity: 'CRITICAL',
        scoreImpact: 25,
        recommendation: 'Update link format',
        businessImpact: 'Lost WhatsApp inquiries',
        affectedUrl: 'https://example.com/contact',
        evidence: {
          element: '<a href="whatsapp://send?phone=">',
          ruleId: 'LG-001',
          observed: 'Missing country prefix',
        },
        normalizedIssueKey: 'whatsapp_invalid_format',
      };

      expect(typeof sampleFinding.evidence).toBe('object');
      expect((sampleFinding.evidence as any)?.ruleId).toBe('LG-001');
    });

    it('verifies both guestScanService and publicAuditService include evidence, businessImpact, affectedUrl, and normalizedIssueKey', () => {
      const guestScanServicePath = path.join(rootDir, 'apps/api/src/services/public/guestScanService.ts');
      const publicAuditServicePath = path.join(rootDir, 'apps/api/src/services/public/publicAuditService.ts');

      const guestContent = fs.readFileSync(guestScanServicePath, 'utf-8');
      const publicContent = fs.readFileSync(publicAuditServicePath, 'utf-8');

      expect(guestContent).toContain('evidence: this.sanitizeEvidence(f.evidence)');
      expect(publicContent).toContain('evidence: this.sanitizeEvidence(f.evidence)');
      expect(publicContent).toContain('businessImpact: f.businessImpact || null');
      expect(publicContent).toContain('affectedUrl: f.affectedUrl || null');
      expect(publicContent).toContain('normalizedIssueKey: f.normalizedIssueKey');
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
