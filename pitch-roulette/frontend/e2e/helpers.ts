const BACKEND = process.env.VITE_BACKEND_URL || 'http://localhost:8000';
const SESSION_KEY = 'pitch_roulette_session';

export interface GameSetup {
  code: string;
  roomId: string;
  hostToken: string;
  hostPlayerId: string;
  p2Token: string;
  p2PlayerId: string;
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BACKEND}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = data.detail || data;
    throw new Error(`${res.status} ${path}: ${JSON.stringify(detail)}`);
  }
  return data as T;
}

export async function createTwoPlayerGame(): Promise<GameSetup> {
  const created = await api<{
    code: string;
    room_id: string;
    host_token: string;
    player_id: string;
  }>('/rooms/create', {
    method: 'POST',
    body: JSON.stringify({
      nickname: 'E2EHost',
      match_id: '999999991',
      match_name: 'Test FC vs Demo United',
      team_a_name: 'Test FC',
      team_b_name: 'Demo United',
    }),
  });

  const joined = await api<{ session_token: string; player_id: string }>('/rooms/join', {
    method: 'POST',
    body: JSON.stringify({ nickname: 'E2EPlayer2', code: created.code }),
  });

  await api(`/rooms/${created.code}/settings`, {
    method: 'PATCH',
    body: JSON.stringify({
      session_token: created.host_token,
      settings: {
        allow_switching: true,
        module_fantasy: true,
        module_flash_bets: true,
        module_sabotage: true,
        chaos_frequency: 'high',
        api_buffer_seconds: 5,
        custom_switch_penalty: null,
      },
    }),
  });

  return {
    code: created.code,
    roomId: created.room_id,
    hostToken: created.host_token,
    hostPlayerId: created.player_id,
    p2Token: joined.session_token,
    p2PlayerId: joined.player_id,
  };
}

export function sessionInitScript(
  token: string,
  playerId: string,
  code: string,
  isHost: boolean,
) {
  return `
    sessionStorage.setItem(${JSON.stringify(SESSION_KEY)}, ${JSON.stringify(
      JSON.stringify({ sessionToken: token, playerId, roomCode: code, isHost }),
    )});
  `;
}

export async function waitForBetOpen(roomId: string, betId: string, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const res = await api<{ bet: { id: string; state: string } | null }>(
      `/flash-bets/${roomId}/active`,
    );
    if (res.bet?.id === betId && res.bet.state === 'OPEN') return res.bet;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('Flash bet never opened');
}

export async function placeWagerWhenOpen(
  roomId: string,
  betId: string,
  sessionToken: string,
  amount = 200,
  timeoutMs = 20_000,
) {
  const deadline = Date.now() + timeoutMs;
  let lastError = 'unknown';
  while (Date.now() < deadline) {
    const res = await api<{ bet: { id: string; state: string } | null }>(
      `/flash-bets/${roomId}/active`,
    );
    if (res.bet?.id === betId && res.bet.state === 'OPEN') {
      try {
        return await api<{ new_balance: number }>('/flash-bets/wager', {
          method: 'POST',
          body: JSON.stringify({
            session_token: sessionToken,
            flash_bet_id: betId,
            chosen_option: 'option_a',
            amount,
          }),
        });
      } catch (e) {
        lastError = e instanceof Error ? e.message : String(e);
      }
    }
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error(`Could not place wager: ${lastError}`);
}
