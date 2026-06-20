import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { api, ApiError } from '../lib/api';
import { snapshotFromApi } from '../lib/roomSnapshot';
import { useAuthStore } from '../store/authStore';
import { useRoomRealtime } from '../hooks/useRoomRealtime';
import { useRoomRedirect } from '../hooks/useRoomRedirect';
import { CountdownRing } from '../components/ui/CountdownRing';
import type { SquadPlayer } from '../../../shared/types';

const POS_COLOR: Record<string, string> = {
  GK: 'text-yellow-400',
  DEF: 'text-blue-400',
  MID: 'text-green-400',
  FWD: 'text-red-400',
};

export function RoomDraftPage() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const { session, userId } = useAuthStore();
  const { room, refresh, applySnapshot, patchRoom } = useRoomRealtime(code);
  useRoomRedirect(code, room?.state, 'draft');
  const [squad, setSquad] = useState<SquadPlayer[]>([]);
  const [myPicks, setMyPicks] = useState(0);
  const [seconds, setSeconds] = useState(60);

  useEffect(() => {
    if (!code) return;
    api.draftSquads(code).then((r) => setSquad(r.players || [])).catch(() => {});
    api.draftPicks(code).then((r) => {
      const mine = (r.all || []).filter((p) => p.user_id === userId).length;
      setMyPicks(mine);
    }).catch(() => {});
  }, [code, userId, room?.state]);

  useEffect(() => {
    if (room?.state !== 'DRAFTING') return;
    const started = room.draft_started_at ? new Date(room.draft_started_at).getTime() : Date.now();
    const tick = () => {
      const rem = Math.max(0, 60 - Math.floor((Date.now() - started) / 1000));
      setSeconds(rem);
      if (rem === 0 && room.host_id === userId && session && code) {
        patchRoom({ state: 'LIVE' });
        api.goLive(session.access_token, code)
          .then((res) => {
            const snap = snapshotFromApi(res);
            if (snap) applySnapshot(snap);
            navigate(`/room/${code}/live`);
          })
          .catch(() => refresh());
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [room, session, code, userId, navigate, patchRoom, applySnapshot, refresh]);

  const pick = async (playerId: string) => {
    if (!session || !code || myPicks >= 3) return;
    try {
      await api.draftPick(session.access_token, code, playerId);
      toast.success('Player drafted!');
      setMyPicks((n) => n + 1);
      const r = await api.draftSquads(code);
      setSquad(r.players || []);
      refresh();
    } catch (e) {
      const msg = e instanceof ApiError && e.data.error === 'player_already_taken'
        ? 'Already taken'
        : 'Could not pick';
      toast.error(msg);
    }
  };

  if (!room) return <div className="p-8 text-pitch-muted">Loading draft...</div>;

  const home = squad.filter((p) => p.team === 'HOME');
  const away = squad.filter((p) => p.team === 'AWAY');

  return (
    <div className="px-4 py-6 max-w-lg mx-auto" data-testid="draft-page">
      <div className="flex flex-col items-center mb-6">
        <CountdownRing seconds={seconds} total={60} size={80} />
        <p className="text-sm text-[var(--text-secondary)] mt-3">Your picks ({myPicks}/3)</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <h2 className="text-xs text-blue-400 mb-2">HOME</h2>
          {home.map((p) => (
            <PlayerCard key={p.player_id} player={p} onPick={() => pick(p.player_id)} disabled={myPicks >= 3} />
          ))}
        </div>
        <div>
          <h2 className="text-xs text-red-400 mb-2">AWAY</h2>
          {away.map((p) => (
            <PlayerCard key={p.player_id} player={p} onPick={() => pick(p.player_id)} disabled={myPicks >= 3} />
          ))}
        </div>
      </div>

      {myPicks >= 3 && (
        <p className="text-center text-pitch-green mt-6 text-sm">Waiting for others…</p>
      )}
    </div>
  );
}

function PlayerCard({
  player,
  onPick,
  disabled,
}: {
  player: SquadPlayer;
  onPick: () => void;
  disabled: boolean;
}) {
  const taken = !player.available;
  return (
    <div
      className={`mb-2 rounded-lg border p-2 text-xs ${
        taken ? 'opacity-50 border-pitch-border' : 'border-pitch-border bg-pitch-card'
      }`}
      data-testid="draft-player-card"
    >
      <p className={`font-medium ${POS_COLOR[player.position] || 'text-white'}`}>
        #{player.shirt_number} {player.name}
      </p>
      <p className="text-pitch-muted">{player.position}</p>
      {taken ? (
        <p className="text-pitch-muted mt-1">Taken by {player.taken_by_nickname || '?'}</p>
      ) : (
        <button
          type="button"
          data-testid="draft-pick-btn"
          disabled={disabled}
          onClick={onPick}
          className="btn btn-primary btn-sm mt-2 w-full"
        >
          Pick
        </button>
      )}
    </div>
  );
}
