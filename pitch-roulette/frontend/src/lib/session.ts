const SESSION_KEY = 'pitch_roulette_session';

export interface SessionData {
  sessionToken: string;
  playerId: string;
  roomCode: string;
  isHost: boolean;
}

export function saveSession(data: SessionData): void {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(data));
}

export function loadSession(): SessionData | null {
  const raw = sessionStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SessionData;
  } catch {
    return null;
  }
}

export function clearSession(): void {
  sessionStorage.removeItem(SESSION_KEY);
}
