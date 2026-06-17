import type { StandingRow } from '../../../shared/types';
import { TeamCrest } from './TeamCrest';
import { formatGoalDiff, goalsForAgainst } from '../lib/format';

function qualBarClass(rank: number) {
  if (rank <= 2) return 'bg-pitch-green';
  if (rank === 3) return 'bg-pitch-amber';
  return 'bg-transparent';
}

function StatHeader({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <span className={`text-[10px] text-pitch-muted text-center w-5 ${className}`}>{children}</span>;
}

function StatCell({ children, bold = false }: { children: React.ReactNode; bold?: boolean }) {
  return (
    <span className={`text-[11px] text-center w-5 tabular-nums ${bold ? 'font-medium text-white' : 'text-pitch-muted'}`}>
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
    <div className="ui-surface overflow-hidden">
      <div className="flex items-center justify-between border-b border-pitch-border px-3 py-2">
        <h3 className="text-sm font-medium text-white">Grp. {group}</h3>
        <div className="flex items-center gap-0.5">
          <StatHeader>Pl</StatHeader>
          {!compact && (
            <>
              <StatHeader>W</StatHeader>
              <StatHeader>D</StatHeader>
              <StatHeader>L</StatHeader>
              <StatHeader className="w-7">+/-</StatHeader>
            </>
          )}
          <StatHeader>GD</StatHeader>
          <StatHeader className="w-6">Pts</StatHeader>
        </div>
      </div>

      <div>
        {rows.map((r) => (
          <div key={r.team} className="flex items-center min-h-[40px] border-t border-pitch-border first:border-t-0">
            <div className={`w-0.5 self-stretch shrink-0 ${qualBarClass(r.rank)}`} />
            <div className="flex items-center flex-1 min-w-0 gap-2 pl-2 pr-1 py-1.5">
              <span className="text-[11px] text-pitch-muted w-3 shrink-0 tabular-nums">{r.rank}</span>
              <TeamCrest name={r.team} logo={r.team_logo} size={18} />
              <span className="text-[13px] text-white truncate flex-1">{r.team}</span>
            </div>
            <div className="flex items-center gap-0.5 pr-3 shrink-0">
              <StatCell>{r.played}</StatCell>
              {!compact && (
                <>
                  <StatCell>{r.won}</StatCell>
                  <StatCell>{r.draw}</StatCell>
                  <StatCell>{r.lost}</StatCell>
                  <span className="text-[11px] text-pitch-muted text-center w-7 tabular-nums">
                    {goalsForAgainst(r.goals_for, r.goals_against)}
                  </span>
                </>
              )}
              <StatCell>{formatGoalDiff(r.goal_diff)}</StatCell>
              <StatCell bold>{r.points}</StatCell>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
