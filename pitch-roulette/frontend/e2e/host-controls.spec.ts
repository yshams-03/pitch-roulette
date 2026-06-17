import { test, expect } from '@playwright/test';
import {
  api,
  expandChat,
  fetchRoom,
  gotoHostPanel,
  gotoLiveRoom,
  listPlayers,
  loginViaUI,
  setupDemoLiveRoom,
  type TestAuth,
} from './helpers';

const hasE2E = Boolean(process.env.E2E_TEST_EMAIL && process.env.E2E_TEST_PASSWORD);

test.describe('Host controls', () => {
  test.skip(!hasE2E, 'Set E2E_TEST_EMAIL + E2E_TEST_PASSWORD in the shell');

  let auth: TestAuth;
  let code: string;

  test.beforeEach(async ({ page }) => {
    auth = await loginViaUI(page);
    ({ code } = await setupDemoLiveRoom(page, auth.accessToken));
  });

  test('kick player removes bot from room', async ({ page }) => {
    const room = await fetchRoom(code, auth.accessToken);
    const victim = listPlayers(room).find((p) => !p.is_host);
    expect(victim, 'demo room should have at least one bot').toBeTruthy();

    await gotoHostPanel(page, code);
    await page.getByTestId(`kick-player-${victim!.user_id}`).click();

    await expect
      .poll(async () => listPlayers(await fetchRoom(code, auth.accessToken)).some((p) => p.user_id === victim!.user_id))
      .toBe(false);
  });

  test('toggle chat disables and re-enables input', async ({ page }) => {
    await gotoHostPanel(page, code);
    await expect(page.getByTestId('chat-toggle-off')).toBeVisible();
    await page.getByTestId('chat-toggle-off').click();
    await expect
      .poll(async () => (await fetchRoom(code, auth.accessToken)).chat_enabled)
      .toBe(false);

    await gotoLiveRoom(page, code);
    await expect
      .poll(async () => (await page.getByTestId('room-chat').getAttribute('data-chat-enabled')) === 'false')
      .toBe(true);
    await expect(page.getByTestId('chat-disabled')).toBeVisible();
    await expect(page.getByTestId('chat-input')).toHaveCount(0);

    await gotoHostPanel(page, code);
    await expect(page.getByTestId('chat-toggle-on')).toBeVisible();
    await page.getByTestId('chat-toggle-on').click();
    await expect
      .poll(async () => (await fetchRoom(code, auth.accessToken)).chat_enabled)
      .not.toBe(false);

    await gotoLiveRoom(page, code);
    await expandChat(page);
    await expect(page.getByTestId('chat-input')).toBeVisible({ timeout: 10_000 });
  });

  test('manual flash bet appears on live page', async ({ page }) => {
    await gotoHostPanel(page, code);
    await Promise.all([
      page.waitForResponse(
        (r) => r.url().includes('/flash-bets') && r.request().method() === 'POST' && r.ok(),
        { timeout: 15_000 },
      ),
      page.getByTestId('create-flash-bet-btn').click(),
    ]);

    await page.goto(`/room/${code}/live`);
    await expect(page.getByTestId('flash-bet-card')).toBeVisible({ timeout: 15_000 });
  });

  test('resolve flash bet marks bet resolved', async ({ page }) => {
    const question = `E2E resolve ${Date.now()}?`;
    await api(`/api/rooms/${code}/flash-bets`, auth.accessToken, {
      method: 'POST',
      body: JSON.stringify({ question, options: ['Yes', 'No'], wager_tier: 'LOW' }),
    });

    await page.goto(`/room/${code}/live`);
    const yesBtn = page.getByTestId('flash-bet-card').getByRole('button', { name: 'Yes', exact: true });
    await expect(yesBtn).toBeEnabled({ timeout: 15_000 });
    await yesBtn.click();
    await expect(page.getByText('Your pick: Yes', { exact: true })).toBeVisible();

    await gotoHostPanel(page, code);
    await page.locator('select').selectOption('Yes');
    await page.getByTestId('resolve-flash-bet-btn').click();

    await expect
      .poll(async () => {
        const res = await api<{ bets: Array<{ question: string; state: string }> }>(
          `/api/rooms/${code}/flash-bets`,
        );
        return res.bets.find((b) => b.question === question)?.state;
      })
      .toBe('RESOLVED');
  });

  test('inject event adds match event to panel', async ({ page }) => {
    await gotoHostPanel(page, code);
    await page.getByTestId('inject-event-btn').click();

    await expect
      .poll(async () => {
        const r = await fetchRoom(code, auth.accessToken);
        const md = r.match_data as { events_log?: unknown[] } | undefined;
        return md?.events_log?.length ?? 0;
      })
      .toBeGreaterThan(0);

    await page.goto(`/room/${code}/live`);
    await expect(page.getByTestId('match-events-panel')).toBeVisible();
    await expect(page.getByTestId('match-events-panel').locator('li').first()).toBeVisible({
      timeout: 15_000,
    });
  });

  test.skip('transfer host when original host leaves', async () => {
    // Host transfer is not implemented yet.
  });
});
