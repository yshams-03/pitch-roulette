import { useEffect } from 'react';
import { api } from '../lib/api';
import { useGameStore } from '../store/gameStore';

export function useLivePolling() {
  const { matchId, roomState, setLiveScore } = useGameStore();

  useEffect(() => {
    if (!matchId || roomState !== 'LIVE') return;

    let active = true;

    const poll = async () => {
      try {
        const data = await api.getLiveMatch(matchId);
        if (!active) return;
        const score = data.score as { a: number; b: number };
        const clock = data.clock as string;
        setLiveScore(score, clock);
      } catch {
        // silently retry on next interval
      }
    };

    poll();
    const interval = setInterval(poll, 15000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [matchId, roomState, setLiveScore]);
}
