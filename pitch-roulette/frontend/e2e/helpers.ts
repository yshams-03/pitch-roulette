/**
 * E2E helpers for Pitch Roulette Phase 3.
 * Login uses the browser UI (avoids Node TLS issues with Supabase on some Windows setups).
 */
import { expect, type Browser, type BrowserContext, type Page } from '@playwright/test';

/** E2E standard backend base. Override with E2E_API_URL when needed. */
export const API_BASE = process.env.E2E_API_URL?.replace(/\/$/, '') ?? 'http://localhost:8000';

let cachedBackendVersion: string | null | undefined;

/** OpenAPI version string, e.g. `3.0.0` for Phase 3. */
export async function getBackendVersion(): Promise<string | null> {
  if (cachedBackendVersion !== undefined) return cachedBackendVersion;
  try {
    const res = await fetch(`${API_BASE}/openapi.json`, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) {
      cachedBackendVersion = null;
      return null;
    }
    const data = (await res.json()) as { info?: { version?: string } };
    cachedBackendVersion = data.info?.version ?? null;
    return cachedBackendVersion;
  } catch {
    cachedBackendVersion = null;
    return null;
  }
}

/** True when the API at {@link API_BASE} is the Phase 3 backend (openapi `3.0.0`). */
export async function isPhase3Backend(): Promise<boolean> {
  return (await getBackendVersion()) === '3.0.0';
}

export interface TestAuth {
  accessToken: string;
  userId: string;
  email: string;
}

export function hasE2ECredentials() {
  return Boolean(process.env.E2E_TEST_EMAIL && process.env.E2E_TEST_PASSWORD);
}

export function hasE2EUser2() {
  return Boolean(process.env.E2E_TEST_EMAIL_2 && process.env.E2E_TEST_PASSWORD_2);
}

export function hasE2EUser3() {
  return Boolean(process.env.E2E_TEST_EMAIL_3 && process.env.E2E_TEST_PASSWORD_3);
}

export function e2eCredentials() {
  const email = process.env.E2E_TEST_EMAIL;
  const password = process.env.E2E_TEST_PASSWORD;
  if (!email || !password) {
    throw new Error('Set E2E_TEST_EMAIL and E2E_TEST_PASSWORD in your shell');
  }
  return { email, password };
}

export function e2eCredentials2() {
  const email = process.env.E2E_TEST_EMAIL_2;
  const password = process.env.E2E_TEST_PASSWORD_2;
  if (!email || !password) {
    throw new Error('Set E2E_TEST_EMAIL_2 and E2E_TEST_PASSWORD_2');
  }
  return { email, password };
}

export function e2eCredentials3() {
  const email = process.env.E2E_TEST_EMAIL_3;
  const password = process.env.E2E_TEST_PASSWORD_3;
  if (!email || !password) {
    throw new Error('Set E2E_TEST_EMAIL_3 and E2E_TEST_PASSWORD_3');
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

async function readSessionFromPage(page: Page): Promise<{ accessToken: string; userId: string } | null> {
  return page.evaluate(() => {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key?.startsWith('sb-') || !key.endsWith('-auth-token')) continue;
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      try {
        const parsed = JSON.parse(raw) as { access_token?: string; user?: { id?: string } };
        if (parsed.access_token && parsed.user?.id) {
          return { accessToken: parsed.access_token, userId: parsed.user.id };
        }
      } catch {
        /* next */
      }
    }
    return null;
  });
}

/** Log in through /auth/login with explicit credentials. */
export async function loginAs(page: Page, email: string, password: string): Promise<TestAuth> {
  await page.goto('/auth/login');
  const emailInput = page.getByPlaceholder('Email');
  await emailInput.click();
  await emailInput.fill(email);
  await page.getByPlaceholder('Password').fill(password);

  await Promise.all([
    page.waitForResponse(
      (r) => r.url().includes('/auth/v1/token') && r.request().method() === 'POST',
      { timeout: 30_000 },
    ),
    page.getByRole('button', { name: /^Log in$/i }).click(),
  ]);

  await page.waitForURL((url) => !url.pathname.includes('/auth/login'), { timeout: 15_000 });
  const session = await readSessionFromPage(page);
  if (!session) throw new Error('Login succeeded but no Supabase session in localStorage');
  return { ...session, email };
}

/** Log in with primary E2E credentials. */
export async function loginViaUI(page: Page): Promise<TestAuth> {
  const { email, password } = e2eCredentials();
  return loginAs(page, email, password);
}

export async function signupIfNeeded(
  page: Page,
  email: string,
  password: string,
  username: string,
  displayName: string,
): Promise<'logged_in' | 'signup_sent'> {
  try {
    await loginAs(page, email, password);
    return 'logged_in';
  } catch {
    await page.goto('/auth/signup');
    await page.getByPlaceholder('Display name').fill(displayName);
    await page.getByPlaceholder('Username').fill(username);
    await page.getByPlaceholder('Email').fill(email);
    await page.locator('input[placeholder="Password"]').fill(password);
    await page.getByPlaceholder('Confirm password').fill(password);
    await page.getByRole('button', { name: /Create account/i }).click();
    await page.waitForTimeout(2000);
    if (page.url().includes('/auth/login')) return 'signup_sent';
    await page.waitForURL((url) => !url.pathname.includes('/auth/signup'), { timeout: 15_000 });
    return 'logged_in';
  }
}

export async function logout(page: Page): Promise<void> {
  await page.goto('/profile');
  await page.getByRole('button', { name: /Log out/i }).click();
  await page.waitForURL(/\/auth\/login/, { timeout: 10_000 });
}

export async function openSecondBrowser(browser: Browser): Promise<{ page2: Page; context2: BrowserContext }> {
  const context2 = await browser.newContext();
  const page2 = await context2.newPage();
  return { page2, context2 };
}

export async function openThirdBrowser(browser: Browser): Promise<{ page3: Page; context3: BrowserContext }> {
  const context3 = await browser.newContext();
  const page3 = await context3.newPage();
  return { page3, context3 };
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
      (e.message.includes('422') || e.message.includes('match_id') || e.message.includes('400'));
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

/** Create demo room via /demo UI. */
export async function createDemoRoomViaUI(page: Page): Promise<{ roomCode: string }> {
  await page.goto('/demo');
  await page.getByRole('button', { name: /Enter demo match/i }).click();
  await page.waitForURL(/\/room\/[A-Z0-9]+\/lobby/, { timeout: 30_000 });
  const match = page.url().match(/\/room\/([A-Z0-9]+)\/lobby/);
  if (!match) throw new Error('Could not parse room code from URL');
  return { roomCode: match[1] };
}

export function assertDemoSimulationRoom(room: Record<string, unknown>): void {
  const match = room.match_data as { demo?: boolean } | undefined;
  const isDemo =
    room.match_source === 'demo_simulation' ||
    room.match_id === 'demo-sandbox' ||
    match?.demo === true;
  if (!isDemo) {
    throw new Error(
      `Expected demo simulation room; got match_source=${String(room.match_source)} match_id=${String(room.match_id)}`,
    );
  }
}

export async function joinRoomApi(token: string, code: string): Promise<void> {
  try {
    await api(`/api/rooms/${code}/join`, token, { method: 'POST', body: '{}' });
  } catch (e) {
    if (e instanceof Error && e.message.includes('409')) return;
    throw e;
  }
}

export async function joinRoom(page: Page, roomCode: string): Promise<void> {
  await page.goto('/join');
  await page.getByPlaceholder('Room code').fill(roomCode);
  await page.getByRole('button', { name: /join/i }).click();
  await page.waitForURL(new RegExp(`/room/${roomCode}`), { timeout: 20_000 });
}

export async function fetchRoom(code: string, token?: string): Promise<Record<string, unknown>> {
  return api<Record<string, unknown>>(`/api/rooms/${code}`, token);
}

export async function getRoomState(roomCode: string, token?: string): Promise<string> {
  const room = await fetchRoom(roomCode, token);
  return String(room.state ?? '');
}

/** @deprecated Use getRoomState */
export async function roomState(code: string, token?: string): Promise<string> {
  return getRoomState(code, token);
}

const PAST_LOBBY = new Set(['PREDICTING', 'CLOSED', 'DRAFTING', 'LIVE', 'FULL_TIME', 'RESULTS']);
const PAST_LIVE = new Set(['LIVE', 'FULL_TIME', 'RESULTS']);

async function postFirstOk(token: string, paths: string[], body = '{}'): Promise<void> {
  let lastError: Error | undefined;
  for (const path of paths) {
    try {
      await api(path, token, { method: 'POST', body });
      return;
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
      if (!lastError.message.includes('404') && !lastError.message.includes('409')) throw e;
    }
  }
  if (lastError) throw lastError;
}

export async function startRoomApi(token: string, code: string): Promise<void> {
  if (PAST_LOBBY.has(await getRoomState(code, token))) return;
  await postFirstOk(token, [`/api/rooms/${code}/start`, `/api/demo/rooms/${code}/advance`]);
  await waitForRoomState(code, token, /^PREDICTING$/, 30_000);
}

export async function lockRoomApi(token: string, code: string): Promise<void> {
  if ((await getRoomState(code, token)) !== 'PREDICTING') return;
  try {
    await api(`/api/rooms/${code}/lock`, token, { method: 'POST', body: '{}' });
  } catch (e) {
    if (e instanceof Error && (e.message.includes('invalid_state') || e.message.includes('409'))) return;
    throw e;
  }
}

export async function startDraftApi(token: string, code: string): Promise<void> {
  if ((await getRoomState(code, token)) !== 'CLOSED') return;
  await api(`/api/rooms/${code}/start-draft`, token, { method: 'POST', body: '{}' });
}

export async function goLiveApi(token: string, code: string): Promise<void> {
  if (PAST_LIVE.has(await getRoomState(code, token))) return;
  const state = await getRoomState(code, token);
  if (!['CLOSED', 'DRAFTING'].includes(state)) return;
  await postFirstOk(token, [`/api/rooms/${code}/go-live`, `/api/demo/rooms/${code}/advance`]);
}

export async function endRoomApi(token: string, code: string): Promise<void> {
  try {
    await api(`/api/rooms/${code}/end`, token, { method: 'POST', body: '{}' });
  } catch (e) {
    if (e instanceof Error && e.message.includes('409')) return;
    throw e;
  }
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
      last = await getRoomState(code, token);
      return last;
    }, { timeout, intervals: [300, 500, 1000] })
    .toMatch(expected);
  return last;
}

export async function dismissSideRevealIfPresent(page: Page): Promise<void> {
  try {
    const reveal = page.getByTestId('side-reveal');
    const isVisible = await reveal.isVisible({ timeout: 2000 });
    if (isVisible) {
      const dismissBtn = page.getByTestId('dismiss-side-reveal');
      if (await dismissBtn.isVisible({ timeout: 1000 })) {
        await dismissBtn.click();
      } else {
        await reveal.click({ force: true });
      }
      await expect(reveal).not.toBeVisible({ timeout: 5000 });
    }
  } catch {
    // Side reveal not present — continue
  }
}

export async function dismissSideReveal(page: Page): Promise<void> {
  await dismissSideRevealIfPresent(page);
}

export async function submitPredictionApi(
  code: string,
  token: string,
  score: { home: number; away: number },
): Promise<void> {
  const outcome = score.home > score.away ? 'HOME_WIN'
    : score.home < score.away ? 'AWAY_WIN'
    : 'DRAW';
  await api(`/api/rooms/${code}/predict`, token, {
    method: 'POST',
    body: JSON.stringify({
      home_goals: score.home,
      away_goals: score.away,
      predicted_outcome: outcome,
    }),
  });
}

export async function startPredictions(page: Page, token: string, code: string): Promise<void> {
  await openPredictions(page, token, code);
}

export async function lockPredictions(page: Page, token: string, code: string): Promise<void> {
  const lockBtn = page.getByTestId('lock-predictions');
  if (await lockBtn.isVisible().catch(() => false)) {
    await lockBtn.click();
  }
  await lockRoomApi(token, code);
}

export async function startDraft(page: Page, token: string, code: string): Promise<void> {
  await startDraftApi(token, code);
  await page.goto(`/room/${code}/draft`);
  await expect(page.getByTestId('draft-page')).toBeVisible({ timeout: 20_000 });
}

export async function goLive(page: Page, token: string, code: string): Promise<void> {
  const btn = page.getByTestId('go-live');
  if (await btn.isVisible().catch(() => false)) {
    await btn.click();
  } else {
    await goLiveApi(token, code);
  }
  try {
    await page.waitForURL(/\/live/, { timeout: 25_000 });
  } catch {
    await goLiveApi(token, code);
    await page.goto(`/room/${code}/live`);
  }
  await expect(page.getByTestId('live-badge')).toBeVisible({ timeout: 30_000 });
}

export async function endMatch(page: Page, token: string, code: string): Promise<void> {
  await endRoomApi(token, code);
  await page.goto(`/room/${code}/results`);
  await expect(page.getByTestId('results-heading')).toBeVisible({ timeout: 20_000 });
}

export async function openPredictions(page: Page, token: string, code: string): Promise<void> {
  let state = await getRoomState(code, token);

  if (!PAST_LOBBY.has(state)) {
    await startRoomApi(token, code);
    await page.goto(`/room/${code}/predict`);
  } else if (!page.url().includes('/predict')) {
    await page.goto(`/room/${code}/predict`);
  }

  if ((await getRoomState(code, token)) === 'LOBBY') {
    await startRoomApi(token, code);
  }

  await dismissSideReveal(page);
  await dismissSideRevealIfPresent(page);
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

export async function advanceToDraft(page: Page, token: string, code: string): Promise<void> {
  await openPredictions(page, token, code);
  await dismissSideRevealIfPresent(page);
  await submitScorePrediction(page, '2', '1');
  await lockPredictions(page, token, code);
  await startDraft(page, token, code);
  await waitForRoomState(code, token, /^DRAFTING$/);
}

export async function pickPlayer(page: Page, playerName?: string): Promise<void> {
  if (playerName) {
    const card = page.getByTestId('draft-player-card').filter({ hasText: playerName });
    await card.getByTestId('draft-pick-btn').click();
  } else {
    await page.getByTestId('draft-pick-btn').first().click();
  }
}

export async function pickThreePlayers(page: Page): Promise<void> {
  for (let i = 0; i < 3; i++) {
    const btn = page.getByTestId('draft-pick-btn').first();
    if (!(await btn.isVisible().catch(() => false))) break;
    await btn.click();
    await page.waitForTimeout(400);
  }
}

export async function getDraftPicks(token: string, code: string, userId: string): Promise<string[]> {
  const r = await api<{ all?: Array<{ user_id: string; player_name: string }> }>(
    `/api/rooms/${code}/draft/picks`,
    token,
  );
  return (r.all || []).filter((p) => p.user_id === userId).map((p) => p.player_name);
}

export async function waitForDraftPhase(page: Page, code: string): Promise<void> {
  await page.goto(`/room/${code}/draft`);
  await expect(page.getByTestId('draft-page')).toBeVisible({ timeout: 20_000 });
}

export async function setupDemoLiveRoom(
  page: Page,
  token: string,
  viaDraft = false,
): Promise<{ code: string; room: Record<string, unknown> }> {
  console.log('[E2E] Creating demo room...');
  const created = await createDemoRoom(token);
  const { code } = created;
  console.log('[E2E] Room created:', code);

  console.log('[E2E] Starting room...');
  await startRoomApi(token, code);
  console.log('[E2E] Room PREDICTING');

  try {
    await submitPredictionApi(code, token, { home: 2, away: 1 });
    console.log('[E2E] Prediction submitted');
  } catch {
    /* may already exist */
  }

  await lockRoomApi(token, code);
  console.log('[E2E] Room CLOSED');

  if (viaDraft) {
    await startDraftApi(token, code);
    await pickThreePlayersViaApi(token, code);
    await goLiveApi(token, code);
  } else {
    await goLiveApi(token, code);
  }
  console.log('[E2E] Room LIVE');

  await waitForRoomState(code, token, /^(LIVE|FULL_TIME)$/, 20_000);
  await page.goto(`/room/${code}/live`);
  await expect(page.getByTestId('room-chat')).toBeVisible({ timeout: 30_000 });
  const room = await fetchRoom(code, token);
  console.log('[E2E] Setup complete:', code);
  return { code, room };
}

async function pickThreePlayersViaApi(token: string, code: string): Promise<void> {
  const squads = await api<{ players: Array<{ player_id: string; available: boolean }> }>(
    `/api/rooms/${code}/draft/squads`,
    token,
  );
  let picked = 0;
  for (const p of squads.players || []) {
    if (!p.available) continue;
    try {
      await api(`/api/rooms/${code}/draft/pick`, token, {
        method: 'POST',
        body: JSON.stringify({ player_id: p.player_id }),
      });
      picked++;
      if (picked >= 3) break;
    } catch {
      /* race */
    }
  }
}

export async function lockAndGoLive(page: Page, token: string, code: string): Promise<void> {
  if (PAST_LIVE.has(await getRoomState(code, token))) {
    await page.goto(`/room/${code}/live`);
    await expect(page.getByTestId('live-badge')).toBeVisible({ timeout: 20_000 });
    return;
  }
  await lockPredictions(page, token, code);
  await goLive(page, token, code);
}

export async function createFlashBetApi(
  token: string,
  code: string,
  question: string,
  options: string[] = ['Yes', 'No'],
  wagerTier: 'LOW' | 'MEDIUM' | 'HIGH' = 'LOW',
): Promise<{ id?: string }> {
  return api(`/api/rooms/${code}/flash-bets`, token, {
    method: 'POST',
    body: JSON.stringify({ question, options, wager_tier: wagerTier }),
  });
}

export async function injectFlashBet(
  token: string,
  code: string,
  question?: string,
  options?: string[],
  wagerTier: 'LOW' | 'MEDIUM' | 'HIGH' = 'LOW',
): Promise<void> {
  await createFlashBetApi(
    token,
    code,
    question ?? `E2E bet ${Date.now()}?`,
    options ?? ['Yes', 'No'],
    wagerTier,
  );
}

export async function waitForFlashBet(page: Page, timeout = 30_000): Promise<string | null> {
  await expect(page.getByTestId('flash-bet-card')).toBeVisible({ timeout });
  return 'visible';
}

export async function answerFlashBet(page: Page, option: 'first' | 'second' | string = 'first'): Promise<void> {
  const card = page.getByTestId('flash-bet-card');
  await expect(card).toBeVisible({ timeout: 15_000 });
  if (option === 'first') {
    await card.getByRole('button').first().click();
  } else if (option === 'second') {
    await card.getByRole('button').nth(1).click();
  } else {
    await card.getByRole('button', { name: option, exact: true }).click();
  }
}

export async function resolveFlashBetApi(
  token: string,
  code: string,
  betId: string,
  correctOption: string,
): Promise<void> {
  await api(`/api/rooms/${code}/flash-bets/${betId}/resolve`, token, {
    method: 'POST',
    body: JSON.stringify({ correct_option: correctOption }),
  });
}

export async function resolveActiveFlashBet(
  token: string,
  code: string,
  correctOption = 'Yes',
): Promise<void> {
  const body = JSON.stringify({ correct_option: correctOption });
  const paths = [`/api/rooms/${code}/resolve-active`, `/api/demo/rooms/${code}/resolve-active`];
  for (const path of paths) {
    try {
      await api(path, token, { method: 'POST', body });
      return;
    } catch (e) {
      if (!(e instanceof Error)) throw e;
      if (!e.message.includes('404') && !e.message.includes('409')) throw e;
    }
  }
}

export async function purchaseSabotageApi(
  token: string,
  code: string,
  sabotageType: string,
  targetUserId: string,
): Promise<void> {
  await api(`/api/rooms/${code}/sabotages`, token, {
    method: 'POST',
    body: JSON.stringify({ sabotage_type: sabotageType, target_user_id: targetUserId }),
  });
}

export async function openSabotageShop(page: Page): Promise<void> {
  await page.getByTestId('sabotage-shop-btn').click();
  await expect(page.getByTestId('sabotage-shop-sheet')).toBeVisible();
}

export async function buySabotage(page: Page, targetNickname: string, sabotageType: string): Promise<void> {
  await openSabotageShop(page);
  const section = page.getByTestId('sabotage-shop-sheet').locator('div').filter({ hasText: targetNickname });
  await section.getByTestId(`buy-${sabotageType}`).click();
}

export async function getActivePC(page: Page): Promise<number> {
  const text = await page.getByTestId('session-pc').innerText();
  const m = text.match(/(\d+)/);
  return m ? parseInt(m[1], 10) : 0;
}

export function playerPc(room: Record<string, unknown>, userId: string): number {
  const players = (room.players as Array<{ user_id: string; session_pc?: number }>) || [];
  const p = players.find((x) => x.user_id === userId);
  return Math.round(p?.session_pc ?? 0);
}

export function playerSide(room: Record<string, unknown>, userId: string): string | undefined {
  const players = (room.players as Array<{ user_id: string; assigned_side?: string }>) || [];
  return players.find((x) => x.user_id === userId)?.assigned_side;
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

export async function fastForwardDemo(token: string, code: string): Promise<void> {
  await triggerDemoEvent(token, code);
}

function flashBetYesButton(page: Page) {
  return page.getByTestId('flash-bet-card').getByRole('button', { name: 'Yes', exact: true });
}

async function hasEnabledYes(page: Page): Promise<boolean> {
  return flashBetYesButton(page).isEnabled().catch(() => false);
}

export async function gotoLiveRoom(page: Page, code: string): Promise<void> {
  await page.goto(`/room/${code}/live`);
  const ready = page.getByTestId('room-chat');
  try {
    await expect(ready).toBeVisible({ timeout: 25_000 });
  } catch {
    await page.reload();
    await expect(ready).toBeVisible({ timeout: 35_000 });
  }
}

export async function ensureOpenFlashBet(page: Page, token: string, code: string): Promise<void> {
  await expect(page.getByTestId('live-badge')).toBeVisible({ timeout: 30_000 });

  try {
    await expect.poll(() => hasEnabledYes(page), { timeout: 25_000, intervals: [1000, 2000] }).toBe(true);
    return;
  } catch {
    /* slow pipeline */
  }

  if (await page.getByTestId('flash-bet-card').isVisible().catch(() => false)) {
    await resolveActiveFlashBet(token, code);
    await page.reload();
    try {
      await expect.poll(() => hasEnabledYes(page), { timeout: 15_000, intervals: [500, 1000] }).toBe(true);
      return;
    } catch {
      /* continue */
    }
  }

  await triggerDemoEvent(token, code);
  await page.reload();
  await expect.poll(() => hasEnabledYes(page), { timeout: 45_000, intervals: [1000, 2000, 3000] }).toBe(true);
}

export interface LiveFixture {
  id: string;
  home_team: string;
  away_team: string;
  status: string;
}

const LIVE_STATUSES = new Set(['IN_PLAY', 'PAUSED', 'LIVE']);
const SCHEDULED_STATUSES = new Set(['SCHEDULED', 'TIMED']);

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
      /* schedule fallback */
    }
  }

  try {
    const liveMatches = await fetchFixtures(token, 'LIVE');
    const match = liveMatches.find((m) => LIVE_STATUSES.has(String(m.status)) || m.is_live === true);
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
  return fetchLiveFixture();
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

export async function deleteRoomApi(token: string, code: string): Promise<void> {
  try {
    await api(`/api/rooms/${code}`, token, { method: 'DELETE' });
  } catch (e) {
    if (e instanceof Error && (e.message.includes('404') || e.message.includes('403'))) return;
    throw e;
  }
}

export async function cleanupRoom(token: string, code: string): Promise<void> {
  const state = await getRoomState(code, token).catch(() => '');
  if (state && state !== 'RESULTS' && (PAST_LIVE.has(state) || state === 'FULL_TIME')) {
    await endRoomApi(token, code);
  }
  await deleteRoomApi(token, code);
}

export async function deleteRoom(token: string, code: string): Promise<void> {
  await cleanupRoom(token, code);
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

export async function sendChatMessage(token: string, code: string, content: string): Promise<{ id: string }> {
  return api(`/api/rooms/${code}/messages`, token, {
    method: 'POST',
    body: JSON.stringify({ content }),
  });
}

export async function deleteChatMessage(token: string, code: string, messageId: string): Promise<void> {
  await api(`/api/rooms/${code}/messages/${messageId}`, token, { method: 'DELETE' });
}

export async function listChatMessages(code: string): Promise<Array<{ id: string; content: string; is_deleted?: boolean }>> {
  const r = await api<{ messages: Array<{ id: string; content: string; is_deleted?: boolean }> }>(
    `/api/rooms/${code}/messages`,
  );
  return r.messages || [];
}

export async function markMatchFinishedApi(token: string, code: string): Promise<void> {
  const room = await fetchRoom(code, token);
  const md = (room.match_data as Record<string, unknown>) || {};
  await api(`/api/rooms/${code}`, token, {
    method: 'PATCH',
    body: JSON.stringify({
      match_data: { ...md, status: 'FINISHED', status_label: 'Full time' },
      state: 'LIVE',
    }),
  }).catch(() => {
    /* PATCH may not exist — use end endpoint as fallback for test */
  });
}
