import { test, expect } from '@playwright/test';
test('renders the GitHub sign-in screen for a controlled anonymous session', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Tu aula, conectada con GitHub.' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Continuar con GitHub' })).toHaveAttribute('href', '/auth/github');
});
test('reports an unavailable session API truthfully', async ({ page }) => {
  await page.route('**/me', route => route.abort());
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'No pudimos cargar tu sesión.' })).toBeVisible();
});
