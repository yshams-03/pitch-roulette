import { test, expect } from '@playwright/test';
import { fetchFixtures, hasE2ECredentials, loginViaUI } from './helpers';

test.describe('Home page', () => {
  test('group standings table loads', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'Table' })).toBeVisible();
    await expect(
      page.getByText('Grp.').or(page.getByText('No standings')),
    ).toBeVisible({ timeout: 60_000 });
  });

  test('standings short/full stat view toggle works', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'Short' })).toBeVisible({ timeout: 20_000 });
    await page.getByRole('button', { name: 'Full' }).click();
    await expect(page.getByText('W', { exact: true }).first()).toBeVisible();
    await page.getByRole('button', { name: 'Short' }).click();
  });

  test('fixtures tab shows matches grouped by date', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Fixtures' }).click();
    await expect(page.locator('.ui-surface').first()).toBeVisible({ timeout: 30_000 });
  });

  test('bracket tab renders knockout rounds or empty state', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Bracket' }).click();
    const knockout = page.getByText(/Round of|Quarter-finals|Final|No knockout/i);
    await expect(knockout.first()).toBeVisible({ timeout: 20_000 });
  });

  test('bracket SVG connector lines visible when knockout data exists', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Bracket' }).click();
    const svg = page.locator('svg line');
    const hasKnockout = await page.getByText(/Round of/i).isVisible().catch(() => false);
    if (hasKnockout) {
      await expect(svg.first()).toBeAttached();
    }
  });

  test('bracket match tap opens detail modal', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Bracket' }).click();
    const slot = page.locator('button.ui-surface').first();
    if (await slot.isVisible().catch(() => false)) {
      await slot.click();
      await expect(page.getByRole('button', { name: 'Close' })).toBeVisible();
      await page.getByRole('button', { name: 'Close' }).click();
    }
  });

  test('join room link visible on home', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('link', { name: 'Join room' })).toBeVisible();
  });
});
