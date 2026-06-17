import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { api } from '../lib/api';
import { useAuthStore } from '../store/authStore';
import { RoomConnectionBadge } from '../components/RoomConnectionBadge';
import { SideReveal } from '../components/SideReveal';
import { TeamCrest } from '../components/TeamCrest';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Stepper } from '../components/ui/Stepper';
import { useRoomRealtime } from '../hooks/useRoomRealtime';
import { useRoomRedirect } from '../hooks/useRoomRedirect';
import type { PredictedOutcome, Side } from '../../../shared/types';

function outcomeFromScore(h: number, a: number): PredictedOutcome {
  if (h > a) return 'HOME_WIN';
  if (h < a) return 'AWAY_WIN';
  return 'DRAW';
}

const outcomeBadge: Record<PredictedOutcome, { label: string; variant: 'blue' | 'gold' | 'live' }> = {
  HOME_WIN: { label: 'HOME WIN', variant: 'blue' },
  DRAW: { label: 'DRAW', variant: 'gold' },
  AWAY_WIN: { label: 'AWAY WIN', variant: 'live' },
};

export function RoomPredictPage() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const { session, userId } = useAuthStore();
  const { room, players, predictions, connectionStatus, refresh } = useRoomRealtime(code);
  useRoomRedirect(code, room?.state, 'predict');
  const [home, setHome] = useState(1);
  const [away, setAway] = useState(1);
  const [outcome, setOutcome] = useState<PredictedOutcome>('HOME_WIN');
  const [submitting, setSubmitting] = useState(false);
  const [showReveal, setShowReveal] = useState(false);

  const me = players.find((p) => p.user_id === userId);
  const mySide = me?.assigned_side as Side | undefined;
  const locked = room?.state === 'CLOSED';

  useEffect(() => {
    setOutcome(outcomeFromScore(home, away));
  }, [home, away]);

  const myPrediction = predictions.find((p) => p.user_id === userId);

  const submit = async () => {
    if (!session || !code || locked) return;
    setSubmitting(true);
    try {
      await api.predict(session.access_token, code, {
        home_goals: home,
        away_goals: away,
        predicted_outcome: outcome,
      });
      toast.success('Prediction locked!');
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed');
    } finally {
      setSubmitting(false);
    }
  };

  const lockPredictions = async () => {
    if (!session || !code) return;
    await api.lockRoom(session.access_token, code);
    toast.success('Predictions locked');
    refresh();
  };

  const goLive = async () => {
    if (!session || !code) return;
    try {
      await api.goLive(session.access_token, code);
      toast.success('Match is live!');
      navigate(`/room/${code}/live`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not go live');
    }
  };

  const mySessionPc = Math.round(me?.session_pc ?? 100);

  useEffect(() => {
    if (room?.state === 'PREDICTING' && mySide && !sessionStorage.getItem(`reveal-${code}`)) {
      setShowReveal(true);
    }
  }, [room?.state, mySide, code]);

  if (!room) return <div className="p-8 text-[var(--text-muted)]">Loading...</div>;
  const match = room.match_data;
  const teamName = mySide === 'HOME' ? (match?.home_team || 'Home') : (match?.away_team || 'Away');
  const teamLogo = mySide === 'HOME' ? match?.home_logo : match?.away_logo;

  const swapSide = async () => {
    if (!session || !code) return;
    if (!window.confirm('Spend 20 PC to request a side switch? (costs PC even if rejected)')) return;
    try {
      await api.swapSide(session.access_token, code);
      toast.success('Side switched!');
      sessionStorage.removeItem(`reveal-${code}`);
      setShowReveal(true);
      refresh();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Swap failed';
      toast.error(msg.includes('unbalance') ? '⚖️ Swap rejected — sides would be too unbalanced. 20 PC spent.' : msg);
      refresh();
    }
  };

  const isHost = room.host_id === userId;
  const predByUser = new Map(predictions.map((p) => [p.user_id, p]));
  const ob = outcomeBadge[outcome];

  return (
    <div className="px-4 py-6 max-w-lg mx-auto">
      {showReveal && mySide && (
        <SideReveal
          teamName={teamName}
          side={mySide}
          teamLogo={teamLogo}
          onDismiss={() => {
            sessionStorage.setItem(`reveal-${code}`, '1');
            setShowReveal(false);
          }}
        />
      )}

      <Card className="p-3 mb-4 flex items-center justify-between" lift={false}>
        <div className="flex items-center gap-2 text-sm font-semibold min-w-0">
          <TeamCrest name={match?.home_team} logo={match?.home_logo} size="xs" />
          <span className="truncate">{match?.home_team}</span>
          <span className="text-[var(--text-muted)]">vs</span>
          <span className="truncate">{match?.away_team}</span>
          <TeamCrest name={match?.away_team} logo={match?.away_logo} size="xs" />
        </div>
        <RoomConnectionBadge status={connectionStatus} />
      </Card>

      {mySide && (
        <p className="text-sm mb-2 font-semibold" data-testid="assigned-side-badge">
          {mySide === 'HOME' ? '🔵' : '🔴'} You&apos;re {teamName}
        </p>
      )}
      {room.state === 'PREDICTING' && mySide && !me?.side_swap_used && (
        <button
          type="button"
          data-testid="swap-side-btn"
          disabled={mySessionPc < 20}
          onClick={swapSide}
          className="text-xs text-[var(--pr-gold)] mb-4 underline disabled:opacity-40 bg-transparent border-0 cursor-pointer"
        >
          Switch sides 🔄 (20 🪙)
        </button>
      )}

      <h2 className="text-lg font-bold mb-4">Your Prediction</h2>

      {!locked && (
        <div data-testid="prediction-form">
          <div className="flex items-center justify-center gap-4 mb-4">
            <div className="text-center flex-1">
              <TeamCrest name={match?.home_team} logo={match?.home_logo} size="md" />
              <p className="text-xs text-[var(--text-secondary)] mt-2 mb-2">{match?.home_team}</p>
              <Stepper value={home} onChange={setHome} min={0} max={20} />
            </div>
            <span className="score text-2xl text-[var(--text-muted)]">—</span>
            <div className="text-center flex-1">
              <TeamCrest name={match?.away_team} logo={match?.away_logo} size="md" />
              <p className="text-xs text-[var(--text-secondary)] mt-2 mb-2">{match?.away_team}</p>
              <Stepper value={away} onChange={setAway} min={0} max={20} />
            </div>
          </div>

          <div className="flex justify-center mb-4">
            <Badge variant={ob.variant}>{ob.label}</Badge>
          </div>

          <div className="flex flex-col gap-2 mb-6">
            {([
              ['HOME_WIN', `${match?.home_team} win`],
              ['DRAW', 'Draw'],
              ['AWAY_WIN', `${match?.away_team} win`],
            ] as const).map(([val, label]) => (
              <button
                key={val}
                type="button"
                onClick={() => setOutcome(val)}
                className={`btn w-full ${outcome === val ? 'btn-primary' : 'btn-secondary'}`}
              >
                {label}
              </button>
            ))}
          </div>

          <Button
            variant="primary"
            size="lg"
            fullWidth
            data-testid="prediction-submit"
            onClick={submit}
            loading={submitting}
            className="mb-3"
          >
            {myPrediction ? 'Update prediction 🔒' : 'Lock In Prediction 🔒'}
          </Button>
        </div>
      )}

      {(predictions.length > 0 || locked) && (
        <Card className="p-3 mb-4 space-y-2" lift={false}>
          <p className="text-xs text-[var(--text-secondary)] uppercase font-semibold">Players</p>
          {room.players?.map((p) => {
            const pred = predByUser.get(p.user_id);
            return (
              <p key={p.user_id} className="text-sm flex justify-between gap-2">
                <span>{p.display_name}</span>
                <span>{pred ? '✓' : '⏳'}</span>
              </p>
            );
          })}
        </Card>
      )}

      {myPrediction && locked && (
        <p className="text-center text-[var(--pr-green)] mb-4 score text-xl">
          Your pick: {myPrediction.home_goals}–{myPrediction.away_goals}
        </p>
      )}

      {isHost && room.state === 'PREDICTING' && (
        <Button variant="secondary" fullWidth data-testid="lock-predictions" onClick={lockPredictions} className="mb-2">
          Lock predictions
        </Button>
      )}

      {isHost && locked && (
        <Button variant="primary" fullWidth data-testid="go-live" onClick={goLive} className="mb-2">
          Skip draft / Go live
        </Button>
      )}

      {isHost && (
        <Link to={`/host/${code}`} className="block text-center text-xs text-[var(--text-muted)] mt-4">
          Open host panel →
        </Link>
      )}
    </div>
  );
}
