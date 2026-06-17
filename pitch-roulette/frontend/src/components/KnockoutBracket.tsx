import { useMemo, useState } from 'react';
import { formatKickoff } from '../lib/api';
import { TeamCrest } from './TeamCrest';
import type { MatchSummary } from '../../../shared/types';

const ROUNDS = [
  { key: 'LAST_32', label: 'Round of 32' },
  { key: 'LAST_16', label: 'Round of 16' },
  { key: 'QUARTER_FINALS', label: 'Quarter-finals' },
  { key: 'SEMI_FINALS', label: 'Semi-finals' },
  { key: 'FINAL', label: 'Final' },
] as const;

function stageKey(stage: string | null | undefined): string | null {
  if (!stage) return null;
  const s = stage.toUpperCase();
  if (s.includes('LAST_32') || s.includes('ROUND_OF_32')) return 'LAST_32';
  if (s.includes('LAST_16') || s.includes('ROUND_OF_16')) return 'LAST_16';
  if (s.includes('QUARTER')) return 'QUARTER_FINALS';
  if (s.includes('SEMI')) return 'SEMI_FINALS';
  if (s === 'FINAL' || s.includes('FINAL')) return 'FINAL';
  return s;
}

function MatchSlot({
  match,
  onSelect,
}: {
  match: MatchSummary;
  onSelect: (m: MatchSummary) => void;
}) {
  const home = match.home_team || 'TBD';
  const away = match.away_team || 'TBD';
  const finished = match.status === 'FINISHED';
  const homeWins = finished && match.home_goals > match.away_goals;
  const awayWins = finished && match.away_goals > match.home_goals;

  return (
    <button
      type="button"
      onClick={() => onSelect(match)}
      className="ui-surface w-44 shrink-0 p-2 text-left hover:border-pitch-green/50 transition-colors"
    >
      <div className={`flex items-center gap-2 mb-1 ${homeWins ? 'text-pitch-green' : 'text-white'}`}>
        <TeamCrest name={home} logo={match.home_logo} size={18} />
        <span className="text-xs truncate flex-1">{home}</span>
        {finished && <span className="text-xs font-mono">{match.home_goals}</span>}
      </div>
      <div className={`flex items-center gap-2 ${awayWins ? 'text-pitch-green' : 'text-white'}`}>
        <TeamCrest name={away} logo={match.away_logo} size={18} />
        <span className="text-xs truncate flex-1">{away}</span>
        {finished && <span className="text-xs font-mono">{match.away_goals}</span>}
      </div>
      {match.is_live && (
        <span className="text-[10px] text-red-400 mt-1 inline-block animate-pulse">LIVE 🔴</span>
      )}
      {!match.is_live && !finished && match.kickoff && (
        <span className="text-[10px] text-pitch-muted mt-1 block">{formatKickoff(match.kickoff)}</span>
      )}
    </button>
  );
}

interface Props {
  matches: MatchSummary[];
  onCreateRoom?: (matchId: string) => void;
}

export function KnockoutBracket({ matches, onCreateRoom }: Props) {
  const [selected, setSelected] = useState<MatchSummary | null>(null);

  const byRound = useMemo(() => {
    const map: Record<string, MatchSummary[]> = {};
    for (const r of ROUNDS) map[r.key] = [];
    for (const m of matches) {
      const key = stageKey(m.stage);
      if (key && map[key]) {
        map[key].push(m);
      }
    }
    for (const key of Object.keys(map)) {
      map[key].sort((a, b) => new Date(a.kickoff).getTime() - new Date(b.kickoff).getTime());
    }
    return map;
  }, [matches]);

  const hasKnockout = ROUNDS.some((r) => (byRound[r.key]?.length ?? 0) > 0);

  if (!hasKnockout) {
    return <p className="py-8 text-center text-sm text-pitch-muted">No knockout fixtures yet</p>;
  }

  return (
    <>
      <div className="overflow-x-auto pb-4 -mx-4 px-4">
        <div className="flex gap-6 min-w-max">
          {ROUNDS.map((round) => {
            const slots = byRound[round.key] || [];
            if (!slots.length) return null;
            return (
              <div key={round.key} className="flex flex-col gap-3">
                <h3 className="text-xs text-pitch-muted uppercase tracking-wide text-center sticky top-0">
                  {round.label}
                </h3>
                <div className="flex flex-col gap-4 justify-around flex-1">
                  {slots.map((m) => (
                    <MatchSlot key={m.id} match={m} onSelect={setSelected} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {selected && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-4" onClick={() => setSelected(null)}>
          <div className="ui-surface w-full max-w-sm p-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-white font-medium mb-2">
              {selected.home_team || 'TBD'} vs {selected.away_team || 'TBD'}
            </h3>
            {selected.is_live ? (
              <p className="text-2xl font-mono text-pitch-green mb-4">
                {selected.home_goals} – {selected.away_goals}
              </p>
            ) : selected.status === 'FINISHED' ? (
              <p className="text-lg font-mono text-pitch-muted mb-4">
                Final: {selected.home_goals} – {selected.away_goals}
              </p>
            ) : (
              <p className="text-sm text-pitch-muted mb-4">{formatKickoff(selected.kickoff)}</p>
            )}
            {selected.is_live && onCreateRoom && (
              <button type="button" onClick={() => onCreateRoom(selected.id)} className="ui-btn ui-btn-primary w-full">
                Create room
              </button>
            )}
            <button type="button" onClick={() => setSelected(null)} className="ui-btn w-full mt-2">
              Close
            </button>
          </div>
        </div>
      )}
    </>
  );
}
