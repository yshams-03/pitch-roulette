import { test, expect } from '@playwright/test';
import {
  cleanupRoom,
  createDemoRoom,
  createFlashBetApi,
  fetchRoom,
  getActivePC,
  gotoLiveRoom,
  hasE2ECredentials,
  injectFlashBet,
  loginViaUI,
  openPredictions,
  playerPc,
  resolveActiveFlashBet,
  resolveFlashBetApi,
  setupDemoLiveRoom,
  startRoomApi,
  waitForFlashBet,
  answerFlashBet,
  api,
  type TestAuth,
} from './helpers';

test.describe.configure({ mode: 'serial' });

test.describe('Pitch Chips (PC)', () => {
  test.skip(!hasE2ECredentials(), 'Set E2E_TEST_EMAIL + E2E_TEST_PASSWORD');

  let auth: TestAuth;
  let code = '';

  test.beforeEach(async ({ page }) => {
    auth = await loginViaUI(page);
    const created = await createDemoRoom(auth.accessToken);
    code = created.code;
    await startRoomApi(auth.accessToken, code);
  });

  test.afterEach(async () => {
    if (code) await cleanupRoom(auth.accessToken, code).catch(() => {});
    code = '';
  });

  test('all players start with 100 PC on room join', async ({ page }) => {
    const room = await fetchRoom(code, auth.accessToken);
    expect(playerPc(room, auth.userId)).toBe(100);
    await openPredictions(page, auth.accessToken, code);
    await expect(page.getByTestId('assigned-side-badge')).toBeVisible();
  });

  test('correct flash bet answer adds PC', async ({ page }) => {
    await setupDemoLiveRoom(page, auth.accessToken);
    const before = await getActivePC(page);
    await injectFlashBet(auth.accessToken, code, `PC win ${Date.now()}?`, ['Yes', 'No'], 'LOW');
    await page.reload();
    await waitForFlashBet(page);
    await answerFlashBet(page, 'Yes');
    await resolveActiveFlashBet(auth.accessToken, code, 'Yes');
    await page.reload();
    await expect
      .poll(async () => playerPc(await fetchRoom(code, auth.accessToken), auth.userId))
      .toBeGreaterThanOrEqual(before);
  });

  test('wrong flash bet answer deducts PC', async ({ page }) => {
    await setupDemoLiveRoom(page, auth.accessToken);
    const before = playerPc(await fetchRoom(code, auth.accessToken), auth.userId);
    await injectFlashBet(auth.accessToken, code, `PC loss ${Date.now()}?`, ['Yes', 'No'], 'LOW');
    await page.reload();
    await waitForFlashBet(page);
    await answerFlashBet(page, 'No');
    await resolveActiveFlashBet(auth.accessToken, code, 'Yes');
    await page.reload();
    const after = playerPc(await fetchRoom(code, auth.accessToken), auth.userId);
    expect(after).toBeLessThan(before);
  });

  test('results party board ranks by PC', async ({ page }) => {
    await setupDemoLiveRoom(page, auth.accessToken);
    await api(`/api/rooms/${code}/end`, auth.accessToken, { method: 'POST', body: '{}' });
    await page.goto(`/room/${code}/results`);
    await expect(page.getByText(/Party board/i)).toBeVisible();
    await expect(page.getByText(/PC/)).toBeVisible();
  });

  test('PC wager tiers shown on flash bet card', async ({ page }) => {
    await setupDemoLiveRoom(page, auth.accessToken);
    await createFlashBetApi(auth.accessToken, code, 'Tier test?', ['Yes', 'No'], 'HIGH');
    await page.reload();
    await expect(page.getByTestId('flash-bet-card')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/Wager: 20 PC/)).toBeVisible();
  });

  test('MEDIUM tier shows 10 PC wager', async ({ page }) => {
    await setupDemoLiveRoom(page, auth.accessToken);
    await createFlashBetApi(auth.accessToken, code, 'Medium tier?', ['Yes', 'No'], 'MEDIUM');
    await page.reload();
    await expect(page.getByText(/Wager: 10 PC/)).toBeVisible({ timeout: 15_000 });
  });

  test('LOW tier shows 5 PC wager', async ({ page }) => {
    await setupDemoLiveRoom(page, auth.accessToken);
    await createFlashBetApi(auth.accessToken, code, 'Low tier?', ['Yes', 'No'], 'LOW');
    await page.reload();
    await expect(page.getByText(/Wager: 5 PC/)).toBeVisible({ timeout: 15_000 });
  });
});
