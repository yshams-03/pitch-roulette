import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import type { RoomState } from '../../../shared/types';

const ROUTES: Partial<Record<RoomState, string>> = {
  LOBBY: 'lobby',
  PREDICTING: 'predict',
  CLOSED: 'predict',
  LIVE: 'live',
  FULL_TIME: 'live',
  RESULTS: 'results',
};

export function useRoomRedirect(code: string | undefined, state: RoomState | undefined, current: 'lobby' | 'predict' | 'live' | 'results') {
  const navigate = useNavigate();

  useEffect(() => {
    if (!code || !state) return;
    const target = ROUTES[state];
    if (target && target !== current) {
      navigate(`/room/${code}/${target}`, { replace: true });
    }
  }, [code, state, current, navigate]);
}
