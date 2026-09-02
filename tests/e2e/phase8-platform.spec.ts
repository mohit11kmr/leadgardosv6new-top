import { test, expect } from '@playwright/test';
import { db } from '@leadguard/database';

test('phase 8 platform flow: reports, developer api portal, webhooks, admin, and settings', async ({ page }) => {
  test.setTimeout(60000);
  const email = `e2e_p8_${Date.now()}@example.com`;

  // 1. Register new user and workspace
  await page.goto('/register');
  await page.getByLabel(/Workspace \/ Company Name/i).fill('Phase 8 Enterprise Org');
  await page.getByLabel(/Email Address/i).fill(email);
  await page.getByLabel(/Password/i).fill('SecurePass1234!');
  await page.getByRole('button', { name: /Get Started/i }).click();

  // 2. Navigation to Dashboard
  await expect(page).toHaveURL(/dashboard/);

  // 3. Navigate to Reports ListView
  await page.goto('/reports');
  await expect(page.getByRole('heading', { level: 1 })).toContainText(/Diagnostic Reports/i);

  // 4. Navigate to Developer Dashboard
  await page.goto('/developer');
  await expect(page.getByRole('heading', { level: 1 })).toContainText(/Developer Platform & APIs/i);

  // 5. Navigate to API Keys View
  await page.goto('/developer/api-keys');
  await expect(page.getByRole('heading', { level: 1 })).toContainText(/API Keys & Scoped Credentials/i);

  // 6. Navigate to Webhooks View
  await page.goto('/developer/webhooks');
  await expect(page.getByRole('heading', { level: 1 })).toContainText(/Webhooks & Event Streams/i);

  // 7. Admin is a company-internal surface, not a customer feature — a
  // freshly registered org owner must be redirected away, not shown it.
  await page.goto('/admin');
  await expect(page).toHaveURL(/dashboard/);

  // 8. Only once the account is actually promoted to platform admin does the
  // gate open. A page reload is required so the client re-fetches /auth/me.
  await db.user.update({ where: { email }, data: { platformAdmin: true } });
  await page.reload();
  await page.goto('/admin');
  await expect(page.getByRole('heading', { level: 1 })).toContainText(/System Administration/i);

  // 9. Navigate to Admin Users View
  await page.goto('/admin/users');
  await expect(page.getByRole('heading', { level: 1 })).toContainText(/User Accounts Management/i);

  // 10. Navigate to Settings & Profile View
  await page.goto('/settings');
  await expect(page.getByRole('heading', { level: 1 })).toContainText(/Account & Profile Settings/i);

  // 11. Navigate to Notification Settings View
  await page.goto('/settings/notifications');
  await expect(page.getByRole('heading', { level: 1 })).toContainText(/Notification Preferences/i);

  // 12. Navigate to Active Sessions & Security
  await page.goto('/settings/security');
  await expect(page.getByRole('heading', { level: 1 })).toContainText(/Active Sessions & Account Security/i);

  // 13. Navigate to Testimonials Wall
  await page.goto('/testimonials');
  await expect(page.getByRole('heading', { level: 1 })).toContainText(/Customer Testimonials Wall/i);
});
