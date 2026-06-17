import { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { api } from '../lib/api';
import { useAuthStore } from '../store/authStore';
import { Avatar } from '../components/Avatar';
import { RoomConnectionBadge } from '../components/RoomConnectionBadge';
import { useRoomRealtime } from '../hooks/useRoomRealtime';
import { useRoomRedirect } from '../hooks/useRoomRedirect';
import type { RoomPlayer } from '../../../shared/types';

export function RoomLobbyPage() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const { session, userId } = useAuthStore();
  const { room, players, connectionStatus, refresh } = useRoomRealtime(code);
  useRoomRedirect(code, room?.state, 'lobby');

  useEffect(() => {
    if (!session || !code) return;
    api.joinRoom(session.access_token, code).then(() => refresh()).catch(() => {});
  }, [session, code, refresh]);

  const isHost = room?.host_id === userId;

  const start = async () => {
    if (!session || !code) return;
    try {
      await api.startRoom(session.access_token, code);
      toast.success('Predictions open!');
      navigate(`/room/${code}/predict`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to start predictions');
    }
  };

  if (!room) return <div className="p-8 text-pitch-muted">Loading room...</div>;
  const match = room.match_data;

  return (
    <div className="px-4 py-6 max-w-lg mx-auto">
      <div className="flex items-center justify-between mb-1">
        <p className="text-pitch-green font-mono text-lg">{room.room_code}</p>
        <RoomConnectionBadge status={connectionStatus} />
      </div>
      <h1 className="text-xl font-bold text-white mb-2">
        {match?.home_team} vs {match?.away_team}
      </h1>
      <p className="text-sm text-pitch-muted mb-6">Share the code so friends can join</p>

      <div className="space-y-2 mb-6">
        {players.map((p: RoomPlayer) => (
          <div key={p.user_id} className="flex items-center gap-3 rounded-xl bg-pitch-card border border-pitch-border p-3">
            <Avatar name={p.display_name || '?'} color={p.avatar_color} />
            <span className="text-white">{p.display_name}</span>
            {p.is_host && <span className="text-xs text-pitch-amber ml-auto">Host</span>}
          </div>
        ))}
      </div>

      {isHost && room.state === 'LOBBY' && (
        <button
          type="button"
          data-testid="start-predictions"
          onClick={start}
          className="w-full min-h-11 rounded-xl bg-pitch-green text-pitch-black font-bold"
        >
          Start predictions
        </button>
      )}
    </div>
  );
}
