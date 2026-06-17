import { test, expect } from '@playwright/test';
import {
  createDemoRoom,
  ensureOpenFlashBet,
  lockAndGoLive,
  loginViaUI,
  openPredictions,
  submitScorePrediction,
  waitForRoomState,
} from './helpers';

const hasE2E = Boolean(
  process.env.E2E_TEST_EMAIL &&
  process.env.E2E_TEST_PASSWORD,
);

test.describe('Demo flow (critical path)', () => {
  test.skip(!hasE2E, 'Set E2E_TEST_EMAIL + E2E_TEST_PASSWORD in the shell');

  test('login → demo room → predict → live → flash bet', async ({ page }) => {
    const auth = await loginViaUI(page);

    const { code, room } = await createDemoRoom(auth.accessToken);
    expect(room.host_id, 'E2E user must be demo room host').toBe(auth.userId);

    await page.goto(`/room/${code}/lobby`);
    await expect(page.getByRole('heading', { name: 'France vs Netherlands' })).toBeVisible({
      timeout: 60_000,
    });
    await expect(page.getByText('Host', { exact: true })).toBeVisible({ timeout: 15_000 });

    await openPredictions(page, auth.accessToken, code);

    await submitScorePrediction(page, '2', '1');
    await lockAndGoLive(page, auth.accessToken, code);
    await waitForRoomState(code, auth.accessToken, /^(LIVE|FULL_TIME)$/);

    await expect(page.getByTestId('live-badge')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('demo-badge')).toBeVisible();

    await ensureOpenFlashBet(page, auth.accessToken, code);
    const yesBtn = page.getByTestId('flash-bet-card').getByRole('button', { name: 'Yes', exact: true });
    await yesBtn.click();
    await expect(page.getByText('Your pick: Yes', { exact: true })).toBeVisible({ timeout: 10_000 });
  });

  test('API: create simulation room returns France vs Netherlands', async ({ page }) => {
    const auth = await loginViaUI(page);
    const { code, room } = await createDemoRoom(auth.accessToken);
    expect(code).toMatch(/^[A-Z0-9]{6}$/);
    const match = room.match_data as { home_team?: string; away_team?: string };
    expect(match?.home_team).toBe('France');
    expect(match?.away_team).toBe('Netherlands');
  });
});
