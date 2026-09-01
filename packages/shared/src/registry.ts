import type { Finding, PageRecord, ScannerContext, ScannerExecutableDefinition, ScannerResult } from './types.js';
import {
  runCartScanner,
  runFormsScanner,
  runMixedContentScanner,
  runOpenGraphScanner,
  runSecurityHeadersScanner,
  runSeoScanner,
  runTelephoneScanner,
  runTrackingScanner,
  runWhatsAppScanner,
} from './scanners/index.js';

export const featureNames = [
  '4-Pillar Diagnostic Scan',
  'WhatsApp Link Scanner',
  'Click-to-Call Validator',
  'Contact Form & CTA Detector',
  'Meta Pixel Inspector',
  'GA4 / GTM Probe',
  'Google Indexing Check',
  'Canonical Scanner',
  'SSL/TLS + Mixed Content',
  'Security Headers',
  'OpenGraph Checker',
  'Lead Health Score',
  'Revenue Loss Estimator',
  'Business Impact Summary',
  'Funnel Leakage Simulator',
  'Revenue Scenario Planner',
  'Executive Intelligence Dashboard',
  'Zero-Intent WhatsApp Optimizer',
  'Cart Leakage Monitor',
  'Competitive Radar',
  'Express Fix',
  'Watchdog',
  'Pro / Agency / Enterprise Plans',
  'Razorpay Checkout',
  'Razorpay HMAC Webhook',
  'Client Workspace Management',
  '500-Site Prospect Hunter',
  'AI Cold Pitch Generator',
  'White-Label Reporting',
  'Diagnostic Studio Widget Generator',
  'Competitor Sabotage Radar',
  'Cryptographic Report Links',
  'White-Label PDF Reports',
  'Testimonials Wall',
  'Public REST API v1',
  'HMAC Webhooks',
  'OpenAPI / Swagger',
  'Role-Gated Admin',
  'Billing & Subscription Management',
  'Account Settings & Security Profile',
] as const;

export const featureIds = [
  'LG-001', 'LG-001', 'LG-003', 'LG-001', 'LG-006', 'LG-007', 'LG-010', 'LG-011',
  'LG-013', 'LG-014', 'LG-012', 'LG-016', 'LG-016', 'LG-016', 'LG-009', 'LG-008',
  'LG-029', 'LG-002', 'LG-021', 'LG-020', 'LG-032', 'LG-017', 'LG-031', 'LG-031',
  'LG-031', 'LG-024', 'LG-022', 'LG-023', 'LG-026', 'LG-028', 'LG-020', 'LG-025',
  'LG-026', 'LG-037', 'LG-033', 'LG-019', 'LG-033', 'LG-034', 'LG-035', 'LG-036',
] as const;

export const featureRegistry = featureNames.map((name, index) => ({
  key: `${featureIds[index]}-${index + 1}`,
  id: featureIds[index],
  name,
}));

export const PAGE_SCANNERS: ScannerExecutableDefinition[] = [
  {
    internalKey: 'WHATSAPP',
    featureId: 'LG-001',
    name: 'WhatsApp Link Scanner',
    category: 'LEAD',
    scope: 'PAGE',
    severityPolicy: 'HIGH',
    version: 'v3',
    enabled: true,
    run: (page: PageRecord, ctx?: ScannerContext) => runWhatsAppScanner(page, ctx),
  },
  {
    internalKey: 'TELEPHONE',
    featureId: 'LG-003',
    name: 'Click-to-Call Validator',
    category: 'LEAD',
    scope: 'PAGE',
    severityPolicy: 'HIGH',
    version: 'v3',
    enabled: true,
    run: (page: PageRecord, ctx?: ScannerContext) => runTelephoneScanner(page, ctx),
  },
  {
    internalKey: 'FORMS_CTA',
    featureId: 'LG-001',
    name: 'Contact Form & CTA Detector',
    category: 'LEAD',
    scope: 'PAGE',
    severityPolicy: 'MEDIUM',
    version: 'v3',
    enabled: true,
    run: (page: PageRecord, ctx?: ScannerContext) => runFormsScanner(page, ctx),
  },
  {
    internalKey: 'SEO',
    featureId: 'LG-010',
    name: 'Google Indexing & Canonical Scanner',
    category: 'SEO',
    scope: 'PAGE',
    severityPolicy: 'HIGH',
    version: 'v3',
    enabled: true,
    run: (page: PageRecord, ctx?: ScannerContext) => runSeoScanner(page, ctx),
  },
  {
    internalKey: 'OPENGRAPH',
    featureId: 'LG-012',
    name: 'OpenGraph & Social Metadata Scanner',
    category: 'SEO',
    scope: 'PAGE',
    severityPolicy: 'LOW',
    version: 'v3',
    enabled: true,
    run: (page: PageRecord, ctx?: ScannerContext) => runOpenGraphScanner(page, ctx),
  },
  {
    internalKey: 'MIXED_CONTENT',
    featureId: 'LG-013',
    name: 'Mixed Content Detector',
    category: 'SECURITY',
    scope: 'PAGE',
    severityPolicy: 'HIGH',
    version: 'v3',
    enabled: true,
    run: (page: PageRecord, ctx?: ScannerContext) => runMixedContentScanner(page, ctx),
  },
  {
    internalKey: 'TRACKING',
    featureId: 'LG-006',
    name: 'Tracking & Analytics Scanner',
    category: 'ADVERTISING',
    scope: 'PAGE',
    severityPolicy: 'LOW',
    version: 'v3',
    enabled: true,
    run: (page: PageRecord, ctx?: ScannerContext) => runTrackingScanner(page, ctx),
  },
  {
    internalKey: 'CART',
    featureId: 'LG-021',
    name: 'Cart Leakage Monitor',
    category: 'LEAD',
    scope: 'PAGE',
    severityPolicy: 'HIGH',
    version: 'v1',
    enabled: true,
    run: (page: PageRecord, ctx?: ScannerContext) => runCartScanner(page, ctx),
  },
];

class ScannerRegistryService {
  private pageScanners = new Map<string, ScannerExecutableDefinition>();

  constructor() {
    for (const s of PAGE_SCANNERS) {
      this.pageScanners.set(s.internalKey, s);
    }
  }

  getEnabled(): ScannerExecutableDefinition[] {
    return Array.from(this.pageScanners.values()).filter((s) => s.enabled);
  }

  get(key: string): ScannerExecutableDefinition | undefined {
    return this.pageScanners.get(key);
  }

  register(scanner: ScannerExecutableDefinition) {
    this.pageScanners.set(scanner.internalKey, scanner);
  }

  async runPageScanners(
    page: PageRecord,
    context?: ScannerContext
  ): Promise<{ results: ScannerResult[]; findings: Finding[] }> {
    const enabled = this.getEnabled();
    const results: ScannerResult[] = [];
    const findings: Finding[] = [];

    for (const scanner of enabled) {
      try {
        const res = await Promise.resolve(scanner.run(page, context));
        results.push(res);
        if (res.findings?.length) {
          findings.push(...res.findings);
        }
      } catch (error) {
        results.push({
          scannerKey: scanner.internalKey,
          status: 'FAILED',
          findings: [],
          error: error instanceof Error ? error.message : 'Unknown scanner error',
        });
      }
    }

    return { results, findings };
  }
}

export const scannerRegistry = new ScannerRegistryService();
