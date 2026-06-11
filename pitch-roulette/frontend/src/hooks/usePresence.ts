import { useEffect } from 'react';
import { api } from '../lib/api';
import { useGameStore } from '../store/gameStore';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000';

export function usePresence() {
  const sessionToken = useGameStore((s) => s.sessionToken);

  useEffect(() => {
    if (!sessionToken) return;

    const ping = () => {
      api.heartbeat(sessionToken).catch(() => {});
    };

    ping();
    const interval = setInterval(ping, 2000);

    const disconnect = () => {
      const body = JSON.stringify({ session_token: sessionToken });
      const blob = new Blob([body], { type: 'application/json' });
      if (!navigator.sendBeacon(`${BACKEND_URL}/players/disconnect`, blob)) {
        fetch(`${BACKEND_URL}/players/disconnect`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body,
          keepalive: true,
        }).catch(() => {});
      }
    };

    window.addEventListener('beforeunload', disconnect);
    window.addEventListener('pagehide', disconnect);

    return () => {
      clearInterval(interval);
      window.removeEventListener('beforeunload', disconnect);
      window.removeEventListener('pagehide', disconnect);
      api.disconnect(sessionToken).catch(() => {});
    };
  }, [sessionToken]);
}
