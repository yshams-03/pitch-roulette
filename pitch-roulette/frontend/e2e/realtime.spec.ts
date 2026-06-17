import { test, expect, type Browser } from '@playwright/test';
import {
  cleanupRoom,
  createDemoRoom,
  expandChat,
  hasE2ECredentials,
  hasE2EUser2,
  injectFlashBet,
  joinRoomApi,
  loginAs,
  loginViaUI,
  openPredictions,
  openSecondBrowser,
  setupDemoLiveRoom,
  startRoomApi,
  waitForFlashBet,
  e2eCredentials2,
  type TestAuth,
} from './helpers';

test.describe.configure({ mode: 'serial' });

test.describe('Realtime Connectivity', () => {
  test.skip(!hasE2ECredentials(), 'Set E2E_TEST_EMAIL + E2E_TEST_PASSWORD');

  let auth: TestAuth;
  let code = '';

  test.afterEach(async () => {
    if (code) await cleanupRoom(auth.accessToken, code).catch(() => {});
    code = '';
  });

  test('Live indicator shown when connected', async ({ page }) => {
    auth = await loginViaUI(page);
    ({ code } = await createDemoRoom(auth.accessToken));
    await page.goto(`/room/${code}/lobby`);
    await expect(page.getByText('🟢 Live')).toBeVisible({ timeout: 20_000 });
  });

  test('room state change redirects to predict', async ({ page }) => {
    auth = await loginViaUI(page);
    ({ code } = await createDemoRoom(auth.accessToken));
    await page.goto(`/room/${code}/lobby`);
    await startRoomApi(auth.accessToken, code);
    await page.waitForURL(/\/predict/, { timeout: 10_000 });
  });

  test('player list updates when second user joins', async ({ browser }) => {
    test.skip(!hasE2EUser2(), 'Needs E2E_TEST_EMAIL_2');
    const page1 = await browser.newPage();
    auth = await loginViaUI(page1);
    ({ code } = await createDemoRoom(auth.accessToken));
    await page1.goto(`/room/${code}/lobby`);
    const before = await page1.locator('.rounded-xl').count();

    const { page2, context2 } = await openSecondBrowser(browser);
    const auth2 = await loginAs(page2, e2eCredentials2().email, e2eCredentials2().password);
    await joinRoomApi(auth2.accessToken, code);
    await page2.goto(`/room/${code}/lobby`);

    await expect
      .poll(async () => page1.locator('.rounded-xl').count(), { timeout: 10_000 })
      .toBeGreaterThan(before);

    await context2.close();
    await page1.close();
  });

  test('flash bet card appears on live page after inject', async ({ page }) => {
    auth = await loginViaUI(page);
    ({ code } = await setupDemoLiveRoom(page, auth.accessToken));
    await injectFlashBet(auth.accessToken, code);
    await page.reload();
    await waitForFlashBet(page);
  });
});
