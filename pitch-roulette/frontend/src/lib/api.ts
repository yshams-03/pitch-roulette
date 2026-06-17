import type { Sabotage, SabotageShopItem } from '../../../shared/types';

const API_BASE = import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000';

export class ApiError extends Error {
  status: number;
  data: Record<string, unknown>;
  constructor(status: number, data: Record<string, unknown>) {
    super((data.error as string) || (data.message as string) || 'Request failed');
    this.status = status;
    this.data = data;
  }
}

async function request<T>(
  path: string,
  token?: string | null,
  options: RequestInit = {},
  timeoutMs = path.startsWith('/api/demo') ? 45000 : 20000,
): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers,
      signal: controller.signal,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const detail = data.detail;
      const errData = typeof detail === 'object' && detail !== null
        ? (detail as Record<string, unknown>)
        : data;
      throw new ApiError(res.status, errData);
    }
    return data as T;
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') {
      const hint = path.startsWith('/api/demo')
        ? 'Request timed out — is the backend running on port 8000? Restart it and try again.'
        : 'Request timed out — the backend may be slow fetching sports data. Try again in a few seconds.';
      throw new Error(hint);
    }
    throw e;
  } finally {
    clearTimeout(timeout);
  }
}

export const api = {
  health: () => request<Record<string, unknown>>('/api/health'),
  standings: (comp = 'WC') => request<Record<string, unknown>>(`/api/standings/${comp}`),
  matches: (comp = 'WC') => request<Record<string, unknown>>(`/api/matches/${comp}`),
  liveMatch: (id: string) => request<Record<string, unknown>>(`/api/matches/${id}/live`),

  myProfile: (token: string) => request<Record<string, unknown>>('/api/profile/me', token),
  publicProfile: (username: string) => request<Record<string, unknown>>(`/api/profile/${username}`),
  updateProfile: (token: string, display_name: string) =>
    request('/api/profile/me', token, { method: 'PUT', body: JSON.stringify({ display_name }) }),

  myGroups: (token: string) => request<{ groups: Record<string, unknown>[] }>('/api/groups/me', token),
  createGroup: (token: string, name: string, emoji: string) =>
    request('/api/groups', token, { method: 'POST', body: JSON.stringify({ name, emoji }) }),
  groupDetail: (token: string, id: string) => request<Record<string, unknown>>(`/api/groups/${id}`, token),
  joinGroup: (token: string, invite_code: string) =>
    request('/api/groups/join', token, { method: 'POST', body: JSON.stringify({ invite_code }) }),
  leaveGroup: (token: string, id: string) =>
    request(`/api/groups/${id}/leave`, token, { method: 'DELETE' }),

  globalLeaderboard: (period: string, page: number, token?: string | null) =>
    request<Record<string, unknown>>(`/api/leaderboard/global?period=${period}&page=${page}`, token),

  createRoom: (
    token: string,
    body: {
      match_id?: string;
      group_id?: string;
      match_source?: 'live_api' | 'demo_simulation' | 'manual';
      bot_config?: { enabled: boolean; count: number; difficulty: string };
      phase?: string;
    },
  ) => {
    const slow = body.match_source === 'demo_simulation';
    return request<Record<string, unknown>>(
      '/api/rooms',
      token,
      { method: 'POST', body: JSON.stringify(body) },
      slow ? 45_000 : 20_000,
    );
  },
  getRoom: (code: string) =>
    request<Record<string, unknown>>(`/api/rooms/${code}`, undefined, {}, 45_000),
  joinRoom: (token: string, code: string) =>
    request<Record<string, unknown>>(`/api/rooms/${code}/join`, token, { method: 'POST', body: '{}' }),
  startRoom: (token: string, code: string) =>
    request<Record<string, unknown>>(`/api/rooms/${code}/start`, token, { method: 'POST', body: '{}' }),
  predict: (token: string, code: string, body: Record<string, unknown>) =>
    request(`/api/rooms/${code}/predict`, token, { method: 'POST', body: JSON.stringify(body) }),
  closeRoom: (token: string, code: string) =>
    request<Record<string, unknown>>(`/api/rooms/${code}/close`, token, { method: 'POST', body: '{}' }),
  lockRoom: (token: string, code: string) =>
    request<Record<string, unknown>>(`/api/rooms/${code}/lock`, token, { method: 'POST', body: '{}' }),
  goLive: (token: string, code: string) =>
    request<Record<string, unknown>>(`/api/rooms/${code}/go-live`, token, { method: 'POST', body: '{}' }),
  endMatch: (token: string, code: string, body?: Record<string, unknown>) =>
    request<Record<string, unknown>>(`/api/rooms/${code}/end`, token, {
      method: 'POST',
      body: JSON.stringify(body || {}),
    }),
  roomResults: (code: string) => request<Record<string, unknown>>(`/api/rooms/${code}/results`),

  flashBets: (code: string) => request<{ bets: Record<string, unknown>[] }>(`/api/rooms/${code}/flash-bets`),
  createFlashBet: (token: string, code: string, body: Record<string, unknown>) =>
    request(`/api/rooms/${code}/flash-bets`, token, { method: 'POST', body: JSON.stringify(body) }),
  answerFlashBet: (token: string, code: string, betId: string, chosen_option: string) =>
    request(`/api/rooms/${code}/flash-bets/${betId}/answer`, token, {
      method: 'POST',
      body: JSON.stringify({ chosen_option }),
    }),
  resolveFlashBet: (token: string, code: string, betId: string, correct_option: string) =>
    request(`/api/rooms/${code}/flash-bets/${betId}/resolve`, token, {
      method: 'POST',
      body: JSON.stringify({ correct_option }),
    }),
  flashBetResults: (code: string, betId: string) =>
    request<Record<string, unknown>>(`/api/rooms/${code}/flash-bets/${betId}/results`),

  roomMessages: (code: string, before?: string) =>
    request<{ messages: Record<string, unknown>[] }>(
      `/api/rooms/${code}/messages${before ? `?before=${encodeURIComponent(before)}` : ''}`,
    ),
  sendMessage: (token: string, code: string, content: string) =>
    request(`/api/rooms/${code}/messages`, token, { method: 'POST', body: JSON.stringify({ content }) }),
  deleteMessage: (token: string, code: string, messageId: string) =>
    request(`/api/rooms/${code}/messages/${messageId}`, token, { method: 'DELETE' }),
  toggleChat: (token: string, code: string, enabled: boolean) =>
    request(`/api/rooms/${code}/chat-toggle`, token, {
      method: 'POST',
      body: JSON.stringify({ enabled }),
    }),
  kickPlayer: (token: string, code: string, user_id: string) =>
    request(`/api/rooms/${code}/kick`, token, { method: 'POST', body: JSON.stringify({ user_id }) }),

  sabotageShop: (token: string, code: string) =>
    request<{ catalog: SabotageShopItem[]; session_pc: number; room_state: string }>(
      `/api/rooms/${code}/sabotages/shop`,
      token,
    ),
  listSabotages: (token: string, code: string) =>
    request<{ targeting_me: Sabotage[]; room_active: Sabotage[]; is_host: boolean }>(
      `/api/rooms/${code}/sabotages`,
      token,
    ),
  purchaseSabotage: (token: string, code: string, sabotage_type: string, target_user_id: string) =>
    request<Sabotage>(`/api/rooms/${code}/sabotages`, token, {
      method: 'POST',
      body: JSON.stringify({ sabotage_type, target_user_id }),
    }),

  fastForward: (token: string, code: string) =>
    request(`/api/rooms/${code}/fast-forward`, token, { method: 'POST', body: '{}' }),
  injectEvent: (token: string, code: string, event_type: string) =>
    request(`/api/rooms/${code}/inject-event`, token, {
      method: 'POST',
      body: JSON.stringify({ event_type }),
    }),

  /** @deprecated Use createRoom({ match_source: 'demo_simulation' }) */
  demoEnabled: () => request<{ enabled: boolean }>('/api/demo/enabled'),
  /** @deprecated Use createRoom({ match_source: 'demo_simulation' }) */
  demoStart: (token: string, phase = 'LOBBY') =>
    request<{ code: string; room: Record<string, unknown> }>('/api/demo/start', token, {
      method: 'POST',
      body: JSON.stringify({ phase }),
    }),
  /** @deprecated Use fastForward */
  demoFastForward: (token: string, code: string) =>
    request('/api/demo/rooms/' + code + '/fast-forward', token, { method: 'POST', body: '{}' }),
};

export function formatKickoff(iso: string) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'short', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  }).format(new Date(iso));
}
