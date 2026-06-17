/**
 * E2E helpers for Pitch Roulette Phase 2.
 * Login uses the browser UI (avoids Node TLS issues with Supabase on some Windows setups).
 */
import { expect, type Page } from '@playwright/test';

export const API_BASE = process.env.E2E_API_URL || 'http://localhost:8000';

export interface TestAuth {
  accessToken: string;
  userId: string;
  email: string;
}

export function e2eCredentials() {
  const email = process.env.E2E_TEST_EMAIL;
  const password = process.env.E2E_TEST_PASSWORD;
  if (!email || !password) {
    throw new Error('Set E2E_TEST_EMAIL and E2E_TEST_PASSWORD in your shell');
  }
  return { email, password };
}

export async function api<T>(path: string, token?: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init?.headers as Record<string, string>),
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  const controller = new AbortController();
  const timeoutMs = 60_000;
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers,
      signal: controller.signal,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(`${res.status} ${path}: ${JSON.stringify(data.detail ?? data)}`);
    }
    return data as T;
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') {
      throw new Error(`Timeout after ${timeoutMs}ms ${path}`);
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

/** Log in through /auth/login — uses Chrome's TLS stack, not Node. */
export async function loginViaUI(page: Page): Promise<TestAuth> {
  const { email, password } = e2eCredentials();

  await page.goto('/auth/login');
  const emailInput = page.getByPlaceholder('Email');
  await emailInput.click();
  await emailInput.fill(email);
  await expect(emailInput).toHaveValue(email);
  await page.getByPlaceholder('Password').fill(password);

  await Promise.all([
    page.waitForResponse(
      (r) => r.url().includes('/auth/v1/token') && r.request().method() === 'POST',
      { timeout: 30_000 },
    ),
    page.getByRole('button', { name: /^Log in$/i }).click(),
  ]);

  await page.waitForURL((url) => !url.pathname.includes('/auth/login'), { timeout: 15_000 });

  const session = await page.evaluate(() => {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key?.startsWith('sb-') || !key.endsWith('-auth-token')) continue;
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      try {
        const parsed = JSON.parse(raw) as {
          access_token?: string;
          user?: { id?: string };
        };
        if (parsed.access_token && parsed.user?.id) {
          return { accessToken: parsed.access_token, userId: parsed.user.id };
        }
      } catch {
        /* try next key */
      }
    }
    return null;
  });

  if (!session) {
    throw new Error('Login UI succeeded but no Supabase session found in localStorage');
  }

  return { ...session, email };
}

export async function createDemoRoom(token: string): Promise<{ code: string; room: Record<string, unknown> }> {
  const body = {
    match_source: 'demo_simulation',
    bot_config: { enabled: true, count: 3, difficulty: 'medium' },
    phase: 'LOBBY',
  };
  try {
    const room = await api<Record<string, unknown>>('/api/rooms', token, {
      method: 'POST',
      body: JSON.stringify(body),
    });
    const result = { code: String(room.room_code), room };
    assertDemoSimulationRoom(result.room);
    return result;
  } catch (e) {
    const legacyNeeded =
      e instanceof Error &&
      (e.message.includes('422') ||
        e.message.includes('match_id') ||
        e.message.includes('400'));
    if (!legacyNeeded) throw e;
    const legacy = await api<{ room: Record<string, unknown>; code: string }>('/api/demo/start', token, {
      method: 'POST',
      body: JSON.stringify({ phase: 'LOBBY' }),
    });
    const result = { code: legacy.code, room: legacy.room };
    assertDemoSimulationRoom(result.room);
    return result;
  }
}

export function assertDemoSimulationRoom(room: Record<string, unknown>): void {
  const match = room.match_data as { demo?: boolean } | undefined;
  const isDemo =
    room.match_source === 'demo_simulation' ||
    room.match_id === 'demo-sandbox' ||
    match?.demo === true;
  if (!isDemo) {
    throw new Error(
      `Expected demo simulation room (match_source/match_id/demo); got match_source=${String(room.match_source)} match_id=${String(room.match_id)}`,
    );
  }
}

type DemoPostResult = 'ok' | 'skip';

async function tryDemoPost(token: string, path: string, body = '{}'): Promise<DemoPostResult> {
  try {
    await api(path, token, { method: 'POST', body });
    return 'ok';
  } catch (e) {
    if (!(e instanceof Error)) throw e;
    const msg = e.message;
    if (msg.includes('404') || msg.includes('405')) return 'skip';
    if (msg.includes('not_demo_room') || msg.includes('not_simulation_room')) return 'skip';
    if (msg.includes('409') || msg.includes('no_active_bet') || msg.includes('no_open_bet')) return 'ok';
    throw e;
  }
}

/** Trigger one demo event cycle — fast-forward or inject-random (unified + legacy paths). */
export async function triggerDemoEvent(token: string, code: string): Promise<boolean> {
  const paths = [
    `/api/rooms/${code}/fast-forward`,
    `/api/demo/rooms/${code}/fast-forward`,
    `/api/rooms/${code}/inject-random`,
    `/api/demo/rooms/${code}/inject-random`,
  ];
  for (const path of paths) {
    if ((await tryDemoPost(token, path)) === 'ok') return true;
  }
  return false;
}

async function resolveActiveBetApi(token: string, code: string, correctOption = 'Yes'): Promise<void> {
  const body = JSON.stringify({ correct_option: correctOption });
  const paths = [`/api/rooms/${code}/resolve-active`, `/api/demo/rooms/${code}/resolve-active`];
  for (const path of paths) {
    if ((await tryDemoPost(token, path, body)) === 'ok') return;
  }
}

/** @deprecated Use triggerDemoEvent */
export async function fastForwardDemo(token: string, code: string): Promise<void> {
  await triggerDemoEvent(token, code);
}

function flashBetYesButton(page: Page) {
  return page.getByTestId('flash-bet-card').getByRole('button', { name: 'Yes', exact: true });
}

async function hasEnabledYes(page: Page): Promise<boolean> {
  return flashBetYesButton(page).isEnabled().catch(() => false);
}

async function waitForLiveRoom(page: Page): Promise<void> {
  await expect(page.getByTestId('live-badge')).toBeVisible({ timeout: 30_000 });
}

/** Live page loaded enough for chat/scoreboard (more reliable than live-badge alone). */
export async function gotoLiveRoom(page: Page, code: string): Promise<void> {
  await page.goto(`/room/${code}/live`);
  const ready = page.getByTestId('room-chat');
  try {
    await expect(ready).toBeVisible({ timeout: 25_000 });
    return;
  } catch {
    await page.reload();
    await expect(ready).toBeVisible({ timeout: 35_000 });
  }
}

/** Wait for a clickable Yes on an open flash bet; resolve/inject only if auto-pipeline is slow. */
export async function ensureOpenFlashBet(page: Page, token: string, code: string): Promise<void> {
  await waitForLiveRoom(page);

  try {
    await expect.poll(() => hasEnabledYes(page), { timeout: 25_000, intervals: [1000, 2000] }).toBe(true);
    return;
  } catch {
    /* auto-events may be slow or a stale locked bet is showing */
  }

  if (await page.getByTestId('flash-bet-card').isVisible().catch(() => false)) {
    await resolveActiveBetApi(token, code);
    await page.reload();
    await waitForLiveRoom(page);
    try {
      await expect.poll(() => hasEnabledYes(page), { timeout: 15_000, intervals: [500, 1000] }).toBe(true);
      return;
    } catch {
      /* still no open bet */
    }
  }

  await triggerDemoEvent(token, code);
  await page.reload();
  await waitForLiveRoom(page);
  await expect.poll(() => hasEnabledYes(page), { timeout: 45_000, intervals: [1000, 2000, 3000] }).toBe(true);
}

export async function fetchRoom(code: string, token?: string): Promise<Record<string, unknown>> {
  return api<Record<string, unknown>>(`/api/rooms/${code}`, token);
}

export async function roomState(code: string, token?: string): Promise<string> {
  const room = await fetchRoom(code, token);
  return String(room.state ?? '');
}

export interface LiveFixture {
  id: string;
  home_team: string;
  away_team: string;
  status: string;
}

const LIVE_STATUSES = new Set(['IN_PLAY', 'PAUSED', 'LIVE']);
const SCHEDULED_STATUSES = new Set(['SCHEDULED', 'TIMED']);

/** Matches from GET /api/fixtures (optional status filter, e.g. LIVE or LIVE|SCHEDULED). */
export async function fetchFixtures(token?: string, status?: string): Promise<Array<Record<string, unknown>>> {
  const query = status ? `?status=${encodeURIComponent(status)}` : '';
  const data = await api<{ matches?: Array<Record<string, unknown>> }>(`/api/fixtures${query}`, token);
  return data.matches ?? [];
}

function toLiveFixture(match: Record<string, unknown>): LiveFixture {
  return {
    id: String(match.id),
    home_team: String(match.home_team ?? ''),
    away_team: String(match.away_team ?? ''),
    status: String(match.status ?? ''),
  };
}

/** First in-play fixture from schedule, or E2E_MATCH_ID override. */
export async function fetchLiveFixture(token?: string): Promise<LiveFixture | null> {
  const override = process.env.E2E_MATCH_ID;
  if (override) {
    try {
      const live = await api<Record<string, unknown>>(`/api/matches/${override}/live`, token);
      if (live?.id) {
        return {
          id: String(live.id),
          home_team: String(live.home_team ?? ''),
          away_team: String(live.away_team ?? ''),
          status: String(live.status ?? 'IN_PLAY'),
        };
      }
    } catch {
      /* try schedule */
    }
  }

  try {
    const liveMatches = await fetchFixtures(token, 'LIVE');
    const match = liveMatches.find(
      (m) => LIVE_STATUSES.has(String(m.status)) || m.is_live === true,
    );
    if (match?.id) return toLiveFixture(match);

    const scheduled = await fetchFixtures(token, 'SCHEDULED');
    const upcoming = scheduled.find((m) => SCHEDULED_STATUSES.has(String(m.status)));
    if (upcoming?.id) return toLiveFixture(upcoming);

    return null;
  } catch {
    return null;
  }
}

export async function skipIfNoFixtures(): Promise<LiveFixture | null> {
  const fixture = await fetchLiveFixture();
  return fixture;
}

export async function createRealRoom(
  token: string,
  matchId: string,
): Promise<{ code: string; room: Record<string, unknown> }> {
  const room = await api<Record<string, unknown>>('/api/rooms', token, {
    method: 'POST',
    body: JSON.stringify({ match_id: matchId, match_source: 'live_api' }),
  });
  return { code: String(room.room_code), room };
}

export async function joinRoomApi(token: string, code: string): Promise<void> {
  try {
    await api(`/api/rooms/${code}/join`, token, { method: 'POST', body: '{}' });
  } catch (e) {
    if (e instanceof Error && e.message.includes('409')) return;
    throw e;
  }
}

export async function endRoomApi(token: string, code: string): Promise<void> {
  try {
    await api(`/api/rooms/${code}/end`, token, { method: 'POST', body: '{}' });
  } catch (e) {
    if (e instanceof Error && e.message.includes('409')) return;
    throw e;
  }
}

export async function deleteRoomApi(token: string, code: string): Promise<void> {
  try {
    await api(`/api/rooms/${code}`, token, { method: 'DELETE' });
  } catch (e) {
    if (e instanceof Error && (e.message.includes('404') || e.message.includes('403'))) return;
    throw e;
  }
}

/** End if needed, then DELETE (E2E cleanup). */
export async function cleanupRoom(token: string, code: string): Promise<void> {
  const state = await roomState(code, token).catch(() => '');
  if (state && state !== 'RESULTS' && (PAST_LIVE.has(state) || state === 'FULL_TIME')) {
    await endRoomApi(token, code);
  }
  await deleteRoomApi(token, code);
}

/** @deprecated Use cleanupRoom */
export async function deleteRoom(token: string, code: string): Promise<void> {
  await cleanupRoom(token, code);
}

export async function createFlashBetApi(
  token: string,
  code: string,
  question: string,
  options: string[] = ['Yes', 'No'],
): Promise<void> {
  await api(`/api/rooms/${code}/flash-bets`, token, {
    method: 'POST',
    body: JSON.stringify({ question, options, wager_tier: 'LOW' }),
  });
}

export async function setupDemoLiveRoom(
  page: Page,
  token: string,
): Promise<{ code: string; room: Record<string, unknown> }> {
  const created = await createDemoRoom(token);
  const { code } = created;
  await startRoomApi(token, code);
  await lockRoomApi(token, code);
  await goLiveApi(token, code);
  await waitForRoomState(code, token, /^(LIVE|FULL_TIME)$/);
  await page.goto(`/room/${code}/live`);
  await expect(page.getByTestId('live-badge')).toBeVisible({ timeout: 30_000 });
  const room = await fetchRoom(code, token);
  return { code, room };
}

export async function gotoHostPanel(page: Page, code: string): Promise<void> {
  await page.goto(`/host/${code}`);
  await expect(page.getByRole('heading', { name: 'Host panel' })).toBeVisible({ timeout: 20_000 });
}

export function listPlayers(room: Record<string, unknown>) {
  return (room.players as Array<{ user_id: string; is_host?: boolean; display_name?: string }>) ?? [];
}

export async function expandChat(page: Page): Promise<void> {
  await page.getByTestId('chat-expand').click();
}

const PAST_LIVE = new Set(['LIVE', 'FULL_TIME', 'RESULTS']);

async function postFirstOk(token: string, paths: string[]): Promise<void> {
  let lastError: Error | undefined;
  for (const path of paths) {
    try {
      await api(path, token, { method: 'POST', body: '{}' });
      return;
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
      if (!lastError.message.includes('404') && !lastError.message.includes('409')) throw e;
    }
  }
  if (lastError) throw lastError;
}

export async function startRoomApi(token: string, code: string): Promise<void> {
  if (PAST_LOBBY.has(await roomState(code, token))) return;
  await postFirstOk(token, [`/api/rooms/${code}/start`, `/api/demo/rooms/${code}/advance`]);
}

export async function waitForRoomState(
  code: string,
  token: string,
  expected: RegExp,
  timeout = 30_000,
): Promise<string> {
  let last = '';
  await expect
    .poll(async () => {
      last = await roomState(code, token);
      return last;
    }, { timeout, intervals: [300, 500, 1000] })
    .toMatch(expected);
  return last;
}

export async function lockRoomApi(token: string, code: string): Promise<void> {
  if ((await roomState(code, token)) !== 'PREDICTING') return;
  try {
    await api(`/api/rooms/${code}/lock`, token, { method: 'POST', body: '{}' });
  } catch (e) {
    if (e instanceof Error && (e.message.includes('invalid_state') || e.message.includes('409'))) return;
    throw e;
  }
}

export async function goLiveApi(token: string, code: string): Promise<void> {
  if (PAST_LIVE.has(await roomState(code, token))) return;
  if ((await roomState(code, token)) !== 'CLOSED') return;
  await postFirstOk(token, [`/api/rooms/${code}/go-live`, `/api/demo/rooms/${code}/advance`]);
}

const PAST_LOBBY = new Set(['PREDICTING', 'CLOSED', 'LIVE', 'FULL_TIME', 'RESULTS']);

/** Open predictions: UI click first, API fallback if navigation stalls. */
export async function openPredictions(page: Page, token: string, code: string): Promise<void> {
  let state = await roomState(code, token);

  if (!PAST_LOBBY.has(state)) {
    if (!page.url().includes('/lobby')) {
      await page.goto(`/room/${code}/lobby`);
    }
    const startBtn = page.getByTestId('start-predictions');
    await expect(startBtn).toBeVisible({ timeout: 20_000 });
    await startBtn.click();
    try {
      await page.waitForURL(/\/predict/, { timeout: 15_000 });
    } catch {
      await startRoomApi(token, code);
      await page.goto(`/room/${code}/predict`);
      await page.waitForURL(/\/predict/, { timeout: 15_000 });
    }
  } else if (!page.url().includes('/predict')) {
    await page.goto(`/room/${code}/predict`);
    await page.waitForURL(/\/predict/, { timeout: 15_000 });
  }

  if ((await roomState(code, token)) === 'LOBBY') {
    await startRoomApi(token, code);
  }

  await expect(page.getByTestId('prediction-form')).toBeVisible({ timeout: 20_000 });
  await waitForRoomState(code, token, /^(PREDICTING|CLOSED)$/, 30_000);
}

export async function submitScorePrediction(page: Page, home: string, away: string): Promise<void> {
  if (await page.getByText('Predictions locked', { exact: false }).isVisible().catch(() => false)) {
    return;
  }
  const form = page.getByTestId('prediction-form');
  await expect(form).toBeVisible({ timeout: 15_000 });
  await form.locator('input[type="number"]').nth(0).fill(home);
  await form.locator('input[type="number"]').nth(1).fill(away);
  await page.getByTestId('prediction-submit').click();
}

export async function lockAndGoLive(page: Page, token: string, code: string): Promise<void> {
  if (PAST_LIVE.has(await roomState(code, token))) {
    await page.goto(`/room/${code}/live`);
    await expect(page.getByTestId('live-badge')).toBeVisible({ timeout: 20_000 });
    return;
  }

  const lockBtn = page.getByTestId('lock-predictions');
  if (await lockBtn.isVisible().catch(() => false)) {
    await lockBtn.click();
  }
  await lockRoomApi(token, code);

  const goLiveBtn = page.getByTestId('go-live');
  await expect(goLiveBtn).toBeVisible({ timeout: 30_000 });
  await goLiveBtn.click();

  try {
    await page.waitForURL(/\/live/, { timeout: 25_000 });
  } catch {
    await goLiveApi(token, code);
    await page.goto(`/room/${code}/live`);
    await page.waitForURL(/\/live/, { timeout: 15_000 });
  }

  await expect(page.getByTestId('live-badge')).toBeVisible({ timeout: 30_000 });
}
