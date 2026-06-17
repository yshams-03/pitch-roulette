import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { Avatar } from '../components/Avatar';
import type { Prediction } from '../../../shared/types';

export function RoomResultsPage() {
  const { code } = useParams<{ code: string }>();
  const [leaderboard, setLeaderboard] = useState<Prediction[]>([]);
  const [actual, setActual] = useState<{ home: number; away: number } | null>(null);

  useEffect(() => {
    if (!code) return;
    api.roomResults(code).then((r) => {
      setLeaderboard((r.leaderboard as Prediction[]) || []);
      setActual(r.actual_score as { home: number; away: number });
    });
  }, [code]);

  return (
    <div className="px-4 py-6 max-w-lg mx-auto">
      <h1 data-testid="results-heading" className="text-xl font-bold text-white mb-2">Match results</h1>
      {actual && (
        <p className="text-2xl font-mono text-pitch-green mb-6">
          Final: {actual.home} – {actual.away}
        </p>
      )}
      <div className="space-y-2">
        {leaderboard.map((p) => (
          <div key={p.id} className="flex items-center gap-3 rounded-xl bg-pitch-card border border-pitch-border p-3">
            <span className="w-6 text-pitch-muted">{(p as Prediction & { rank?: number }).rank}</span>
            <Avatar name={p.display_name || '?'} color={p.avatar_color} />
            <div className="flex-1">
              <Link to={`/profile/${p.username}`} className="font-medium text-white">{p.display_name}</Link>
              <p className="text-sm text-pitch-muted">
                Predicted {p.home_goals}–{p.away_goals}
              </p>
            </div>
            <span className="font-bold text-pitch-green">+{p.points_earned} PP</span>
          </div>
        ))}
      </div>
      <Link to="/" className="block mt-8 text-center text-pitch-green">Back to home</Link>
    </div>
  );
}
