import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuthStore } from '../store/authStore';
import { Avatar } from '../components/Avatar';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Tabs } from '../components/ui/Tabs';
import type { LeaderboardEntry } from '../../../shared/types';

const PERIOD_TABS = [
  { id: 'alltime' as const, label: 'All Time' },
  { id: 'month' as const, label: 'This Month' },
  { id: 'week' as const, label: 'This Week' },
];

const MEDALS = ['🥇', '🥈', '🥉'];

export function LeaderboardPage() {
  const { session } = useAuthStore();
  const [period, setPeriod] = useState<'alltime' | 'month' | 'week'>('alltime');
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [myRank, setMyRank] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.globalLeaderboard(period, page, session?.access_token).then((r) => {
      setEntries((r.entries as LeaderboardEntry[]) || []);
      setMyRank((r.my_rank as number) ?? null);
      setLoading(false);
    });
  }, [period, page, session]);

  const top3 = entries.slice(0, 3);
  const rest = entries.slice(3);

  return (
    <div className="mx-auto max-w-lg px-4 py-4 pb-8">
      <h1 className="mb-4 text-xl font-bold">🏆 Global Leaderboard</h1>

      <Tabs tabs={PERIOD_TABS} active={period} onChange={(p) => { setPeriod(p); setPage(1); }} className="mb-6" />

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => <div key={i} className="h-14 skeleton" />)}
        </div>
      ) : (
        <>
          {page === 1 && top3.length >= 3 && (
            <div className="hidden md:flex items-end justify-center gap-4 mb-8">
              {[top3[1], top3[0], top3[2]].map((e, i) => {
                const heights = ['h-24', 'h-32', 'h-20'];
                const rings = ['ring-gray-400', 'ring-[var(--pr-gold)]', 'ring-orange-600'];
                return (
                  <div key={e.user_id} className={`flex flex-col items-center ${heights[i]}`}>
                    <Avatar name={e.display_name} color={e.avatar_color} size="lg" selected />
                    <p className="text-sm font-semibold mt-2 truncate max-w-[5rem]">{e.display_name}</p>
                    <p className={`text-xs score ${rings[i].includes('gold') ? 'text-[var(--pr-gold)]' : ''}`}>{e.total_points} PP</p>
                  </div>
                );
              })}
            </div>
          )}

          <Card className="overflow-hidden divide-y divide-[var(--border)]" lift={false}>
            {(page === 1 ? entries : rest).map((e) => (
              <Link
                key={e.user_id}
                to={`/profile/${e.username}`}
                className={`flex items-center gap-3 px-3 py-3 no-underline ${
                  e.is_me ? 'table-row-you' : e.rank === 1 ? 'table-row-gold' : ''
                }`}
              >
                <span className="w-6 text-sm text-[var(--text-muted)] tabular-nums">
                  {e.rank <= 3 ? MEDALS[e.rank - 1] : e.rank}
                </span>
                <Avatar name={e.display_name} color={e.avatar_color} size="sm" selected={e.is_me} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{e.display_name}</p>
                  <p className="text-xs text-[var(--text-muted)]">{e.exact_scores} exact · {e.win_rate}% win</p>
                </div>
                <span className="text-sm font-bold tabular-nums">{e.total_points}</span>
              </Link>
            ))}
          </Card>
        </>
      )}

      {myRank != null && (
        <p className="mt-4 text-center text-sm text-[var(--text-secondary)]">Your rank: #{myRank}</p>
      )}

      <Button variant="secondary" fullWidth className="mt-4" onClick={() => setPage((p) => p + 1)}>
        Load more
      </Button>
    </div>
  );
}
