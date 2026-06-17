import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { api } from '../lib/api';
import { useAuthStore } from '../store/authStore';
import { RoomConnectionBadge } from '../components/RoomConnectionBadge';
import { useRoomRealtime } from '../hooks/useRoomRealtime';
import { useRoomRedirect } from '../hooks/useRoomRedirect';
import { SideReveal } from '../components/SideReveal';
import type { PredictedOutcome, Side } from '../../../shared/types';

function outcomeFromScore(h: number, a: number): PredictedOutcome {
  if (h > a) return 'HOME_WIN';
  if (h < a) return 'AWAY_WIN';
  return 'DRAW';
}

export function RoomPredictPage() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const { session, userId } = useAuthStore();
  const { room, players, predictions, connectionStatus, refresh } = useRoomRealtime(code);
  useRoomRedirect(code, room?.state, 'predict');
  const [home, setHome] = useState('1');
  const [away, setAway] = useState('1');
  const [outcome, setOutcome] = useState<PredictedOutcome>('HOME_WIN');
  const [submitting, setSubmitting] = useState(false);
  const [showReveal, setShowReveal] = useState(false);

  const me = players.find((p) => p.user_id === userId);
  const mySide = me?.assigned_side as Side | undefined;

  const locked = room?.state === 'CLOSED';

  useEffect(() => {
    const h = parseInt(home, 10) || 0;
    const a = parseInt(away, 10) || 0;
    setOutcome(outcomeFromScore(h, a));
  }, [home, away]);

  const myPrediction = predictions.find((p) => p.user_id === userId);

  const submit = async () => {
    if (!session || !code || locked) return;
    setSubmitting(true);
    try {
      await api.predict(session.access_token, code, {
        home_goals: parseInt(home, 10),
        away_goals: parseInt(away, 10),
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

  if (!room) return <div className="p-8 text-pitch-muted">Loading...</div>;
  const match = room.match_data;
  const teamName = mySide === 'HOME' ? (match?.home_team || 'Home') : (match?.away_team || 'Away');

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

  return (
    <div className="px-4 py-6 max-w-lg mx-auto">
      {showReveal && mySide && (
        <SideReveal
          teamName={teamName}
          side={mySide}
          onDismiss={() => {
            sessionStorage.setItem(`reveal-${code}`, '1');
            setShowReveal(false);
          }}
        />
      )}
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-xl font-bold">{match?.home_team} vs {match?.away_team}</h1>
        <RoomConnectionBadge status={connectionStatus} />
      </div>
      <p className="text-sm text-pitch-muted mb-4">
        {locked ? 'Predictions locked — waiting for draft' : 'Predict the final score'}
      </p>
      {mySide && (
        <p className="text-sm mb-2" data-testid="assigned-side-badge">
          {mySide === 'HOME' ? '🔵' : '🔴'} You&apos;re {teamName}
        </p>
      )}
      {room.state === 'PREDICTING' && mySide && !me?.side_swap_used && (
        <button
          type="button"
          data-testid="swap-side-btn"
          disabled={mySessionPc < 20}
          onClick={swapSide}
          className="text-xs text-pitch-amber mb-4 underline disabled:opacity-40"
        >
          Switch sides 🔄 (20 PC)
        </button>
      )}

      {predictions.length > 0 && (
        <div className="ui-surface mb-4 p-3 space-y-1">
          {room.players?.map((p) => {
            const pred = predByUser.get(p.user_id);
            return (
              <p key={p.user_id} className="text-xs text-pitch-muted flex justify-between gap-2">
                <span>{p.display_name}</span>
                <span className="font-mono text-white">
                  {pred ? `${pred.home_goals}–${pred.away_goals}` : '…'}
                </span>
              </p>
            );
          })}
        </div>
      )}

      {!locked && (
        <div data-testid="prediction-form">
          <div className="flex items-center justify-center gap-4 mb-6">
            <div className="text-center">
              <p className="text-xs text-pitch-muted mb-2">{match?.home_team}</p>
              <input type="number" min={0} max={20} value={home} onChange={(e) => setHome(e.target.value)}
                className="w-16 min-h-11 text-center text-2xl font-mono rounded-xl bg-pitch-card border border-pitch-border text-white" />
            </div>
            <span className="text-2xl text-pitch-muted">–</span>
            <div className="text-center">
              <p className="text-xs text-pitch-muted mb-2">{match?.away_team}</p>
              <input type="number" min={0} max={20} value={away} onChange={(e) => setAway(e.target.value)}
                className="w-16 min-h-11 text-center text-2xl font-mono rounded-xl bg-pitch-card border border-pitch-border text-white" />
            </div>
          </div>

          <div className="flex gap-2 mb-6">
            {([
              ['HOME_WIN', `${match?.home_team} win`],
              ['DRAW', 'Draw'],
              ['AWAY_WIN', `${match?.away_team} win`],
            ] as const).map(([val, label]) => (
              <button key={val} type="button" onClick={() => setOutcome(val)}
                className={`flex-1 min-h-11 rounded-lg text-xs px-1 ${
                  outcome === val ? 'bg-pitch-green text-pitch-black font-semibold' : 'bg-pitch-card border border-pitch-border'
                }`}>
                {label}
              </button>
            ))}
          </div>

          <button
            type="button"
            data-testid="prediction-submit"
            onClick={submit}
            disabled={submitting}
            className="w-full min-h-11 rounded-xl bg-pitch-green text-pitch-black font-bold mb-3"
          >
            {submitting ? 'Saving...' : myPrediction ? 'Update prediction' : 'Lock prediction'}
          </button>
        </div>
      )}

      {myPrediction && locked && (
        <p className="text-center text-pitch-green mb-4 font-mono text-lg">
          Your pick: {myPrediction.home_goals}–{myPrediction.away_goals}
        </p>
      )}

      {isHost && room.state === 'PREDICTING' && (
        <button
          type="button"
          data-testid="lock-predictions"
          onClick={lockPredictions}
          className="w-full min-h-11 rounded-xl border border-pitch-amber text-pitch-amber mb-2"
        >
          Lock predictions
        </button>
      )}

      {isHost && locked && (
        <button
          type="button"
          data-testid="go-live"
          onClick={goLive}
          className="w-full min-h-11 rounded-xl bg-pitch-green text-pitch-black font-bold mb-2"
        >
          Skip draft / Go live
        </button>
      )}

      {isHost && (
        <Link to={`/host/${code}`} className="block text-center text-xs text-pitch-muted mt-4">
          Open host panel →
        </Link>
      )}
    </div>
  );
}
