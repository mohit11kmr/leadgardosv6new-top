import { test, expect } from '@playwright/test';

test('application and protected route', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText(/Stop losing leads/i);
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/login/);
});

test('register and add a website', async ({ page }) => {
  const email = `e2e${Date.now()}@example.com`;
  await page.goto('/login');
  await page.getByRole('button', { name: /create an account/i }).click();
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Organization').fill('E2E Workspace');
  await page.getByLabel('Password').fill('correct horse battery staple');
  await page.getByRole('button', { name: /create account/i }).click();
  await expect(page).toHaveURL(/dashboard/);

  await page.getByRole('button', { name: '+ Add website' }).click();
  await page.getByLabel('Website name').fill('Fixture site');
  await page.getByLabel('Website URL').fill('https://example.com');
  await page.getByRole('button', { name: 'Add website ->' }).click();
  await expect(page.getByText('https://example.com')).toBeVisible();
});
