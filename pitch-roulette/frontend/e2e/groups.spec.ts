import { test, expect } from '@playwright/test';
import {
  cleanupRoom,
  createDemoRoom,
  endRoomApi,
  hasE2ECredentials,
  hasE2EUser2,
  loginAs,
  loginViaUI,
  e2eCredentials,
  e2eCredentials2,
} from './helpers';

test.describe.configure({ mode: 'serial' });

test.describe('Friend Groups', () => {
  test.skip(!hasE2ECredentials(), 'Set E2E_TEST_EMAIL + E2E_TEST_PASSWORD');

  let groupId = '';
  let inviteCode = '';

  test('create a group', async ({ page }) => {
    await loginViaUI(page);
    await page.goto('/groups/create');
    const name = `Test Squad ${Date.now()}`;
    await page.getByPlaceholder('Group name').fill(name);
    await page.getByRole('button', { name: 'Create' }).click();
    await page.waitForURL(/\/groups\//, { timeout: 15_000 });
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Test Squad');
    const codeBtn = page.getByText(/Code:/i);
    await expect(codeBtn).toBeVisible();
    const text = await codeBtn.innerText();
    inviteCode = text.match(/[A-Z0-9]{6,}/)?.[0] || '';
    groupId = page.url().split('/groups/')[1] || '';
    expect(groupId).toBeTruthy();
  });

  test('join group via invite code', async ({ page }) => {
    test.skip(!hasE2EUser2() || !inviteCode, 'Needs user2 + created group');
    await loginAs(page, e2eCredentials2().email, e2eCredentials2().password);
    await page.goto('/groups/join');
    await page.getByPlaceholder('Invite code').fill(inviteCode);
    await page.getByRole('button', { name: 'Join' }).click();
    await page.waitForURL(/\/groups\//, { timeout: 15_000 });
    await expect(page.getByText(/Group leaderboard/i)).toBeVisible();
  });
});

test.describe('Global Leaderboard', () => {
  test('global leaderboard loads and paginates @pr-smoke', async ({ page }) => {
    if (hasE2ECredentials()) await loginViaUI(page);
    await page.goto('/leaderboard');
    await expect(page.getByRole('heading', { name: /Global Leaderboard/i })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'All Time' })).toBeVisible();
    await page.getByRole('tab', { name: 'This Month' }).click();
    await page.getByRole('tab', { name: 'This Week' }).click();
    await expect(page.getByRole('button', { name: 'Load more' })).toBeVisible();
  });

  test('own rank shown when logged in', async ({ page }) => {
    test.skip(!hasE2ECredentials(), 'Needs login');
    await loginViaUI(page);
    await page.goto('/leaderboard');
    await expect(page.getByText(/Your rank:/i)).toBeVisible({ timeout: 15_000 });
  });
});
