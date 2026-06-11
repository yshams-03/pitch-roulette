const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000';

class ApiError extends Error {
  status: number;
  data: Record<string, unknown>;

  constructor(status: number, data: Record<string, unknown>) {
    super((data.error as string) || 'Request failed');
    this.status = status;
    this.data = data;
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const res = await fetch(`${BACKEND_URL}${path}`, {
      ...options,
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      throw new ApiError(res.status, data.detail || data);
    }

    return data as T;
  } finally {
    clearTimeout(timeout);
  }
}

export const api = {
  createRoom: (body: {
    nickname: string;
    match_id?: string;
    match_name?: string;
    team_a_name?: string;
    team_b_name?: string;
  }) => request<{ room_id: string; code: string; host_token: string; player_id: string }>(
    '/rooms/create',
    { method: 'POST', body: JSON.stringify(body) },
  ),

  joinRoom: (code: string, nickname: string) =>
    request<{ player_id: string; session_token: string; room_state: string; code: string }>(
      '/rooms/join',
      { method: 'POST', body: JSON.stringify({ code, nickname }) },
    ),

  getRoom: (code: string) => request<Record<string, unknown>>(`/rooms/${code}`),

  updateSettings: (code: string, sessionToken: string, settings: Record<string, unknown>) =>
    request(`/rooms/${code}/settings`, {
      method: 'PATCH',
      body: JSON.stringify({ session_token: sessionToken, settings }),
    }),

  startDraft: (code: string, sessionToken: string) =>
    request(`/rooms/${code}/start-draft`, {
      method: 'POST',
      body: JSON.stringify({ session_token: sessionToken }),
    }),

  advanceState: (code: string, sessionToken: string, targetState?: string) =>
    request(`/rooms/${code}/advance-state`, {
      method: 'POST',
      body: JSON.stringify({ session_token: sessionToken, target_state: targetState }),
    }),

  getMe: (sessionToken: string) =>
    request<Record<string, unknown>>(`/players/me?session_token=${sessionToken}`),

  heartbeat: (sessionToken: string) =>
    request('/players/heartbeat', {
      method: 'POST',
      body: JSON.stringify({ session_token: sessionToken }),
    }),

  disconnect: (sessionToken: string) =>
    request('/players/disconnect', {
      method: 'POST',
      body: JSON.stringify({ session_token: sessionToken }),
    }),

  switchTeam: (sessionToken: string) =>
    request('/players/switch-team', {
      method: 'POST',
      body: JSON.stringify({ session_token: sessionToken }),
    }),

  submitFantasyPicks: (sessionToken: string, picks: Array<{ api_player_id: number; player_name: string; position: string; initial_rating?: number }>) =>
    request('/players/fantasy/pick', {
      method: 'POST',
      body: JSON.stringify({ session_token: sessionToken, picks }),
    }),

  getActiveBet: (roomId: string) =>
    request<{ bet: Record<string, unknown> | null }>(`/flash-bets/${roomId}/active`),

  placeWager: (sessionToken: string, flashBetId: string, chosenOption: string, amount: number) =>
    request<{ option_label?: string; amount?: number }>('/flash-bets/wager', {
      method: 'POST',
      body: JSON.stringify({
        session_token: sessionToken,
        flash_bet_id: flashBetId,
        chosen_option: chosenOption,
        amount,
      }),
    }),

  deploySabotage: (sessionToken: string, tokenType: string, targetId: string) =>
    request('/sabotage/deploy', {
      method: 'POST',
      body: JSON.stringify({ session_token: sessionToken, token_type: tokenType, target_id: targetId }),
    }),

  getActiveSabotages: (roomId: string, sessionToken: string) =>
    request<{ sabotages: Record<string, unknown>[] }>(
      `/sabotage/${roomId}/active?session_token=${sessionToken}`,
    ),

  sendChat: (sessionToken: string, content: string) =>
    request('/chat/send', {
      method: 'POST',
      body: JSON.stringify({ session_token: sessionToken, content }),
    }),

  getChatMessages: (roomId: string) =>
    request<{ messages: Record<string, unknown>[] }>(`/chat/${roomId}/messages`),

  searchMatches: (query: string) =>
    request<{ matches: Record<string, unknown>[] }>(`/sports/search-match?q=${encodeURIComponent(query)}`),

  getLineups: (matchId: string) =>
    request<Record<string, unknown>>(`/sports/lineups/${matchId}`),

  getLiveMatch: (matchId: string) =>
    request<Record<string, unknown>>(`/sports/live/${matchId}`),

  manualFlashBet: (
    code: string,
    sessionToken: string,
    betType: string,
    eventLabel: string,
    options?: Record<string, unknown>,
  ) =>
    request(`/rooms/${code}/manual-flash-bet`, {
      method: 'POST',
      body: JSON.stringify({
        session_token: sessionToken,
        bet_type: betType,
        event_label: eventLabel,
        ...(options ? { options } : {}),
      }),
    }),

  kickPlayer: (code: string, sessionToken: string, playerId: string) =>
    request(`/rooms/${code}/kick`, {
      method: 'POST',
      body: JSON.stringify({ session_token: sessionToken, player_id: playerId }),
    }),

  rematch: (code: string, sessionToken: string) =>
    request<{ code: string; host_token: string; room_id: string }>(`/rooms/${code}/rematch`, {
      method: 'POST',
      body: JSON.stringify({ session_token: sessionToken }),
    }),

  testCreateSession: (nickname: string) =>
    request<Record<string, unknown>>('/test/create-session', {
      method: 'POST',
      body: JSON.stringify({ nickname }),
    }),

  testQuickStart: (nickname: string) =>
    request<Record<string, unknown>>('/test/quick-start', {
      method: 'POST',
      body: JSON.stringify({ nickname }),
    }),

  testStartDraft: () =>
    request<{ state: string; message: string }>('/test/start-draft', { method: 'POST' }),

  testLockFantasy: () =>
    request<{ state: string; message: string }>('/test/lock-fantasy', { method: 'POST' }),

  predictScore: (sessionToken: string, scoreA: number, scoreB: number) =>
    request<{ prediction: { score_a: number; score_b: number } }>('/players/predict-score', {
      method: 'POST',
      body: JSON.stringify({ session_token: sessionToken, score_a: scoreA, score_b: scoreB }),
    }),

  testGoLive: () =>
    request<{ state: string }>('/test/go-live', { method: 'POST' }),

  testAdvanceEvent: () =>
    request<Record<string, unknown>>('/test/advance-event', { method: 'POST' }),

  testRunAuto: (speed: number) =>
    request<Record<string, unknown>>('/test/run-auto', {
      method: 'POST',
      body: JSON.stringify({ speed }),
    }),

  testScenarioState: () =>
    request<Record<string, unknown>>('/test/scenario-state'),

  testReset: () =>
    request<{ message: string }>('/test/reset', { method: 'POST' }),
};

export { ApiError };
