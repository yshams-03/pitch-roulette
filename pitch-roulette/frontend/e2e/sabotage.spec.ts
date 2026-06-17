import { test, expect, type Browser } from '@playwright/test';
import {
  advanceToDraft,
  api,
  cleanupRoom,
  createDemoRoom,
  expandChat,
  fetchRoom,
  goLiveApi,
  gotoHostPanel,
  gotoLiveRoom,
  hasE2ECredentials,
  hasE2EUser2,
  injectFlashBet,
  joinRoomApi,
  lockRoomApi,
  loginAs,
  loginViaUI,
  openSabotageShop,
  openSecondBrowser,
  playerPc,
  purchaseSabotageApi,
  setupDemoLiveRoom,
  startRoomApi,
  e2eCredentials2,
  type TestAuth,
} from './helpers';

test.describe.configure({ mode: 'serial' });

test.describe('Sabotage Shop', () => {
  test.skip(!hasE2ECredentials(), 'Set E2E_TEST_EMAIL + E2E_TEST_PASSWORD');

  let auth: TestAuth;
  let code = '';
  let botTargetId = '';

  test.beforeEach(async ({ page }) => {
    auth = await loginViaUI(page);
    const created = await createDemoRoom(auth.accessToken);
    code = created.code;
    const room = await fetchRoom(code, auth.accessToken);
    const bot = (room.players as Array<{ user_id: string; is_host?: boolean }>).find((p) => !p.is_host);
    botTargetId = bot?.user_id || '';
    await startRoomApi(auth.accessToken, code);
    try {
      await api(`/api/rooms/${code}/predict`, auth.accessToken, {
        method: 'POST',
        body: JSON.stringify({ home_goals: 2, away_goals: 1, predicted_outcome: 'HOME_WIN' }),
      });
    } catch { /* ok */ }
    await lockRoomApi(auth.accessToken, code);
    await goLiveApi(auth.accessToken, code);
    await page.goto(`/room/${code}/live`);
    await expect(page.getByTestId('live-badge')).toBeVisible({ timeout: 30_000 });
  });

  test.afterEach(async () => {
    if (code) await cleanupRoom(auth.accessToken, code).catch(() => {});
    code = '';
  });

  test('shop opens and shows all 6 sabotage types', async ({ page }) => {
    await openSabotageShop(page);
    for (const type of ['BLINDFOLD', 'TAX', 'SILENCE', 'JINX', 'MIRROR', 'DOUBLE_OR_NOTHING']) {
      await expect(page.getByTestId(`buy-${type}`).first()).toBeVisible();
    }
    await expect(page.getByTestId('shop-pc-balance')).toBeVisible();
  });

  test('TAX deducts PC from buyer and target', async ({ page }) => {
    const beforeBuyer = playerPc(await fetchRoom(code, auth.accessToken), auth.userId);
    const beforeBot = playerPc(await fetchRoom(code, auth.accessToken), botTargetId);
    await purchaseSabotageApi(auth.accessToken, code, 'TAX', botTargetId);
    const room = await fetchRoom(code, auth.accessToken);
    expect(playerPc(room, auth.userId)).toBe(beforeBuyer - 20);
    expect(playerPc(room, botTargetId)).toBe(beforeBot - 10);
  });

  test('cannot target yourself in shop UI', async ({ page }) => {
    await openSabotageShop(page);
    const me = await fetchRoom(code, auth.accessToken);
    const myName = (me.players as Array<{ user_id: string; display_name?: string }>)
      .find((p) => p.user_id === auth.userId)?.display_name;
    if (myName) {
      await expect(page.getByTestId('sabotage-shop-sheet').getByText(myName, { exact: true })).toHaveCount(0);
    }
  });

  test('cannot buy if insufficient PC', async ({ page }) => {
    for (let i = 0; i < 6; i++) {
      try {
        await purchaseSabotageApi(auth.accessToken, code, 'TAX', botTargetId);
      } catch {
        break;
      }
    }
    await page.reload();
    await openSabotageShop(page);
    const donBtn = page.getByTestId('buy-DOUBLE_OR_NOTHING').first();
    await expect(donBtn).toBeDisabled();
  });

  test('host panel shows active sabotages including MIRROR', async ({ page }) => {
    await purchaseSabotageApi(auth.accessToken, code, 'MIRROR', botTargetId);
    await purchaseSabotageApi(auth.accessToken, code, 'JINX', botTargetId);
    await gotoHostPanel(page, code);
    await expect(page.getByText(/Active sabotages/i)).toBeVisible();
    await expect(page.getByText(/MIRROR|Mirror|JINX|Jinx/i).first()).toBeVisible({ timeout: 10_000 });
  });

  test('sabotage purchase via UI shows toast', async ({ page }) => {
    await openSabotageShop(page);
    await page.getByTestId('buy-BLINDFOLD').first().click();
    await expect(page.getByText(/sent to/i)).toBeVisible({ timeout: 10_000 });
  });

  test('buying same type replaces prior active sabotage', async ({ page }) => {
    await purchaseSabotageApi(auth.accessToken, code, 'JINX', botTargetId);
    await purchaseSabotageApi(auth.accessToken, code, 'JINX', botTargetId);
    const r = await api<{ room_active?: Array<{ sabotage_type: string; state: string }> }>(
      `/api/rooms/${code}/sabotages`,
      auth.accessToken,
    );
    const jinxActive = (r.room_active || []).filter(
      (s) => s.sabotage_type === 'JINX' && s.state === 'ACTIVE',
    );
    expect(jinxActive.length).toBeLessThanOrEqual(1);
  });
});

test.describe('Sabotage Shop — two players', () => {
  test.skip(!hasE2ECredentials() || !hasE2EUser2(), 'Needs E2E_TEST_EMAIL_2');

  test('SILENCE blocks chat for target', async ({ browser }) => {
    const page1 = await browser.newPage();
    const auth1 = await loginViaUI(page1);
    const { code } = await createDemoRoom(auth1.accessToken);
    await advanceToDraft(page1, auth1.accessToken, code);
    await api(`/api/rooms/${code}/go-live`, auth1.accessToken, { method: 'POST', body: '{}' });
    await gotoLiveRoom(page1, code);

    const { page2, context2 } = await openSecondBrowser(browser);
    const auth2 = await loginAs(page2, e2eCredentials2().email, e2eCredentials2().password);
    await joinRoomApi(auth2.accessToken, code);
    await gotoLiveRoom(page2, code);

    await purchaseSabotageApi(auth1.accessToken, code, 'SILENCE', auth2.userId);
    await page2.reload();
    await expandChat(page2);
    await expect(page2.getByTestId('chat-silenced')).toBeVisible({ timeout: 15_000 });

    await cleanupRoom(auth1.accessToken, code).catch(() => {});
    await context2.close();
    await page1.close();
  });

  test('BLINDFOLD hides flash bet options for target', async ({ browser }) => {
    const page1 = await browser.newPage();
    const auth1 = await loginViaUI(page1);
    const { code } = await createDemoRoom(auth1.accessToken);
    await setupDemoLiveRoom(page1, auth1.accessToken);

    const { page2, context2 } = await openSecondBrowser(browser);
    const auth2 = await loginAs(page2, e2eCredentials2().email, e2eCredentials2().password);
    await joinRoomApi(auth2.accessToken, code);

    await purchaseSabotageApi(auth1.accessToken, code, 'BLINDFOLD', auth2.userId);
    await injectFlashBet(auth1.accessToken, code);
    await gotoLiveRoom(page2, code);
    await expect(page2.getByTestId('blindfold-option-0')).toBeVisible({ timeout: 20_000 });

    await cleanupRoom(auth1.accessToken, code).catch(() => {});
    await context2.close();
    await page1.close();
  });
});
