import { test, expect } from '@playwright/test';
import {
  api,
  cleanupRoom,
  createFlashBetApi,
  createRealRoom,
  endRoomApi,
  fetchLiveFixture,
  lockAndGoLive,
  loginViaUI,
  openPredictions,
  roomState,
  submitScorePrediction,
  waitForRoomState,
  type LiveFixture,
  type TestAuth,
} from './helpers';

const hasE2E = Boolean(process.env.E2E_TEST_EMAIL && process.env.E2E_TEST_PASSWORD);

test.describe.configure({ mode: 'serial' });

test.describe('Real room flow', () => {
  test.skip(!hasE2E, 'Set E2E_TEST_EMAIL + E2E_TEST_PASSWORD in the shell');

  let auth: TestAuth;
  let code = '';
  let fixture: LiveFixture | null = null;
  let homeTeam = '';
  let awayTeam = '';

  test.beforeAll(async ({ browser }) => {
    fixture = await fetchLiveFixture();
    const page = await browser.newPage();
    auth = await loginViaUI(page);
    await page.close();
  });

  test.afterAll(async () => {
    if (code && auth?.accessToken) {
      await cleanupRoom(auth.accessToken, code).catch(() => {});
    }
  });

  test.beforeEach(() => {
    test.skip(!fixture, 'No live fixtures — set E2E_MATCH_ID or wait for an in-play match');
  });

  test('create room with real fixture', async ({ page }) => {
    expect(fixture!.id).toBeTruthy();

    let room: Record<string, unknown>;
    try {
      ({ code, room } = await createRealRoom(auth.accessToken, fixture!.id));
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      test.skip(msg.includes('match_not_live'), 'Fixture is no longer live for room creation');
      throw e;
    }

    expect(room.match_source).toBe('live_api');
    expect(room.match_id).toBe(fixture!.id);
    expect(room.state).toBe('LOBBY');
    expect(room.espn_event_id, 'ESPN should be linked at create').toBeTruthy();

    const match = room.match_data as { home_team?: string; away_team?: string };
    homeTeam = match.home_team ?? fixture!.home_team;
    awayTeam = match.away_team ?? fixture!.away_team;

    await page.goto(`/room/${code}/lobby`);
    await expect(page.getByRole('heading', { name: new RegExp(homeTeam, 'i') })).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByText('Host', { exact: true })).toBeVisible();
  });

  test('start predictions → submit → lock → go live', async ({ page }) => {
    test.skip(!code, 'Room not created');
    await loginViaUI(page);

    await page.goto(`/room/${code}/lobby`);
    await openPredictions(page, auth.accessToken, code);
    await waitForRoomState(code, auth.accessToken, /^PREDICTING$/);

    await submitScorePrediction(page, '2', '1');
    await expect(page.getByText(/Locked in|Your pick/i)).toBeVisible({ timeout: 15_000 });

    await lockAndGoLive(page, auth.accessToken, code);
    await waitForRoomState(code, auth.accessToken, /^(LIVE|FULL_TIME)$/);
  });

  test('live page shows real match data', async ({ page }) => {
    test.skip(!code, 'Room not created');
    await loginViaUI(page);
    await page.goto(`/room/${code}/live`);

    await expect(page.getByTestId('scoreboard-home')).toContainText(homeTeam, { timeout: 20_000 });
    await expect(page.getByTestId('scoreboard-away')).toContainText(awayTeam);
    await expect(page.getByTestId('live-badge')).toBeVisible();
    await expect(page.getByTestId('demo-badge')).toHaveCount(0);
  });

  test('flash bet auto-triggers or host fallback', async ({ page }) => {
    test.skip(!code, 'Room not created');
    await loginViaUI(page);
    await page.goto(`/room/${code}/live`);
    await expect(page.getByTestId('live-badge')).toBeVisible({ timeout: 20_000 });

    const flashCard = page.getByTestId('flash-bet-card');
    try {
      await expect(flashCard).toBeVisible({ timeout: 120_000 });
    } catch {
      await createFlashBetApi(auth.accessToken, code, 'Goal in next 5 min?', ['Yes', 'No']);
      await page.reload();
      await expect(flashCard).toBeVisible({ timeout: 15_000 });
    }

    const yesBtn = flashCard.getByRole('button', { name: 'Yes', exact: true });
    await expect(yesBtn).toBeEnabled({ timeout: 15_000 });
    await yesBtn.click();
    await expect(page.getByText(/Your pick/i)).toBeVisible({ timeout: 10_000 });
  });

  test('end match → results → cleanup', async ({ page }) => {
    test.skip(!code, 'Room not created');
    await loginViaUI(page);

    const state = await roomState(code, auth.accessToken);
    if (state !== 'RESULTS') {
      await endRoomApi(auth.accessToken, code);
      await waitForRoomState(code, auth.accessToken, /^RESULTS$/);
    }

    const results = await api<{
      leaderboard: Array<{ user_id?: string; points_earned?: number }>;
      actual_score: { home: number; away: number };
    }>(`/api/rooms/${code}/results`);

    expect(results.actual_score).toBeDefined();
    const me = results.leaderboard?.find((p) => p.user_id === auth.userId);
    expect(me, 'host should have prediction row').toBeTruthy();
    expect(me?.points_earned).toBeDefined();

    await page.goto(`/room/${code}/results`);
    await expect(page.getByTestId('results-heading')).toBeVisible();
    await expect(page.getByText(/Final:/i)).toBeVisible();

    await cleanupRoom(auth.accessToken, code);
    code = '';
  });
});
