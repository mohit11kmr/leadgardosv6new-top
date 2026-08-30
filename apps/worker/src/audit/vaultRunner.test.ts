import { describe, it, expect, afterAll } from 'vitest';
import { db } from '@leadguard/database';
import { collectVaultProbeFacts, upsertVaultFindings } from './vaultRunner.js';
import { collectVaultFindings, type PageRecord, type VaultFinding } from '@leadguard/shared';

function page(overrides: Partial<PageRecord> = {}): PageRecord {
  return {
    url: 'https://example.com/',
    finalUrl: 'https://example.com/',
    statusCode: 200,
    contentType: 'text/html',
    headers: {},
    htmlAvailable: true,
    responseTimeMs: 40,
    depth: 0,
    redirectChain: [],
    html: '<html><head><title>Example</title></head><body></body></html>',
    ...overrides,
  };
}

const keys = (findings: VaultFinding[]) => findings.map((f) => f.normalizedIssueKey);

describe('VaultGuard runner: page-level fact collection (phase 0)', () => {
  it('collects page, login-form, and source-map facts from crawled pages', async () => {
    const loginPage = page({
      finalUrl: 'https://example.com/login',
      headers: {
        'set-cookie': 'PHPSESSID=abc; HttpOnly',
        'x-powered-by': 'PHP/8.4.24',
        server: 'Apache/2.4.57',
      },
      html: [
        '<html><body>',
        '<form action="/login" method="post">',
        '<input type="hidden" name="_token" value="xyz">',
        '<input type="password" name="password">',
        '<button type="submit">Login</button>',
        '</form>',
        '</body></html>',
      ].join(''),
    });

    const facts = await collectVaultProbeFacts('https://example.com/', [loginPage]);
    expect(facts.page).toBeDefined();
    expect(facts.page?.headers['x-powered-by']).toBe('PHP/8.4.24');
    expect(facts.loginForms).toHaveLength(1);
    expect(facts.loginForms![0]!.action).toBe('https://example.com/login');
    expect(facts.loginForms![0]!.hasCsrfToken).toBe(true);
    expect(facts.loginForms![0]!.cookie.httpOnly).toBe(true);
  });

  it('flags server version disclosure and missing cookie flags on the real fixture', async () => {
    const loginPage = page({
      finalUrl: 'https://example.com/login',
      headers: { 'x-powered-by': 'PHP/8.4.24' },
      html: [
        '<form action="/login" method="post">',
        '<input type="password" name="password">',
        '</form>',
      ].join(''),
    });

    const facts = await collectVaultProbeFacts('https://example.com/', [loginPage]);
    const findings = collectVaultFindings(facts);
    expect(keys(findings)).toContain('SEC_SERVER_LEAK');
    expect(keys(findings)).toContain('SEC_INSECURE_AUTH_COOKIE');
    expect(keys(findings)).toContain('SEC_NO_AUTH_RATE_LIMIT');
    expect(findings.filter((f) => f.normalizedIssueKey === 'SEC_SERVER_LEAK')).toHaveLength(1);
  });

  it('produces zero findings for a properly secured page', async () => {
    const clean = page({
      headers: {
        'content-security-policy': "default-src 'self'",
        'strict-transport-security': 'max-age=31536000',
        'x-frame-options': 'SAMEORIGIN',
        'x-content-type-options': 'nosniff',
        'permissions-policy': 'camera=(), microphone=(), geolocation=()',
        server: 'nginx',
      },
    });
    const facts = await collectVaultProbeFacts('https://example.com/', [clean]);
    const findings = collectVaultFindings(facts);
    expect(findings).toHaveLength(0);
  });
});

describe('VaultGuard runner: persistence (VaultAuditFinding)', () => {
  const testOrgIds: string[] = [];
  const testWebsiteIds: string[] = [];

  afterAll(async () => {
    await db.vaultAuditFinding.deleteMany({ where: { websiteId: { in: testWebsiteIds } } });
    await db.website.deleteMany({ where: { id: { in: testWebsiteIds } } });
    await db.organization.deleteMany({ where: { id: { in: testOrgIds } } });
  });

  it('inserts on first scan and reuses the row on re-scan', async () => {
    const slug = `vault-test-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const org = await db.organization.create({ data: { name: 'VaultTest', slug } });
    testOrgIds.push(org.id);
    const site = await db.website.create({
      data: { organizationId: org.id, url: 'https://example.com/', normalizedUrl: 'https://example.com/', domain: 'example.com', name: 'Example' },
    });
    testWebsiteIds.push(site.id);
    const audit = await db.audit.create({ data: { organizationId: org.id, websiteId: site.id } });

    const finding: VaultFinding = {
      ruleId: 'LG-038', internalKey: 'SEC_SERVER_LEAK', normalizedIssueKey: 'SEC_SERVER_LEAK',
      category: 'SECURITY', scope: 'WEBSITE', severity: 'MEDIUM',
      title: 'Server/framework version disclosure', description: 'response discloses server version',
      evidence: { source: 'vault-probe', observed: 'x-powered-by: PHP/8.4.24', location: 'https://example.com/', why: 'aids exploitation', recommendation: 'hide banner' },
      recommendation: 'hide banner', scoreImpact: 6, cwe: 'CWE-200', cvssVector: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:L/I:N/A:N', cvssScore: 5.3,
    };

    const first = await upsertVaultFindings({ auditId: audit.id, websiteId: site.id, findings: [finding] });
    const row1 = await db.vaultAuditFinding.findFirst({ where: { websiteId: site.id } });
    expect(first).toBe(1);
    expect(row1?.status).toBe('OPEN');
    expect(row1?.cwe).toBe('CWE-200');
    expect(row1?.cvssScore).toBe(5.3);

    const second = await upsertVaultFindings({ auditId: audit.id, websiteId: site.id, findings: [finding] });
    const count2 = await db.vaultAuditFinding.count({ where: { websiteId: site.id, normalizedIssueKey: 'SEC_SERVER_LEAK' } });
    expect(second).toBe(1);
    expect(count2).toBe(1);
  });
});