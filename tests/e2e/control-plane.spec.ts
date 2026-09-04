import { test, expect } from '@playwright/test';
import { db } from '@leadguard/database';

test('control plane flow: revenue dashboard, operations, security events, and customer 360', async ({ page }) => {
  test.setTimeout(60000);
  const email = `e2e_cp_${Date.now()}@example.com`;

  // 1. Register new user and workspace
  await page.goto('/register');
  await page.getByLabel(/Workspace \/ Company Name/i).fill('Control Plane Test Org');
  await page.getByLabel(/Email Address/i).fill(email);
  await page.getByLabel(/Password/i).fill('SecurePass1234!');
  await page.getByRole('button', { name: /Get Started/i }).click();
  await expect(page).toHaveURL(/dashboard/);

  // 2. Promote to platformAdmin + OWNER role (real DB write, matching the
  // established phase8-platform.spec.ts pattern), then reload so the
  // client re-fetches /auth/me and picks up the new capabilities.
  await db.user.update({ where: { email }, data: { platformAdmin: true, platformRole: 'OWNER' } });
  await page.reload();

  // 3. Admin dashboard shows the new capability-gated nav cards.
  await page.goto('/admin');
  await expect(page.getByRole('heading', { level: 1 })).toContainText(/System Administration/i);
  await expect(page.getByRole('link', { name: /Open Revenue Dashboard/i })).toBeVisible();
  await expect(page.getByRole('link', { name: /Open Operations/i })).toBeVisible();
  await expect(page.getByRole('link', { name: /Open Security Events/i })).toBeVisible();

  // 4. Revenue Dashboard renders real MRR/ARR figures (not fabricated —
  // this org has no subscription, so 0 is the correct, real value).
  await page.goto('/admin/revenue');
  await expect(page.getByRole('heading', { level: 1 })).toContainText(/Revenue Dashboard/i);
  await expect(page.getByText(/Current MRR/i).first()).toBeVisible();
  await expect(page.getByText(/Unsupported/i).first()).toBeVisible();

  // 5. Operations view renders real queue names, not a hardcoded/fake list.
  await page.goto('/admin/operations');
  await expect(page.getByRole('heading', { level: 1 })).toContainText(/Operations/i);
  await expect(page.getByText('audit', { exact: true })).toBeVisible();
  await expect(page.getByText('webhook', { exact: true })).toBeVisible();

  // 6. Security Events view renders (even if empty for a fresh org).
  await page.goto('/admin/security');
  await expect(page.getByRole('heading', { level: 1 })).toContainText(/Security Events/i);

  // 7. Organizations list has a "View 360" link into the Customer 360 page.
  await page.goto('/admin/organizations');
  await expect(page.getByRole('heading', { level: 1 })).toContainText(/Organization Tenant Moderation/i);
  await page.getByRole('link', { name: /View 360/i }).first().click();
  await expect(page).toHaveURL(/\/admin\/organizations\/[a-f0-9-]+/);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.getByText(/Customer Health/i)).toBeVisible();
  await expect(page.getByText(/Business Impact Trend/i)).toBeVisible();
});
