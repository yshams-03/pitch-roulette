import { test, expect } from '@playwright/test';
import { hasE2ECredentials, loginAs, loginViaUI, logout, e2eCredentials } from './helpers';

test.describe('Authentication', () => {
  test.skip(!hasE2ECredentials(), 'Set E2E_TEST_EMAIL + E2E_TEST_PASSWORD');

  test('login with valid credentials', async ({ page }) => {
    const auth = await loginViaUI(page);
    await expect(page).toHaveURL('/');
    expect(auth.accessToken).toBeTruthy();
  });

  test('login with wrong password shows error', async ({ page }) => {
    const { email } = e2eCredentials();
    await page.goto('/auth/login');
    await page.getByPlaceholder('Email').fill(email);
    await page.getByPlaceholder('Password').fill('wrong-password-xyz');
    await page.getByRole('button', { name: /^Log in$/i }).click();
    await expect(page.getByText(/invalid|incorrect|wrong|credentials|email or password/i).first()).toBeVisible({ timeout: 10_000 });
    await expect(page).toHaveURL(/\/auth\/login/);
  });

  test('reset password sends email', async ({ page }) => {
    const { email } = e2eCredentials();
    await page.goto('/auth/reset-password');
    await page.getByPlaceholder('Email').fill(email);
    await page.getByRole('button', { name: /Send reset email/i }).click();
    await expect(page.getByText(/Check your email/i)).toBeVisible({ timeout: 10_000 });
  });

  test('protected routes redirect to login when unauthenticated', async ({ page }) => {
    await page.goto('/profile');
    await expect(page).toHaveURL(/\/auth\/login/, { timeout: 10_000 });
    await page.goto('/groups');
    await expect(page).toHaveURL(/\/auth\/login/);
    await page.goto('/room/FAKE01/predict');
    await expect(page).toHaveURL(/\/auth\/login/);
  });

  test('logout clears session', async ({ page }) => {
    await loginViaUI(page);
    await logout(page);
    await expect(page).toHaveURL(/\/auth\/login/, { timeout: 10_000 });
    await page.goto('/profile');
    await expect(page).toHaveURL(/\/auth\/login/, { timeout: 10_000 });
  });

  test('login page renders fields', async ({ page }) => {
    await page.goto('/auth/login');
    await expect(page.getByPlaceholder('Email')).toBeVisible();
    await expect(page.getByPlaceholder('Password')).toBeVisible();
  });

  test('signup page renders form fields', async ({ page }) => {
    await page.goto('/auth/signup');
    await expect(page.getByPlaceholder('Display name')).toBeVisible();
    await expect(page.getByPlaceholder('Username')).toBeVisible();
    await expect(page.getByRole('button', { name: /Create account/i })).toBeVisible();
  });
});
