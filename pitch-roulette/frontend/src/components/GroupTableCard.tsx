import type { StandingRow } from '../../../shared/types';
import { TeamCrest } from './TeamCrest';
import { formatGoalDiff, goalsForAgainst } from '../lib/format';

function rowAccent(rank: number) {
  if (rank <= 2) return 'table-row-qualified';
  if (rank === 3) return 'table-row-playoff';
  return '';
}

function StatHeader({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <span className={`text-[10px] text-[var(--text-muted)] text-center w-5 ${className}`}>{children}</span>;
}

function StatCell({ children, bold = false, muted = false }: { children: React.ReactNode; bold?: boolean; muted?: boolean }) {
  return (
    <span className={`text-[11px] text-center w-5 tabular-nums ${
      bold ? 'font-bold text-[var(--text-primary)]' : muted ? 'text-[var(--text-muted)]' : 'text-[var(--text-secondary)]'
    }`}>
      {children}
    </span>
  );
}

export function GroupTableCard({
  group,
  rows,
  compact = false,
}: {
  group: string;
  rows: StandingRow[];
  compact?: boolean;
}) {
  return (
    <div className="surface overflow-hidden">
      <div className="flex items-center justify-between border-b border-[var(--border)] px-3 py-2">
        <h3 className="text-sm font-semibold">Group {group}</h3>
        <div className="flex items-center gap-0.5">
          <StatHeader>MP</StatHeader>
          {!compact && (
            <>
              <StatHeader>W</StatHeader>
              <StatHeader>D</StatHeader>
              <StatHeader>L</StatHeader>
              <StatHeader className="w-7">GF/GA</StatHeader>
            </>
          )}
          <StatHeader>GD</StatHeader>
          <StatHeader className="w-6">Pts</StatHeader>
        </div>
      </div>

      <div>
        {rows.map((r) => (
          <div
            key={r.team}
            className={`flex items-center min-h-[44px] border-t border-[var(--border)] first:border-t-0 ${rowAccent(r.rank)}`}
          >
            <div className="flex items-center flex-1 min-w-0 gap-2 pl-3 pr-1 py-1.5">
              <span className="text-[11px] text-[var(--text-muted)] w-4 shrink-0 tabular-nums">{r.rank}</span>
              <TeamCrest name={r.team} logo={r.team_logo} size="xs" />
              <span className={`text-[13px] truncate flex-1 ${r.rank > 3 ? 'text-[var(--text-muted)]' : 'font-medium'}`}>
                {r.team}
              </span>
            </div>
            <div className="flex items-center gap-0.5 pr-3 shrink-0">
              <StatCell muted={r.rank > 3}>{r.played}</StatCell>
              {!compact && (
                <>
                  <StatCell muted={r.rank > 3}>{r.won}</StatCell>
                  <StatCell muted={r.rank > 3}>{r.draw}</StatCell>
                  <StatCell muted={r.rank > 3}>{r.lost}</StatCell>
                  <span className="text-[11px] text-[var(--text-muted)] text-center w-7 tabular-nums">
                    {goalsForAgainst(r.goals_for, r.goals_against)}
                  </span>
                </>
              )}
              <StatCell muted={r.rank > 3}>{formatGoalDiff(r.goal_diff)}</StatCell>
              <StatCell bold={r.rank <= 3} muted={r.rank > 3}>{r.points}</StatCell>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
