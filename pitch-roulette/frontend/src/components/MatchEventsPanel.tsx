import { useEffect, useRef } from 'react';
import type { MatchEventLog } from '../../../shared/types';

function buildLabels(homeTeam: string, awayTeam: string): Record<string, string> {
  return {
    GOAL_HOME: `⚽ Goal — ${homeTeam}`,
    GOAL_AWAY: `⚽ Goal — ${awayTeam}`,
    YELLOW_CARD: '🟨 Yellow card',
    RED_CARD: '🟥 Red card',
    PENALTY_SCORED: '✅ Penalty scored',
    PENALTY_MISSED: '❌ Penalty missed',
    GOAL: '⚽ Goal',
  };
}

export function eventLabel(type: string, homeTeam = 'Home', awayTeam = 'Away') {
  return buildLabels(homeTeam, awayTeam)[type] || type.replace(/_/g, ' ');
}

interface Props {
  events: MatchEventLog[];
  homeTeam?: string;
  awayTeam?: string;
  onNewEvent?: (event: MatchEventLog) => void;
}

export function MatchEventsPanel({ events, homeTeam = 'Home', awayTeam = 'Away', onNewEvent }: Props) {
  const listRef = useRef<HTMLUListElement>(null);
  const lastKeyRef = useRef<string | null>(null);
  const labels = buildLabels(homeTeam, awayTeam);

  useEffect(() => {
    if (!events.length) return;
    const last = events[events.length - 1];
    const key = last.event_key || `${last.type}-${last.minute}`;
    if (lastKeyRef.current && lastKeyRef.current !== key) {
      onNewEvent?.(last);
      listRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    }
    lastKeyRef.current = key;
  }, [events, onNewEvent]);

  return (
    <div data-testid="match-events-panel" className="ui-surface p-3 mb-4">
      <h2 className="text-xs text-pitch-muted mb-2 uppercase tracking-wide">Match events</h2>
      {events.length === 0 ? (
        <p className="text-sm text-pitch-muted">Waiting for first event…</p>
      ) : (
        <ul ref={listRef} className="space-y-1.5 max-h-36 overflow-y-auto scroll-smooth">
          {[...events].reverse().map((e, i) => (
            <li key={e.event_key || `${e.type}-${e.minute}-${i}`} className="text-sm flex gap-2">
              <span className="font-mono text-pitch-green shrink-0">{e.minute}&apos;</span>
              <span className="text-white">{labels[e.type] || e.type.replace(/_/g, ' ')}</span>
              <span className="text-pitch-muted ml-auto font-mono text-xs">
                {e.home_goals}–{e.away_goals}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
