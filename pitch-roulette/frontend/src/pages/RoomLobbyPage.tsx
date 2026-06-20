import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Copy } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '../lib/api';
import { snapshotFromApi } from '../lib/roomSnapshot';
import { useAuthStore } from '../store/authStore';
import { Avatar } from '../components/Avatar';
import { RoomConnectionBadge } from '../components/RoomConnectionBadge';
import { TeamCrest } from '../components/TeamCrest';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { useRoomRealtime } from '../hooks/useRoomRealtime';
import { useRoomRedirect } from '../hooks/useRoomRedirect';
import type { RoomPlayer } from '../../../shared/types';

const itemVariants = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
};

export function RoomLobbyPage() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const { session, userId } = useAuthStore();
  const { room, players, connectionStatus, refresh, applySnapshot, patchRoom } = useRoomRealtime(code);
  useRoomRedirect(code, room?.state, 'lobby');
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    if (!session || !code) return;
    api.joinRoom(session.access_token, code).then(() => refresh()).catch(() => {});
  }, [session, code, refresh]);

  const isHost = room?.host_id === userId;
  const maxPlayers = 8;

  const start = async () => {
    if (!session || !code) return;
    setStarting(true);
    patchRoom({ state: 'PREDICTING' });
    try {
      const res = await api.startRoom(session.access_token, code);
      const snap = snapshotFromApi(res);
      if (snap) applySnapshot(snap);
      toast.success('Predictions open!');
      navigate(`/room/${code}/predict`);
    } catch (e) {
      refresh();
      toast.error(e instanceof Error ? e.message : 'Failed to start predictions');
    } finally {
      setStarting(false);
    }
  };

  const copyCode = () => {
    if (!room) return;
    navigator.clipboard.writeText(room.room_code);
    toast.success('Room code copied!');
  };

  const copyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    toast.success('Link copied!');
  };

  if (!room) {
    return (
      <div className="p-8 space-y-3 max-w-lg mx-auto">
        <div className="h-8 skeleton w-32 mx-auto" />
        <div className="h-24 skeleton" />
        <div className="h-16 skeleton" />
      </div>
    );
  }

  const match = room.match_data;
  const emptySlots = Math.max(0, maxPlayers - players.length);

  return (
    <div className="px-4 py-6 max-w-lg mx-auto">
      <Card className="p-4 mb-6" lift={false}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2 min-w-0">
            <TeamCrest name={match?.home_team} logo={match?.home_logo} size="sm" />
            <span className="text-sm font-semibold truncate">{match?.home_team}</span>
            <span className="text-[var(--text-muted)] text-xs">vs</span>
            <span className="text-sm font-semibold truncate">{match?.away_team}</span>
            <TeamCrest name={match?.away_team} logo={match?.away_logo} size="sm" />
          </div>
          <RoomConnectionBadge status={connectionStatus} />
        </div>
      </Card>

      <div className="text-center mb-6">
        <p className="code text-3xl text-[var(--pr-green)] mb-2" data-testid="room-code">{room.room_code}</p>
        <div className="flex gap-2 justify-center">
          <Button variant="secondary" size="sm" icon={<Copy className="h-4 w-4" />} onClick={copyCode}>
            Share code
          </Button>
          <Button variant="ghost" size="sm" onClick={copyLink}>Share link</Button>
        </div>
      </div>

      <motion.div
        className="grid grid-cols-2 gap-2 mb-6"
        initial="initial"
        animate="animate"
        variants={{ animate: { transition: { staggerChildren: 0.06 } } }}
      >
        {players.map((p: RoomPlayer) => (
          <motion.div key={p.user_id} variants={itemVariants}>
            <Card className="p-3 flex items-center gap-2" lift={false}>
              <Avatar name={p.display_name || '?'} color={p.avatar_color} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">{p.display_name}</p>
                {p.is_host && <Badge variant="gold">HOST</Badge>}
              </div>
            </Card>
          </motion.div>
        ))}
        {Array.from({ length: emptySlots }).map((_, i) => (
          <div
            key={`empty-${i}`}
            className="rounded-[var(--radius-lg)] border-2 border-dashed border-[var(--border)] min-h-[56px]"
          />
        ))}
      </motion.div>

      {isHost && room.state === 'LOBBY' && (
        <Button
          variant="primary"
          size="lg"
          fullWidth
          data-testid="start-predictions"
          onClick={start}
          loading={starting}
          disabled={players.length < 2 || starting}
          title={players.length < 2 ? 'Need at least 2 players' : undefined}
        >
          {starting ? 'Starting…' : 'Start Predictions →'}
        </Button>
      )}

      {!isHost && room.state === 'LOBBY' && (
        <p className="text-center text-[var(--text-secondary)] waiting-pulse">
          Waiting for host to start…
        </p>
      )}
    </div>
  );
}
