import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { api, ApiError } from '../lib/api';
import { useGameStore } from '../store/gameStore';
import { useRoomSubscription } from '../hooks/useRoomSubscription';
import { ChipBalance } from '../components/ChipBalance';
import { ReconnectBanner } from '../components/ReconnectBanner';

interface PickablePlayer {
  id: number;
  name: string;
  number: number;
  pos: string;
  team: string;
  rating?: number;
}

export function DraftPage() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const { roomId, roomState, matchId, sessionToken, settings, setMyFantasyPicks, myTeam, teamAName, teamBName } = useGameStore();
  const pickCount = (settings.test_mode || matchId === 'TEST_EGY_BEL')
    ? (settings.fantasy_pick_count ?? 11)
    : (settings.fantasy_pick_count ?? 3);
  const allTeams = settings.fantasy_all_teams ?? matchId === 'TEST_EGY_BEL';
  const [players, setPlayers] = useState<PickablePlayer[]>([]);
  const [selected, setSelected] = useState<PickablePlayer[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useRoomSubscription(roomId);

  useEffect(() => {
    if (!sessionToken || roomState !== 'DRAFT_LOCKED') return;
    api.getMe(sessionToken).then((me) => {
      const picks = (me.fantasy_picks as Array<{ api_player_id: number; player_name: string; position: string }>) || [];
      if (picks.length > 0) {
        setSelected(picks.map((p) => ({
          id: p.api_player_id,
          name: p.player_name,
          number: 0,
          pos: p.position,
          team: '',
        })));
      }
    }).catch(() => {});
  }, [sessionToken, roomState]);

  useEffect(() => {
    if (roomState === 'LIVE' && !settings.test_mode) navigate(`/room/${code}/live`);
    else if (roomState === 'SCOUTING') navigate(`/room/${code}/scouting`);
    else if (roomState === 'LOBBY') navigate(`/room/${code}/lobby`);
  }, [roomState, code, navigate, settings.test_mode]);

  useEffect(() => {
    if (!matchId) { setLoading(false); return; }
    api.getLineups(matchId)
      .then((data) => {
        if (data.available) {
          const myTeamName = myTeam === 'A' ? teamAName : teamBName;
          const all: PickablePlayer[] = [];
          for (const lineup of data.lineups as Array<{ team: string; players: PickablePlayer[] }>) {
            if (!allTeams && myTeamName && lineup.team !== myTeamName) continue;
            for (const p of lineup.players) {
              all.push({ ...p, team: lineup.team });
            }
          }
          setPlayers(all);
        }
      })
      .finally(() => setLoading(false));
  }, [matchId, myTeam, teamAName, teamBName, allTeams]);

  const togglePlayer = (player: PickablePlayer) => {
    if (selected.find((s) => s.id === player.id)) {
      setSelected(selected.filter((s) => s.id !== player.id));
    } else if (selected.length < pickCount) {
      setSelected([...selected, player]);
    }
  };

  const handleSubmit = async () => {
    if (!sessionToken || selected.length !== pickCount) return;
    setSubmitting(true);
    try {
      const result = await api.submitFantasyPicks(
        sessionToken,
        selected.map((p) => ({
          api_player_id: p.id,
          player_name: p.name,
          position: p.pos,
          ...(p.rating != null ? { initial_rating: p.rating } : {}),
        })),
      );
      setMyFantasyPicks((result as { picks: Parameters<typeof setMyFantasyPicks>[0] }).picks);
      toast.success('Fantasy squad locked!');
    } catch (e) {
      if (e instanceof ApiError) {
        const err = e.data.error as string;
        if (err === 'picks_already_locked') {
          toast.error('Squad already locked — use Go Live on the test panel');
        } else if (err === 'invalid_pick_count') {
          toast.error(`Need ${(e.data.required as number) ?? pickCount} players, got ${(e.data.got as number) ?? selected.length}`);
        } else if (err === 'invalid_state') {
          toast.error(`Room is ${e.data.current as string} — lock fantasy phase first`);
        } else {
          toast.error(err || 'Failed to submit picks');
        }
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (!settings.module_fantasy) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-pitch-black p-4">
        <p className="text-pitch-muted">Fantasy module disabled. Waiting for match to start...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-pitch-black px-4 py-6">
      <ReconnectBanner />

      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-white">Fantasy Draft</h1>
          <p className="text-sm text-pitch-muted">
            Pick {pickCount} players ({selected.length}/{pickCount})
            {allTeams ? ' · both squads' : ''}
          </p>
        </div>
        <ChipBalance />
      </div>

      {selected.length > 0 && (
        <div className="mb-4 flex gap-2">
          {selected.map((p) => (
            <div key={p.id} className="flex-1 rounded-lg bg-pitch-green/20 border border-pitch-green/40 p-2 text-center">
              <p className="text-xs font-medium text-white truncate">{p.name}</p>
              <p className="text-xs text-pitch-muted">{p.pos}</p>
            </div>
          ))}
        </div>
      )}

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-14 animate-pulse rounded-lg bg-pitch-card" />
          ))}
        </div>
      ) : players.length === 0 ? (
        <div className="rounded-xl border border-pitch-border bg-pitch-card p-8 text-center text-pitch-muted">
          Waiting for lineups to pick players...
        </div>
      ) : (
        <div className="mb-24 max-h-[60vh] space-y-2 overflow-y-auto">
          {players.map((p) => {
            const isSelected = selected.some((s) => s.id === p.id);
            return (
              <button
                key={p.id}
                onClick={() => togglePlayer(p)}
                className={`flex w-full items-center justify-between rounded-lg border p-3 text-left transition-colors ${
                  isSelected
                    ? 'border-pitch-green bg-pitch-green/10'
                    : 'border-pitch-border bg-pitch-card'
                }`}
              >
                <div>
                  <span className="font-medium text-white">{p.name}</span>
                  <span className="ml-2 text-xs text-pitch-muted">
                    #{p.number} · {p.pos}
                    {p.rating != null ? ` · ${p.rating}` : ''}
                  </span>
                </div>
                <span className="text-xs text-pitch-muted">{p.team}</span>
              </button>
            );
          })}
        </div>
      )}

      <div className="fixed inset-x-0 bottom-0 border-t border-pitch-border bg-pitch-card p-4">
        <button
          onClick={handleSubmit}
          disabled={selected.length !== pickCount || submitting}
          className="w-full rounded-xl bg-pitch-green py-3 font-bold text-pitch-black disabled:opacity-40"
        >
          {submitting ? 'Locking...' : 'Lock Fantasy Squad'}
        </button>
      </div>
    </div>
  );
}
