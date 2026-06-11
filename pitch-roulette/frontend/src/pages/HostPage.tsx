import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { loadSession } from '../lib/session';
import { api } from '../lib/api';
import { useGameStore } from '../store/gameStore';
import { useRoomSubscription } from '../hooks/useRoomSubscription';
import { HostControlPanel } from '../components/HostControlPanel';
import { ReconnectBanner } from '../components/ReconnectBanner';

export function HostPage() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const [denied, setDenied] = useState(false);
  const { roomId, isHost, setSession, hydrateFromRoom } = useGameStore();

  useRoomSubscription(roomId);

  useEffect(() => {
    const session = loadSession();
    if (!session || session.roomCode !== code) {
      navigate(`/?message=session_expired`);
      return;
    }

    setSession(session.sessionToken, session.playerId, session.roomCode, session.isHost);

    if (!session.isHost) {
      setDenied(true);
      return;
    }

    api.getRoom(code!).then((room) => {
      hydrateFromRoom(room, session.playerId);
    }).catch(() => {
      navigate('/');
    });
  }, [code, navigate, setSession, hydrateFromRoom]);

  if (denied) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-pitch-black px-4 text-center">
        <h1 className="mb-2 text-xl font-bold text-pitch-red">Access Denied</h1>
        <p className="mb-6 text-pitch-muted">Only the host can access this panel.</p>
        <button
          onClick={() => navigate(`/room/${code}/lobby`)}
          className="rounded-xl bg-pitch-green px-6 py-3 font-bold text-pitch-black"
        >
          Back to Game
        </button>
      </div>
    );
  }

  if (!isHost) return null;

  return (
    <>
      <ReconnectBanner />
      <HostControlPanel />
    </>
  );
}
