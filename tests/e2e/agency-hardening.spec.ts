import { test, expect } from '@playwright/test';

test('agency portal flow: client workspaces, prospect campaigns, and lead widgets', async ({ page }) => {
  const email = `e2e_agency_${Date.now()}@example.com`;

  // 1. Register new agency user and workspace
  await page.goto('/register');
  await page.getByLabel(/Workspace \/ Company Name/i).fill('Apex Marketing Agency');
  await page.getByLabel(/Email Address/i).fill(email);
  await page.getByLabel(/Password/i).fill('SecurePass1234!');
  await page.getByRole('button', { name: /Get Started/i }).click();

  // 2. Verified navigation to Dashboard
  await expect(page).toHaveURL(/dashboard/);

  // 3. Navigate to Agency Portal
  await page.goto('/agency');
  await expect(page.getByRole('heading', { level: 1 })).toContainText(/Agency Command Center/i);

  // 4. View Clients Tab
  await page.goto('/agency/clients');
  await expect(page.getByRole('heading', { level: 1 })).toContainText(/Client Workspaces/i);

  // 5. View Prospect Campaigns Tab
  await page.goto('/agency/prospects');
  await expect(page.getByRole('heading', { level: 1 })).toContainText(/500-Site Prospect Hunter/i);

  // 6. View Diagnostic Studio Widgets Tab
  await page.goto('/agency/widgets');
  await expect(page.getByRole('heading', { level: 1 })).toContainText(/Diagnostic Studio Lead Widgets/i);

  // 7. View Competitor Radar Tab
  await page.goto('/agency/competitors');
  await expect(page.getByRole('heading', { level: 1 })).toContainText(/Competitive Weakness Radar/i);
});
