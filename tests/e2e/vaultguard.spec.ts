import { test, expect } from '@playwright/test';
import { db } from '@leadguard/database';

async function registerAndAddWebsite(page) {
  const email = `e2e_vault_${Date.now()}@example.com`;
  const siteName = `Vault QA ${Date.now()}`;
  await page.goto('/register');
  await page.getByLabel(/Workspace \/ Company Name/i).fill('VaultGuard QA Org');
  await page.getByLabel(/Email Address/i).fill(email);
  await page.getByLabel(/Password/i).fill('SecurePass1234!');
  await page.getByRole('button', { name: /Get Started/i }).click();
  await expect(page).toHaveURL(/dashboard/);

  await page.goto('/websites');
  await page.getByRole('button', { name: /Add Website/i }).first().click();
  await page.getByPlaceholder('e.g. Acme Production Portal').fill(siteName);
  await page.getByPlaceholder('https://example.com').fill('https://example.com');
  await page.getByRole('button', { name: /Register & Save/i }).click();
  await page.getByRole('link', { name: siteName, exact: true }).click();
  await expect(page).toHaveURL(/\/websites\/.+/);
  return { email, siteName };
}

test('vaultguard security audit: navigation, empty state, FREE-plan guard, and detail render', async ({ page }) => {
  test.setTimeout(90000);
  const { email } = await registerAndAddWebsite(page);

  const consoleErrors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });

  // Navigate into the Security Audit screen from the website detail view
  await page.getByRole('link', { name: /Security Audit/i }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText(/VaultGuard Security Audit/);
  await expect(page.getByText(/No Security Audits Yet/i)).toBeVisible();

  // FREE plan: opening the run modal and starting an audit should surface the
  // apiAccess entitlement error gracefully (no hard crash).
  await page.getByRole('button', { name: /Run New Security Audit/i }).click();
  await page.getByRole('button', { name: /Start Security Audit/i }).click();
  await expect(page.getByText(/Security audits require|Plan|exhausted|quota/i).first()).toBeVisible();

  // Upgrade the org to an API-access PRO plan so the run is allowed
  const member = await db.organizationMember.findFirst({ where: { user: { email } } });
  expect(member).toBeTruthy();
  const orgId = member!.organizationId;
  const plan = await db.plan.upsert({
    where: { code: 'PRO' },
    create: { code: 'PRO', name: 'Pro', priceInPaise: 499900, currency: 'INR', entitlements: { auditsPerMonth: 100, websites: 5, monitoring: true, apiAccess: true, whiteLabel: false, reports: 50, prospectLimit: 100 } },
    update: {},
  });
  await db.subscription.deleteMany({ where: { organizationId: orgId } });
  await db.subscription.create({
    data: { organizationId: orgId, planId: plan.id, status: 'ACTIVE' },
  });

  // Retry the run now that entitlements allow it (close any open modal first)
  await page.getByRole('dialog').getByRole('button', { name: /Cancel/i }).click().catch(() => {});
  await page.getByRole('button', { name: /Run New Security Audit/i }).click();
  await page.getByRole('button', { name: /Start Security Audit/i }).click();

  // The API should now accept the run (202 + enqueue). Poll the DB for it.
  let uiRun: { id: string; websiteId: string } | null = null;
  for (let i = 0; i < 20; i++) {
    uiRun = await db.vaultAuditRun.findFirst({ where: { organizationId: orgId }, select: { id: true, websiteId: true } });
    if (uiRun) break;
    await page.waitForTimeout(500);
  }
  expect(uiRun).toBeTruthy();

  // Navigate to the UI-created run's detail (queued, worker not running) to
  // verify the detail view renders for an in-progress run.
  await page.goto(`/websites/${uiRun!.websiteId}/security-audit/${uiRun!.id}`);
  await expect(page.getByRole('heading', { level: 1 })).toContainText(/Security Audit Detail/);

  // Populate a completed run + findings directly (as the worker would) and
  // verify the detail view renders score ring, metrics, and findings table.
  const website = await db.website.findFirst({ where: { organizationId: orgId } });
  const run = await db.vaultAuditRun.create({
    data: {
      organizationId: orgId,
      websiteId: website!.id,
      mode: 'STANDARD',
      status: 'COMPLETED',
      score: 78,
      pagesDiscovered: 5,
      pagesFetched: 4,
      pagesFailed: 1,
      findingsCount: 3,
      retestedFindings: 1,
      fixedFindings: 1,
      durationMs: 4200,
      summary: { severityCounts: { CRITICAL: 1, HIGH: 1, MEDIUM: 1, LOW: 0 } },
    },
  });
  await db.vaultAuditFinding.createMany({
    data: [
      { websiteId: website!.id, runId: run.id, scannerKey: 'headers', normalizedIssueKey: 'ssl',
        severity: 'CRITICAL', title: 'Missing TLS certificate', description: 'Site serves over plain HTTP.',
        status: 'OPEN', evidence: {}, affectedUrl: 'https://example.com', recommendation: 'Install TLS cert.',
        scoreImpact: 20, cwe: 'CWE-327' },
      { websiteId: website!.id, runId: run.id, scannerKey: 'headers', normalizedIssueKey: 'hsts',
        severity: 'HIGH', title: 'Missing HSTS header', description: 'No Strict-Transport-Security header.',
        status: 'TRIAGED', evidence: {}, affectedUrl: 'https://example.com', recommendation: 'Add HSTS.',
        scoreImpact: 10, cwe: 'CWE-319' },
    ],
  });

  await page.goto(`/websites/${website!.id}/security-audit/${run.id}`);
  await expect(page.getByRole('heading', { level: 1 })).toContainText(/Security Audit Detail/);
  await expect(page.getByText('Missing TLS certificate')).toBeVisible();
  await expect(page.getByText('Missing HSTS header')).toBeVisible();
  await page.waitForTimeout(400);

  // Browser console should be free of uncaught errors. The single 403 is the
  // intentional FREE-plan entitlement guard being exercised above.
  expect(consoleErrors.filter((e) => !/favicon|404|403/i.test(e)).length).toBe(0);
});
