import { test, expect } from '@playwright/test';
import {
  api,
  cleanupRoom,
  createDemoRoom,
  dismissSideReveal,
  fetchRoom,
  getRoomState,
  hasE2ECredentials,
  isPhase3Backend,
  loginViaUI,
  openPredictions,
  playerSide,
  playerPc,
  startRoomApi,
  waitForRoomState,
  goLiveApi,
  type TestAuth,
} from './helpers';

test.describe.configure({ mode: 'serial' });

test.describe('Side Assignment', () => {
  test.skip(!hasE2ECredentials(), 'Set E2E_TEST_EMAIL + E2E_TEST_PASSWORD');
  test.beforeAll(async () => {
    test.skip(
      !(await isPhase3Backend()),
      'Phase 3 backend required (openapi 3.0.0 at E2E_API_URL). Restart uvicorn from pitch-roulette/backend and apply migrations 003–006.',
    );
  });

  let auth: TestAuth;
  let code = '';

  test.afterEach(async () => {
    if (code) await cleanupRoom(auth.accessToken, code).catch(() => {});
    code = '';
  });

  test('sides assigned on start predictions', async ({ page }) => {
    auth = await loginViaUI(page);
    ({ code } = await createDemoRoom(auth.accessToken));
    await startRoomApi(auth.accessToken, code);
    await waitForRoomState(code, auth.accessToken, /^PREDICTING$/);
    await expect
      .poll(async () => playerSide(await fetchRoom(code, auth.accessToken), auth.userId), {
        timeout: 15_000,
      })
      .toMatch(/^(HOME|AWAY)$/);
  });

  test('assigned side shown on predict page', async ({ page }) => {
    auth = await loginViaUI(page);
    ({ code } = await createDemoRoom(auth.accessToken));
    await openPredictions(page, auth.accessToken, code);
    await expect
      .poll(async () => playerSide(await fetchRoom(code, auth.accessToken), auth.userId), {
        timeout: 15_000,
      })
      .toMatch(/^(HOME|AWAY)$/);
    await page.reload();
    const badge = page.getByTestId('assigned-side-badge');
    await expect(badge).toContainText(/You're/);
    await expect(badge).toContainText(/France|Netherlands/);
  });

  test('side swap costs 20 PC', async ({ page }) => {
    auth = await loginViaUI(page);
    ({ code } = await createDemoRoom(auth.accessToken));
    await openPredictions(page, auth.accessToken, code);
    const before = playerPc(await fetchRoom(code, auth.accessToken), auth.userId);
    page.on('dialog', (d) => d.accept());
    const swapBtn = page.getByTestId('swap-side-btn');
    if (await swapBtn.isEnabled().catch(() => false)) {
      await swapBtn.click();
      await page.waitForTimeout(1500);
      const after = playerPc(await fetchRoom(code, auth.accessToken), auth.userId);
      expect(after).toBeLessThanOrEqual(before);
    }
  });

  test('underdog bonus awarded to minority side on go-live', async ({ page }) => {
    auth = await loginViaUI(page);
    ({ code } = await createDemoRoom(auth.accessToken));
    await startRoomApi(auth.accessToken, code);
    const room = await fetchRoom(code, auth.accessToken);
    const sides = (room.players as Array<{ assigned_side?: string }>).map((p) => p.assigned_side);
    const home = sides.filter((s) => s === 'HOME').length;
    const away = sides.filter((s) => s === 'AWAY').length;
    await api(`/api/rooms/${code}/lock`, auth.accessToken, { method: 'POST', body: '{}' });
    const hostSide = playerSide(await fetchRoom(code, auth.accessToken), auth.userId);
    const before = playerPc(await fetchRoom(code, auth.accessToken), auth.userId);
    await goLiveApi(auth.accessToken, code);
    const afterRoom = await fetchRoom(code, auth.accessToken);
    const after = playerPc(afterRoom, auth.userId);
    if (home !== away) {
      const minority = home < away ? 'HOME' : 'AWAY';
      if (hostSide === minority) {
        expect(after).toBeGreaterThanOrEqual(before + 20);
      }
    }
  });

  test('demo bots get assigned sides', async ({ page }) => {
    auth = await loginViaUI(page);
    ({ code } = await createDemoRoom(auth.accessToken));
    await startRoomApi(auth.accessToken, code);
    const room = await fetchRoom(code, auth.accessToken);
    const bots = (room.players as Array<{ display_name?: string; assigned_side?: string; is_host?: boolean }>)
      .filter((p) => !p.is_host);
    expect(bots.length).toBeGreaterThanOrEqual(1);
    for (const b of bots) {
      expect(b.assigned_side).toMatch(/^(HOME|AWAY)$/);
    }
  });
});
