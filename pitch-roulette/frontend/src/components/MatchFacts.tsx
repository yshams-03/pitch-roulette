import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../lib/api';
import { GroupTableCard } from './GroupTableCard';
import type {
  FlashBet,
  MatchEvent,
  MatchEventLog,
  MatchFactsData,
  StandingRow,
} from '../../../shared/types';

const EVENT_ICONS: Record<string, string> = {
  GOAL: '⚽',
  OWN_GOAL: '⚽',
  YELLOW: '🟨',
  RED: '🟥',
  SECOND_YELLOW: '🟨🟥',
  SUBSTITUTION: '🔄',
  VAR: '📺',
  PENALTY_SCORED: '⚽',
  PENALTY_MISSED: '❌',
};

function parseGroupKey(groupName?: string | null): string | null {
  if (!groupName) return null;
  const m = groupName.match(/Group\s+([A-L])/i);
  return m ? m[1].toUpperCase() : null;
}

function flashTypeMatches(eventType: string, betType: string | null | undefined): boolean {
  if (!betType) return false;
  const et = eventType.toUpperCase();
  const bt = betType.toUpperCase();
  if (bt === 'VAR' && et === 'VAR') return true;
  if (bt === 'PENALTY' && (et === 'PENALTY_SCORED' || et === 'PENALTY_MISSED' || et === 'VAR')) return true;
  if (bt === 'GOAL' && (et === 'GOAL' || et === 'PENALTY_SCORED')) return true;
  const norm = (t: string) => t.replace('_CARD', '');
  return norm(et) === norm(bt);
}

function isFlashBetEvent(event: MatchEvent, bet: FlashBet | undefined, matchMinute: number): boolean {
  if (!bet || bet.state !== 'OPEN') return false;
  if (!flashTypeMatches(event.type, bet.match_event_type)) return false;
  return Math.abs(matchMinute - event.minute) < 3;
}

function goalScorersText(events: MatchEvent[], team: 'home' | 'away'): string {
  return events
    .filter((e) => e.team === team && (e.type === 'GOAL' || e.type === 'PENALTY_SCORED'))
    .sort((a, b) => a.minute - b.minute)
    .map((e) => `${e.player} ${e.minute}'`)
    .join(', ');
}

export function GoalScorersLine({ events }: { events: MatchEvent[] }) {
  const home = goalScorersText(events, 'home');
  const away = goalScorersText(events, 'away');
  if (!home && !away) return null;
  return (
    <div className="goal-scorers-line">
      <span className="goal-scorers-home">{home}</span>
      {home && away && <span className="goal-scorers-sep">•</span>}
      <span className="goal-scorers-away">{away}</span>
    </div>
  );
}

function StatBar({
  label,
  home,
  away,
  type = 'number',
}: {
  label: string;
  home: number;
  away: number;
  type?: 'number' | 'percent';
}) {
  const total = home + away || 1;
  const homePct = (home / total) * 100;
  const awayPct = (away / total) * 100;

  return (
    <div className="stat-row">
      <span className="stat-value-home">
        {type === 'percent' ? `${Math.round(home)}%` : home}
      </span>
      <div className="stat-bars">
        <div className="stat-bar-home" style={{ width: `${homePct}%` }} />
        <span className="stat-label">{label}</span>
        <div className="stat-bar-away" style={{ width: `${awayPct}%` }} />
      </div>
      <span className="stat-value-away">
        {type === 'percent' ? `${Math.round(away)}%` : away}
      </span>
    </div>
  );
}

function EventRow({
  event,
  activeFlashBet,
  matchMinute,
}: {
  event: MatchEvent;
  activeFlashBet?: FlashBet | null;
  matchMinute: number;
}) {
  const isHome = event.team === 'home';
  const rowClass = [
    'event-row',
    event.type.toLowerCase(),
    isHome ? 'home' : 'away',
    isFlashBetEvent(event, activeFlashBet ?? undefined, matchMinute) ? 'flash-bet-active' : '',
  ].filter(Boolean).join(' ');

  const icon = EVENT_ICONS[event.type] || '•';

  if (event.type === 'SUBSTITUTION') {
    return (
      <li className={rowClass} data-testid={`match-event-${event.id}`}>
        {isHome ? (
          <>
            <span className="event-minute">{event.minute}&apos;</span>
            <span className="event-icon">{icon}</span>
            <div className="event-text">
              <span className="event-player text-[var(--pr-green)]">↑ {event.player}</span>
              <span className="event-assist text-[var(--pr-red)]">↓ {event.assist}</span>
            </div>
          </>
        ) : (
          <>
            <div className="event-text event-text-right">
              <span className="event-player text-[var(--pr-green)]">↑ {event.player}</span>
              <span className="event-assist text-[var(--pr-red)]">↓ {event.assist}</span>
            </div>
            <span className="event-icon">{icon}</span>
            <span className="event-minute">{event.minute}&apos;</span>
          </>
        )}
      </li>
    );
  }

  if (event.type === 'VAR') {
    return (
      <li className={rowClass} data-testid={`match-event-${event.id}`}>
        <span className="event-minute">{event.minute}&apos;</span>
        <span className="event-icon">{icon}</span>
        <div className={`event-text ${!isHome ? 'event-text-right' : ''}`}>
          <span className="event-player">VAR Review</span>
          {event.description && (
            <span className="event-assist">{event.description}</span>
          )}
        </div>
      </li>
    );
  }

  const assistLabel = event.type === 'OWN_GOAL'
    ? '(OG)'
    : event.assist
      ? `Assist: ${event.assist}`
      : null;

  const penTag = event.type === 'PENALTY_SCORED'
    ? ' [Pen]'
    : event.type === 'PENALTY_MISSED'
      ? ' [Pen - Missed]'
      : null;

  return (
    <li className={rowClass} data-testid={`match-event-${event.id}`}>
      {isHome ? (
        <>
          <span className="event-minute">{event.minute}&apos;</span>
          <span className="event-icon">{icon}</span>
          <div className="event-text">
            <span className="event-player">
              {event.player}
              {penTag}
            </span>
            {assistLabel && <span className="event-assist">{assistLabel}</span>}
          </div>
          {event.detail && <span className="event-score">{event.detail}</span>}
        </>
      ) : (
        <>
          {event.detail && <span className="event-score">{event.detail}</span>}
          <div className="event-text event-text-right">
            <span className="event-player">
              {event.player}
              {penTag}
            </span>
            {assistLabel && <span className="event-assist">{assistLabel}</span>}
          </div>
          <span className="event-icon">{icon}</span>
          <span className="event-minute">{event.minute}&apos;</span>
        </>
      )}
    </li>
  );
}

function MatchFactsSkeleton() {
  return (
    <div className="match-facts-skeleton p-4 space-y-3">
      <div className="skeleton" style={{ height: 32 }} />
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="flex gap-2 items-center px-4">
          <div className="skeleton" style={{ width: 24, height: 16 }} />
          <div className="skeleton" style={{ width: 24, height: 24, borderRadius: '50%' }} />
          <div className="skeleton flex-1" style={{ height: 16 }} />
        </div>
      ))}
    </div>
  );
}

type FactsTab = 'facts' | 'stats' | 'table';

export interface MatchFactsProps {
  roomCode: string;
  matchId: string;
  homeTeam: string;
  awayTeam: string;
  groupKey?: string | null;
  isLive: boolean;
  roomEnded: boolean;
  activeFlashBet?: FlashBet | null;
  onNewEvent?: (event: MatchEventLog) => void;
  onFactsUpdate?: (facts: MatchFactsData | null) => void;
  hideTableTab?: boolean;
  forcedTab?: 'facts' | 'stats';
}

export function MatchFacts({
  roomCode,
  matchId: _matchId,
  homeTeam: _homeTeam,
  awayTeam: _awayTeam,
  groupKey,
  isLive,
  roomEnded,
  activeFlashBet,
  onNewEvent,
  onFactsUpdate,
  hideTableTab = false,
  forcedTab,
}: MatchFactsProps) {
  const [facts, setFacts] = useState<MatchFactsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(false);
  const [tab, setTab] = useState<FactsTab>('facts');
  const [standings, setStandings] = useState<StandingRow[]>([]);
  const lastEventIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (forcedTab) setTab(forcedTab);
  }, [forcedTab]);

  const statsAvailable = facts?._stats_available === true;

  const fetchFacts = useCallback(async () => {
    if (!roomCode) return;
    try {
      const data = await api.matchFacts(roomCode) as unknown as MatchFactsData;
      setFacts(data);
      setFetchError(false);
      onFactsUpdate?.(data);

      const events = data.events || [];
      if (events.length > 0) {
        const newest = [...events].sort((a, b) => b.minute - a.minute)[0];
        const key = newest.id;
        if (lastEventIdRef.current && lastEventIdRef.current !== key && onNewEvent) {
          const log: MatchEventLog = {
            type: newest.type,
            minute: newest.minute,
            home_goals: data.match.home_score,
            away_goals: data.match.away_score,
            event_key: newest.id,
          };
          onNewEvent(log);
        }
        lastEventIdRef.current = key;
      }
    } catch (err) {
      console.error('[MatchFacts] fetch error:', err);
      setFetchError(true);
    } finally {
      setLoading(false);
    }
  }, [roomCode, onFactsUpdate, onNewEvent]);

  useEffect(() => {
    if (roomEnded) return undefined;
    fetchFacts();
    const interval = setInterval(fetchFacts, isLive ? 30_000 : 60_000);
    return () => clearInterval(interval);
  }, [roomCode, isLive, roomEnded, fetchFacts]);

  useEffect(() => {
    if (tab !== 'table' || !groupKey) return;
    api.standings('WC').then((res) => {
      const rows = (res.standings as StandingRow[]) || [];
      setStandings(rows.filter((r) => (r.group || '').toUpperCase() === groupKey.toUpperCase()));
    }).catch(() => setStandings([]));
  }, [tab, groupKey]);

  const timeline = useMemo(() => {
    if (!facts?.events?.length) return [];
    const sorted = [...facts.events].sort((a, b) => b.minute - a.minute);
    const items: Array<{ kind: 'event'; event: MatchEvent } | { kind: 'divider'; label: string } | { kind: 'added'; text: string }> = [];
    const m = facts.match;
    let sawSecondHalf = false;

    for (const event of sorted) {
      if (!sawSecondHalf && event.minute > 45) {
        sawSecondHalf = true;
        const htHome = sorted.filter((e) => e.minute <= 45 && e.detail).sort((a, b) => b.minute - a.minute)[0];
        const htScore = htHome?.detail || `${m.home_score}-${m.away_score}`;
        if (['HT', '2H', 'FT', 'ET', 'PEN'].includes(m.status)) {
          items.push({ kind: 'divider', label: `HT ${htScore}` });
        }
        if (m.added_time && m.added_time > 0) {
          items.push({ kind: 'added', text: `+${m.added_time} minutes added` });
        }
      }
      items.push({ kind: 'event', event });
    }

    if (m.status === 'FT') {
      items.unshift({ kind: 'divider', label: `FT ${m.home_score}-${m.away_score}` });
    }

    return items;
  }, [facts]);

  const lastUpdatedLabel = useMemo(() => {
    if (!facts?.fetched_at) return null;
    const mins = Math.floor((Date.now() - new Date(facts.fetched_at).getTime()) / 60_000);
    if (mins < 1) return 'Just updated';
    return `Last updated ${mins} min ago`;
  }, [facts?.fetched_at]);

  const tabs: { id: FactsTab; label: string }[] = [
    { id: 'facts', label: 'Facts' },
    { id: 'stats', label: 'Stats' },
    ...(hideTableTab ? [] : [{ id: 'table' as FactsTab, label: 'Table' }]),
  ];

  if (loading && !facts) {
    return (
      <div className="surface overflow-hidden" data-testid="match-facts">
        <MatchFactsSkeleton />
      </div>
    );
  }

  const matchMinute = facts?.match?.minute ?? 0;

  return (
    <div className="surface overflow-hidden" data-testid="match-facts">
      <div className={`match-facts-tabs ${forcedTab ? 'hidden md:flex' : ''}`}>
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            className="match-facts-tab"
            data-active={tab === t.id}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {fetchError && facts && lastUpdatedLabel && (
        <p className="text-xs text-center text-[var(--text-muted)] py-1 border-b border-[var(--border)]">
          {lastUpdatedLabel}
        </p>
      )}

      {tab === 'facts' && (
        <div data-testid="match-events-panel">
          {!timeline.length ? (
            <p className="text-sm text-center text-[var(--text-muted)] py-8 px-4">
              Match events will appear here as the game unfolds ⚽
            </p>
          ) : (
            <ul className="m-0 p-0">
              {timeline.map((item, i) => {
                if (item.kind === 'divider') {
                  return (
                    <li key={`div-${i}`} className="match-divider">
                      {item.label}
                    </li>
                  );
                }
                if (item.kind === 'added') {
                  return (
                    <li key={`add-${i}`} className="added-time">
                      {item.text}
                    </li>
                  );
                }
                return (
                  <EventRow
                    key={item.event.id}
                    event={item.event}
                    activeFlashBet={activeFlashBet}
                    matchMinute={matchMinute}
                  />
                );
              })}
            </ul>
          )}
        </div>
      )}

      {tab === 'stats' && (
        <div className="py-2">
          {!statsAvailable ? (
            <p className="text-sm text-center text-[var(--text-muted)] py-8">
              Stats not available for this match yet
            </p>
          ) : facts?.stats && (
            <>
              <StatBar label="Possession" home={facts.stats.possession.home} away={facts.stats.possession.away} type="percent" />
              <StatBar label="Expected Goals" home={facts.stats.xg.home} away={facts.stats.xg.away} />
              <StatBar label="Total Shots" home={facts.stats.shots.home} away={facts.stats.shots.away} />
              <StatBar label="Shots on Target" home={facts.stats.shots_on_target.home} away={facts.stats.shots_on_target.away} />
              <StatBar label="Corners" home={facts.stats.corners.home} away={facts.stats.corners.away} />
              <StatBar label="Fouls" home={facts.stats.fouls.home} away={facts.stats.fouls.away} />
              <StatBar label="Offsides" home={facts.stats.offsides.home} away={facts.stats.offsides.away} />
            </>
          )}
        </div>
      )}

      {tab === 'table' && (
        <div className="p-2">
          {groupKey && standings.length > 0 ? (
            <GroupTableCard group={groupKey} rows={standings} compact />
          ) : (
            <p className="text-sm text-center text-[var(--text-muted)] py-8">
              Standings not available
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export { parseGroupKey };
