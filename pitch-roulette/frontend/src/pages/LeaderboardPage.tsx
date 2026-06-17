import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuthStore } from '../store/authStore';
import { Avatar } from '../components/Avatar';
import type { LeaderboardEntry } from '../../../shared/types';

export function LeaderboardPage() {
  const { session } = useAuthStore();
  const [period, setPeriod] = useState('alltime');
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [myRank, setMyRank] = useState<number | null>(null);
  const [page, setPage] = useState(1);

  useEffect(() => {
    api.globalLeaderboard(period, page, session?.access_token).then((r) => {
      setEntries((r.entries as LeaderboardEntry[]) || []);
      setMyRank((r.my_rank as number) ?? null);
    });
  }, [period, page, session]);

  return (
    <div className="mx-auto max-w-lg px-4 py-4">
      <h1 className="mb-4 text-base font-semibold text-white">Leaderboard</h1>
      <div className="ui-segment mb-4 w-full">
        {(['alltime', 'month', 'week'] as const).map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => { setPeriod(p); setPage(1); }}
            data-active={period === p}
            className="flex-1"
          >
            {p === 'alltime' ? 'All time' : p}
          </button>
        ))}
      </div>
      <div className="ui-surface divide-y divide-pitch-border">
        {entries.map((e) => (
          <Link
            key={e.user_id}
            to={`/profile/${e.username}`}
            className={`flex items-center gap-3 px-3 py-2.5 ${e.is_me ? 'bg-pitch-dark' : ''}`}
          >
            <span className="w-6 text-sm text-pitch-muted tabular-nums">{e.rank}</span>
            <Avatar name={e.display_name} color={e.avatar_color} size="sm" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm text-white">{e.display_name}</p>
              <p className="text-xs text-pitch-muted">{e.exact_scores} exact</p>
            </div>
            <span className="text-sm font-medium text-white tabular-nums">{e.total_points}</span>
          </Link>
        ))}
      </div>
      {myRank != null && (
        <p className="mt-4 text-center text-sm text-pitch-muted">Your rank: #{myRank}</p>
      )}
      <div className="mt-4 flex gap-2">
        <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="ui-btn flex-1 disabled:opacity-40">
          Prev
        </button>
        <button type="button" onClick={() => setPage((p) => p + 1)} className="ui-btn flex-1">
          Next
        </button>
      </div>
    </div>
  );
}
