import { test, expect } from '@playwright/test';
import {
  advanceToDraft,
  api,
  cleanupRoom,
  createDemoRoom,
  fetchRoom,
  getDraftPicks,
  getRoomState,
  gotoHostPanel,
  goLiveApi,
  hasE2ECredentials,
  loginViaUI,
  pickPlayer,
  pickThreePlayers,
  startDraft,
  startDraftApi,
  waitForDraftPhase,
  waitForRoomState,
  type TestAuth,
} from './helpers';

test.describe.configure({ mode: 'serial' });

test.describe('Fantasy Draft', () => {
  test.skip(!hasE2ECredentials(), 'Set E2E_TEST_EMAIL + E2E_TEST_PASSWORD');

  let auth: TestAuth;
  let code = '';

  test.afterEach(async () => {
    if (code) await cleanupRoom(auth.accessToken, code).catch(() => {});
    code = '';
  });

  test('draft phase appears after lock predictions', async ({ page }) => {
    auth = await loginViaUI(page);
    ({ code } = await createDemoRoom(auth.accessToken));
    await advanceToDraft(page, auth.accessToken, code);
    await expect(page.getByTestId('draft-page')).toBeVisible();
    await expect(page.getByText(/\d+s/)).toBeVisible();
    await expect(page.getByText('HOME')).toBeVisible();
    await expect(page.getByText('AWAY')).toBeVisible();
    await expect(page.getByTestId('draft-player-card').first()).toBeVisible();
  });

  test('can pick exactly 3 players', async ({ page }) => {
    auth = await loginViaUI(page);
    ({ code } = await createDemoRoom(auth.accessToken));
    await advanceToDraft(page, auth.accessToken, code);
    await pickThreePlayers(page);
    await expect(page.getByText(/Your picks: 3\/3/i)).toBeVisible({ timeout: 15_000 });
    const picks = await getDraftPicks(auth.accessToken, code, auth.userId);
    expect(picks.length).toBe(3);
  });

  test('position color coding on player cards', async ({ page }) => {
    auth = await loginViaUI(page);
    ({ code } = await createDemoRoom(auth.accessToken));
    await advanceToDraft(page, auth.accessToken, code);
    const card = page.getByTestId('draft-player-card').first();
    await expect(card).toBeVisible();
    const cls = await card.locator('p').first().getAttribute('class');
    expect(cls).toMatch(/yellow|blue|green|red|text-white/);
  });

  test('go live auto-assigns before transition', async ({ page }) => {
    auth = await loginViaUI(page);
    ({ code } = await createDemoRoom(auth.accessToken));
    await advanceToDraft(page, auth.accessToken, code);
    await goLiveApi(auth.accessToken, code);
    await waitForRoomState(code, auth.accessToken, /^LIVE$/);
    const picks = await getDraftPicks(auth.accessToken, code, auth.userId);
    expect(picks.length).toBe(3);
  });

  test('host panel shows draft controls when closed', async ({ page }) => {
    auth = await loginViaUI(page);
    ({ code } = await createDemoRoom(auth.accessToken));
    await api(`/api/rooms/${code}/start`, auth.accessToken, { method: 'POST', body: '{}' });
    await api(`/api/rooms/${code}/lock`, auth.accessToken, { method: 'POST', body: '{}' });
    await gotoHostPanel(page, code);
    await expect(page.getByRole('button', { name: 'Start draft' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Skip draft/i })).toBeVisible();
  });

  test('bots pick players on draft start', async ({ page }) => {
    auth = await loginViaUI(page);
    ({ code } = await createDemoRoom(auth.accessToken));
    await advanceToDraft(page, auth.accessToken, code);
    await page.waitForTimeout(2500);
    const r = await api<{ all?: unknown[] }>(`/api/rooms/${code}/draft/picks`, auth.accessToken);
    expect((r.all || []).length).toBeGreaterThan(3);
  });

  test('draft timer counts down', async ({ page }) => {
    auth = await loginViaUI(page);
    ({ code } = await createDemoRoom(auth.accessToken));
    await advanceToDraft(page, auth.accessToken, code);
    const t1 = await page.getByText(/\d+s/).innerText();
    await page.waitForTimeout(2000);
    const t2 = await page.getByText(/\d+s/).innerText();
    expect(t1).not.toBe(t2);
  });

  test('taken player shows overlay text', async ({ page }) => {
    auth = await loginViaUI(page);
    ({ code } = await createDemoRoom(auth.accessToken));
    await advanceToDraft(page, auth.accessToken, code);
    await pickPlayer(page);
    await expect(page.getByText(/Taken by/i).first()).toBeVisible({ timeout: 10_000 });
  });
});
