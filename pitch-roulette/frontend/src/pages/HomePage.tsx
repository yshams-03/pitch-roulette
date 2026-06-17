import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '../lib/api';
import { useAuthStore } from '../store/authStore';
import { GroupTableCard } from '../components/GroupTableCard';
import { FixturesList } from '../components/FixturesList';
import { KnockoutBracket } from '../components/KnockoutBracket';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { TeamCrest } from '../components/TeamCrest';
import type { FriendGroup, MatchSummary, StandingRow } from '../../../shared/types';

const REFRESH_MS = 30_000;
type HomeTab = 'table' | 'fixtures' | 'bracket';
type TableView = 'short' | 'full';

function groupStandingsByGroup(rows: StandingRow[]): Record<string, StandingRow[]> {
  const byGroup: Record<string, StandingRow[]> = {};
  for (const row of rows) {
    const key = row.group || '?';
    if (!byGroup[key]) byGroup[key] = [];
    byGroup[key].push(row);
  }
  for (const key of Object.keys(byGroup)) {
    byGroup[key].sort((a, b) => a.rank - b.rank);
  }
  return Object.fromEntries(Object.entries(byGroup).sort(([a], [b]) => a.localeCompare(b)));
}

export function HomePage() {
  const [tab, setTab] = useState<HomeTab>('table');
  const [tableView, setTableView] = useState<TableView>('full');
  const [activeGroup, setActiveGroup] = useState<string | null>(null);
  const [matches, setMatches] = useState<MatchSummary[]>([]);
  const [standings, setStandings] = useState<StandingRow[]>([]);
  const [friendGroups, setFriendGroups] = useState<(FriendGroup & { my_group_points?: number })[]>([]);
  const [season, setSeason] = useState<number | null>(null);
  const [apiError, setApiError] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState('');
  const { session } = useAuthStore();
  const navigate = useNavigate();

  const loadData = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    setLoadError('');
    setApiError('');

    const tasks: Promise<void>[] = [
      Promise.allSettled([api.matches('WC'), api.standings('WC')]).then(([matchResult, standingResult]) => {
        let sawData = false;
        if (matchResult.status === 'fulfilled') {
          const m = matchResult.value;
          setMatches((m.matches as MatchSummary[]) || []);
          if (m.season) setSeason(Number(m.season));
          if ((m.matches as MatchSummary[])?.length) sawData = true;
          if (m.error) setApiError(String(m.error));
        }
        if (standingResult.status === 'fulfilled') {
          const s = standingResult.value;
          setStandings((s.standings as StandingRow[]) || []);
          if (s.season) setSeason(Number(s.season));
          if ((s.standings as StandingRow[])?.length) sawData = true;
          if (s.error) setApiError(String(s.error));
        }
        if (!sawData && matchResult.status === 'fulfilled' && standingResult.status === 'fulfilled') {
          const err = String(matchResult.value.error || standingResult.value.error || '');
          if (err) setApiError(err);
        }
        if (matchResult.status === 'rejected' && standingResult.status === 'rejected') {
          const msg = matchResult.reason instanceof Error ? matchResult.reason.message : 'Could not load data';
          setLoadError(msg);
          if (!silent) toast.error(msg);
        }
      }),
    ];

    if (session) {
      tasks.push(
        api.myGroups(session.access_token)
          .then((r) => setFriendGroups(r.groups as unknown as (FriendGroup & { my_group_points?: number })[]))
          .catch(() => setFriendGroups([])),
      );
    } else {
      setFriendGroups([]);
    }

    await Promise.all(tasks);
    setLoading(false);
    setRefreshing(false);
  }, [session]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    const hasLive = matches.some((m) => m.is_live);
    const interval = setInterval(() => loadData(true), hasLive ? REFRESH_MS : REFRESH_MS * 2);
    return () => clearInterval(interval);
  }, [matches, loadData]);

  const groupedStandings = useMemo(() => groupStandingsByGroup(standings), [standings]);
  const groupKeys = useMemo(() => Object.keys(groupedStandings), [groupedStandings]);

  useEffect(() => {
    if (groupKeys.length && !activeGroup) setActiveGroup(groupKeys[0]);
  }, [groupKeys, activeGroup]);

  const scheduleMatches = useMemo(
    () => [...matches].sort((a, b) => new Date(a.kickoff).getTime() - new Date(b.kickoff).getTime()),
    [matches],
  );

  const liveMatch = useMemo(() => matches.find((m) => m.is_live), [matches]);

  const createRoom = async (matchId: string) => {
    if (!session) {
      navigate('/auth/login');
      return;
    }
    try {
      const room = await api.createRoom(session.access_token, { match_id: matchId });
      navigate(`/room/${room.room_code as string}/lobby`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not create room');
    }
  };

  return (
    <div className="mx-auto max-w-lg pb-4">
      {liveMatch && (
        <div className="live-hero px-4 py-4">
          <div className="flex items-center justify-between gap-2 mb-3">
            <Badge variant="live" dot>LIVE</Badge>
            <span className="text-sm text-[var(--text-secondary)] tabular-nums">
              {liveMatch.minute != null ? `${liveMatch.minute}'` : 'Live'}
            </span>
          </div>
          <div className="flex items-center justify-center gap-3 mb-4">
            <TeamCrest name={liveMatch.home_team} logo={liveMatch.home_logo} size="md" />
            <span className="text-sm font-semibold truncate max-w-[5rem]">{liveMatch.home_team}</span>
            <span className="score text-2xl tabular-nums">
              {liveMatch.home_goals} - {liveMatch.away_goals}
            </span>
            <span className="text-sm font-semibold truncate max-w-[5rem]">{liveMatch.away_team}</span>
            <TeamCrest name={liveMatch.away_team} logo={liveMatch.away_logo} size="md" />
          </div>
          <Button variant="primary" size="lg" fullWidth onClick={() => createRoom(liveMatch.id)}>
            Create Room →
          </Button>
        </div>
      )}

      <header className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-3">
        <h1 className="text-base font-bold">
          World Cup{season ? ` ${season}` : ''}
        </h1>
        <div className="flex items-center gap-2">
          {session && (
            <Link to="/demo" className="text-xs text-[var(--pr-green)] font-semibold">Demo</Link>
          )}
          <button
            type="button"
            onClick={() => loadData(true)}
            disabled={refreshing}
            className="btn btn-ghost btn-sm min-h-9 min-w-9 p-0"
            aria-label="Refresh"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </header>

      {apiError && (
        <p className="border-b border-[var(--border)] px-4 py-2 text-xs text-[var(--pr-gold)]">{apiError}</p>
      )}

      <nav className="pr-tabs px-2">
        {([
          ['table', 'Table'],
          ['fixtures', 'Fixtures'],
          ['bracket', 'Bracket'],
        ] as const).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className="pr-tab"
            data-active={tab === id}
          >
            {label}
          </button>
        ))}
      </nav>

      {loading ? (
        <div className="space-y-3 px-4 pt-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 skeleton" />
          ))}
        </div>
      ) : loadError ? (
        <div className="surface mx-4 mt-4 p-6 text-center">
          <p className="mb-4 text-sm text-[var(--text-secondary)]">{loadError}</p>
          <Button variant="primary" fullWidth onClick={() => loadData()}>Retry</Button>
        </div>
      ) : tab === 'table' ? (
        <div className="space-y-3 px-4 pt-3">
          <div className="flex gap-2 overflow-x-auto pb-1">
            {groupKeys.map((g) => (
              <button
                key={g}
                type="button"
                className="group-pill"
                data-active={activeGroup === g}
                onClick={() => setActiveGroup(g)}
              >
                Group {g}
              </button>
            ))}
          </div>

          <div className="ui-segment">
            {(['short', 'full'] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setTableView(v)}
                data-active={tableView === v}
              >
                {v === 'short' ? 'Short' : 'Full'}
              </button>
            ))}
          </div>

          {activeGroup && groupedStandings[activeGroup] && (
            <GroupTableCard
              group={activeGroup}
              rows={groupedStandings[activeGroup]}
              compact={tableView === 'short'}
            />
          )}
          {groupKeys.length === 0 && (
            <p className="py-8 text-center text-sm text-[var(--text-muted)]">No standings</p>
          )}
        </div>
      ) : tab === 'fixtures' ? (
        <div className="px-4 pt-3">
          <FixturesList matches={scheduleMatches} onCreateRoom={createRoom} />
        </div>
      ) : (
        <div className="px-4 pt-3">
          <KnockoutBracket matches={matches} onCreateRoom={createRoom} />
        </div>
      )}

      {session && friendGroups.length > 0 && (
        <section className="border-t border-[var(--border)] px-4 pt-4 mt-4">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Groups</h2>
            <Link to="/groups" className="text-xs text-[var(--text-secondary)]">All</Link>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {friendGroups.map((g) => (
              <Link
                key={g.id}
                to={`/groups/${g.id}`}
                className="surface shrink-0 min-w-[6.5rem] px-3 py-2 no-underline card-lift"
              >
                <p className="truncate text-sm font-medium">{g.emoji} {g.name}</p>
                <p className="text-xs text-[var(--text-secondary)] tabular-nums">{g.my_group_points ?? 0} pts</p>
              </Link>
            ))}
          </div>
        </section>
      )}

      <div className="flex gap-2 px-4 pt-4">
        <Link to="/join" className="btn btn-secondary flex-1 no-underline">Join room</Link>
        {!session && (
          <Link to="/auth/login" className="btn btn-primary flex-1 no-underline">Log in</Link>
        )}
      </div>
    </div>
  );
}
