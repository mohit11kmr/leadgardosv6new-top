import { test, expect } from '@playwright/test';

test('unauthenticated users are redirected to login', async ({ page }) => {
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/login/);
  await expect(page.getByRole('heading', { level: 2 })).toContainText(/Sign In to LeadGuard OS/i);
});

test('user registration, website management, and executive dashboard flow', async ({ page }) => {
  const email = `e2e_leadguard_${Date.now()}@example.com`;

  // 1. Register new user and workspace
  await page.goto('/register');
  await page.getByLabel(/Workspace \/ Company Name/i).fill('Acme Corp');
  await page.getByLabel(/Email Address/i).fill(email);
  await page.getByLabel(/Password/i).fill('SecurePass1234!');
  await page.getByRole('button', { name: /Get Started/i }).click();

  // 2. Verified navigation to Dashboard
  await expect(page).toHaveURL(/dashboard/);
  await expect(page.getByText(/Acme Corp/i)).toBeVisible();
  await expect(page.getByText(/No Websites Added Yet/i)).toBeVisible();

  // 3. Add Website
  await page.goto('/websites');
  await page.getByRole('button', { name: /\+ Add Website/i }).click();
  await page.getByLabel(/Website Name/i).fill('Acme Global');
  await page.getByLabel(/Target URL/i).fill('https://example.com');
  await page.getByRole('button', { name: /Register & Save/i }).click();

  // 4. Verify Website in Catalog
  await expect(page.getByText('Acme Global')).toBeVisible();
  await expect(page.getByText('https://example.com')).toBeVisible();

  // 5. Navigate to Dashboard and verify website state updated
  await page.goto('/dashboard');
  await expect(page.getByText(/Executive Revenue & Diagnostic Intelligence/i)).toBeVisible();
  await expect(page.getByText(/No Audits Executed/i)).toBeVisible();
});
