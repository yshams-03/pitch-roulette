import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, ApiError } from '../lib/api';
import toast from 'react-hot-toast';
import { useGameStore } from '../store/gameStore';
import { useRoomSubscription } from '../hooks/useRoomSubscription';
import { ScoutingHub } from '../components/ScoutingHub';
import { TeamAssignmentReveal } from '../components/TeamAssignmentReveal';
import { ScorePredictPanel } from '../components/ScorePredictPanel';
import { ChipBalance } from '../components/ChipBalance';
import { ReconnectBanner } from '../components/ReconnectBanner';

export function ScoutingPage() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const {
    roomId, roomState, matchId, myTeam, activeSabotages,
    sessionToken, setMyFantasyPicks, settings,
  } = useGameStore();
  const [lineups, setLineups] = useState<Array<{ team: string; formation: string; players: Array<{ id: number; name: string; number: number; pos: string }> }>>([]);
  const [lineupsLoading, setLineupsLoading] = useState(true);
  const [showReveal, setShowReveal] = useState(true);
  const [handicapTeam, setHandicapTeam] = useState<'A' | 'B' | null>(null);
  const { handicapActive, teamAName, teamBName } = useGameStore();

  useRoomSubscription(roomId);

  useEffect(() => {
    if (roomState === 'DRAFT_LOCKED') navigate(`/room/${code}/draft`);
    else if (roomState === 'LIVE') navigate(`/room/${code}/live`);
    else if (roomState === 'LOBBY') navigate(`/room/${code}/lobby`);
  }, [roomState, code, navigate]);

  useEffect(() => {
    if (!matchId) { setLineupsLoading(false); return; }
    api.getLineups(matchId)
      .then((data) => {
        if (data.available) {
          setLineups(data.lineups as typeof lineups);
          const handicap = data.handicap as { active?: boolean; team?: 'A' | 'B' };
          if (handicap?.team) setHandicapTeam(handicap.team);
        }
      })
      .finally(() => setLineupsLoading(false));
  }, [matchId]);

  useEffect(() => {
    if (sessionToken) {
      api.getMe(sessionToken).then((me) => {
        if (me.fantasy_picks) setMyFantasyPicks(me.fantasy_picks as Parameters<typeof setMyFantasyPicks>[0]);
      }).catch(() => {});
    }
  }, [sessionToken, setMyFantasyPicks]);

  const blindfolded = activeSabotages.some((s) => s.token_type === 'BLINDFOLD');

  return (
    <div className="min-h-screen bg-pitch-black px-4 py-6">
      <ReconnectBanner />

      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-lg font-bold text-white">Scouting Hub</h1>
        <ChipBalance />
      </div>

      {showReveal && myTeam && (
        <TeamAssignmentReveal onDismiss={() => setShowReveal(false)} />
      )}

      <ScorePredictPanel />

      {lineupsLoading ? (
        <div className="space-y-3">
          <div className="h-64 animate-pulse rounded-xl bg-pitch-card" />
          <div className="h-8 animate-pulse rounded-lg bg-pitch-card" />
        </div>
      ) : lineups.length === 0 ? (
        <div className="rounded-xl border border-pitch-border bg-pitch-card p-8 text-center">
          <p className="text-pitch-muted">Waiting for lineups...</p>
          <p className="mt-2 text-xs text-pitch-muted">Lineups appear ~1 hour before kickoff</p>
        </div>
      ) : (
        <ScoutingHub
          lineups={lineups}
          blindfolded={blindfolded}
          handicapActive={handicapActive}
          handicapTeam={handicapTeam}
          teamAName={teamAName}
          teamBName={teamBName}
        />
      )}

      {settings.test_mode ? (
        <div className="mb-4 rounded-xl border border-pitch-green/40 bg-pitch-card p-4 text-center">
          <p className="text-sm text-pitch-muted mb-2">Test mode — lock fantasy when ready</p>
          <button
            type="button"
            onClick={async () => {
              try {
                const r = await api.testLockFantasy();
                toast.success(r.message);
                navigate(`/room/${code}/draft`);
              } catch (e) {
                toast.error(e instanceof ApiError ? String(e.data.detail || e.data.error || e.message) : 'Failed');
              }
            }}
            className="w-full rounded-lg bg-pitch-green py-2 font-semibold text-pitch-black"
          >
            Lock Fantasy (11-player draft)
          </button>
        </div>
      ) : (
        <p className="mt-6 text-center text-sm text-pitch-muted animate-pulse">
          Waiting for host to lock the draft...
        </p>
      )}
    </div>
  );
}
