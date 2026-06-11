import { useState } from 'react';
import toast from 'react-hot-toast';
import { api, ApiError } from '../lib/api';
import { useGameStore } from '../store/gameStore';

export function ScorePredictPanel() {
  const { sessionToken, settings, teamAName, teamBName, playerId } = useGameStore();
  const [scoreA, setScoreA] = useState('1');
  const [scoreB, setScoreB] = useState('2');
  const [submitting, setSubmitting] = useState(false);
  const myPrediction = playerId ? settings.score_predictions?.[playerId] : undefined;

  if (!settings.test_mode) return null;

  const handleSubmit = async () => {
    if (!sessionToken) return;
    setSubmitting(true);
    try {
      await api.predictScore(sessionToken, parseInt(scoreA, 10), parseInt(scoreB, 10));
      toast.success('Score prediction locked!');
    } catch (e) {
      toast.error(e instanceof ApiError ? String(e.data.error || e.message) : 'Failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mb-4 rounded-xl border border-pitch-amber/40 bg-pitch-card p-4">
      <h3 className="font-semibold text-pitch-amber mb-1">Predict Final Score</h3>
      <p className="text-xs text-pitch-muted mb-3">
        Exact score = 500 PC · Correct result = 200 PC (actual: Egypt 1–2 Belgium)
      </p>
      <div className="flex items-center gap-2 mb-3">
        <span className="text-sm text-pitch-muted w-16">{teamAName}</span>
        <input
          type="number"
          min={0}
          max={20}
          value={scoreA}
          onChange={(e) => setScoreA(e.target.value)}
          className="w-16 bg-pitch-dark border border-pitch-border rounded-lg px-2 py-2 text-center"
        />
        <span className="text-pitch-muted">–</span>
        <input
          type="number"
          min={0}
          max={20}
          value={scoreB}
          onChange={(e) => setScoreB(e.target.value)}
          className="w-16 bg-pitch-dark border border-pitch-border rounded-lg px-2 py-2 text-center"
        />
        <span className="text-sm text-pitch-muted w-16 text-right">{teamBName}</span>
      </div>
      <button
        type="button"
        onClick={handleSubmit}
        disabled={submitting || Boolean(myPrediction)}
        className="w-full rounded-lg bg-pitch-amber py-2 font-semibold text-pitch-black disabled:opacity-50"
      >
        {myPrediction
          ? `Predicted ${myPrediction.score_a}–${myPrediction.score_b}`
          : submitting
            ? 'Saving...'
            : 'Lock Prediction'}
      </button>
    </div>
  );
}
