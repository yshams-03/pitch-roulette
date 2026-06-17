import { test, expect } from '@playwright/test';
import {
  cleanupRoom,
  createDemoRoom,
  dismissSideReveal,
  hasE2ECredentials,
  injectFlashBet,
  loginViaUI,
  pickThreePlayers,
  resolveActiveFlashBet,
  submitScorePrediction,
  waitForFlashBet,
  waitForRoomState,
  answerFlashBet,
  type TestAuth,
} from './helpers';

test.describe.configure({ mode: 'serial' });

test.describe('Demo Room — Full Flow', () => {
  test.skip(!hasE2ECredentials(), 'Set E2E_TEST_EMAIL + E2E_TEST_PASSWORD');

  let auth: TestAuth;
  let code = '';

  test.afterAll(async () => {
    if (code && auth?.accessToken) {
      await cleanupRoom(auth.accessToken, code).catch(() => {});
    }
  });

  test('complete demo match end to end', async ({ page }) => {
    test.setTimeout(180_000);
    auth = await loginViaUI(page);

    await page.goto('/demo');
    await page.getByRole('button', { name: /Enter demo match/i }).click();
    await page.waitForURL(/\/room\/[A-Z0-9]+\/lobby/, { timeout: 60_000 });
    const m = page.url().match(/\/room\/([A-Z0-9]+)\/lobby/);
    code = m![1];

    await expect(page.getByText('🟢 Live')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole('heading', { name: /France vs Netherlands/i })).toBeVisible();
    await expect(page.getByText('Host', { exact: true })).toBeVisible();

    await page.getByTestId('start-predictions').click();
    await page.waitForURL(/\/predict/, { timeout: 15_000 });
    await expect(page.getByTestId('side-reveal')).toBeVisible({ timeout: 10_000 });
    await dismissSideReveal(page);
    await expect(page.getByTestId('assigned-side-badge')).toBeVisible();

    await submitScorePrediction(page, '2', '1');
    await expect(page.getByText(/France win|HOME WIN/i).first()).toBeVisible();

    await page.getByTestId('lock-predictions').click();
    await waitForRoomState(code, auth.accessToken, /^CLOSED$/);

    await page.goto(`/host/${code}`);
    await page.getByRole('button', { name: 'Start draft' }).click();
    await page.goto(`/room/${code}/draft`);
    await expect(page.getByTestId('draft-page')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/\d+s/)).toBeVisible();

    await pickThreePlayers(page);
    await expect(page.getByText(/Your picks: 3\/3/i)).toBeVisible({ timeout: 15_000 });

    await page.goto(`/host/${code}`);
    await page.getByRole('button', { name: 'Go live' }).click();
    await page.waitForURL(/\/live/, { timeout: 30_000 });

    await expect(page.getByTestId('live-badge')).toBeVisible();
    await expect(page.getByTestId('session-pc')).toContainText('PC');

    await injectFlashBet(auth.accessToken, code, `E2E full flow ${Date.now()}?`, ['Yes', 'No'], 'LOW');
    await page.reload();
    await waitForFlashBet(page);
    await answerFlashBet(page, 'Yes');
    await expect(page.getByText(/Your pick/i)).toBeVisible();

    await resolveActiveFlashBet(auth.accessToken, code, 'Yes');
    await page.reload();

    await page.goto(`/host/${code}`);
    await page.getByRole('button', { name: 'End match' }).click();
    await page.waitForURL(/\/results/, { timeout: 20_000 });

    await expect(page.getByTestId('results-heading')).toBeVisible();
    await expect(page.getByText(/Skill board/i)).toBeVisible();
    await expect(page.getByText(/Party board/i)).toBeVisible();
  });

  test('API: create simulation room returns France vs Netherlands', async ({ page }) => {
    const auth = await loginViaUI(page);
    const { code, room } = await createDemoRoom(auth.accessToken);
    expect(code).toMatch(/^[A-Z0-9]{6}$/);
    const match = room.match_data as { home_team?: string; away_team?: string };
    expect(match?.home_team).toBe('France');
    expect(match?.away_team).toBe('Netherlands');
    await cleanupRoom(auth.accessToken, code).catch(() => {});
  });
});
