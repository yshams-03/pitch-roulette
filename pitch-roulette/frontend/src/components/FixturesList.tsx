import type { MatchSummary } from '../../../shared/types';
import { formatMatchTime, groupMatchesByDate, isFinishedMatch, isUpcomingMatch } from '../lib/format';
import { TeamCrest } from './TeamCrest';

function MatchCenter({
  match,
  onCreateRoom,
}: {
  match: MatchSummary;
  onCreateRoom?: (id: string) => void;
}) {
  if (match.is_live) {
    return (
      <button
        type="button"
        onClick={() => onCreateRoom?.(match.id)}
        className="flex flex-col items-center justify-center shrink-0 w-[4.5rem] text-center"
      >
        <span className="text-[11px] text-pitch-red tabular-nums">
          {match.minute != null ? `${match.minute}'` : 'Live'}
        </span>
        <span className="text-sm font-medium text-white tabular-nums">
          {match.home_goals} - {match.away_goals}
        </span>
      </button>
    );
  }

  if (isFinishedMatch(match)) {
    return (
      <div className="flex flex-col items-center justify-center shrink-0 w-[4.5rem] text-center">
        <span className="text-sm font-medium text-white tabular-nums">
          {match.home_goals} - {match.away_goals}
        </span>
        <span className="text-[11px] text-pitch-muted">FT</span>
      </div>
    );
  }

  return (
    <span className="text-[13px] text-white shrink-0 w-[4.5rem] text-center tabular-nums">
      {formatMatchTime(match.kickoff)}
    </span>
  );
}

function FixtureRow({
  match,
  onCreateRoom,
}: {
  match: MatchSummary;
  onCreateRoom?: (id: string) => void;
}) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_4.5rem_minmax(0,1fr)] items-center gap-1 px-3 min-h-[44px] py-2 border-t border-pitch-border first:border-t-0">
      <div className="flex items-center justify-end gap-1.5 min-w-0">
        <span className="text-[13px] text-white truncate text-right min-w-0">{match.home_team || 'TBD'}</span>
        <TeamCrest name={match.home_team} logo={match.home_logo} size={18} />
      </div>
      <MatchCenter match={match} onCreateRoom={onCreateRoom} />
      <div className="flex items-center gap-1.5 min-w-0">
        <TeamCrest name={match.away_team} logo={match.away_logo} size={18} />
        <span className="text-[13px] text-white truncate min-w-0">{match.away_team || 'TBD'}</span>
      </div>
    </div>
  );
}

function DateCard({
  label,
  matches,
  onCreateRoom,
}: {
  label: string;
  matches: MatchSummary[];
  onCreateRoom?: (id: string) => void;
}) {
  if (matches.length === 0) return null;
  return (
    <div className="ui-surface overflow-hidden">
      <div className="border-b border-pitch-border px-3 py-2 text-sm font-medium text-white">{label}</div>
      {matches.map((m) => (
        <FixtureRow key={m.id} match={m} onCreateRoom={onCreateRoom} />
      ))}
    </div>
  );
}

export function FixturesList({
  matches,
  onCreateRoom,
}: {
  matches: MatchSummary[];
  onCreateRoom?: (id: string) => void;
}) {
  const live = matches.filter((m) => m.is_live);
  const upcoming = matches.filter((m) => isUpcomingMatch(m));
  const finished = matches.filter((m) => isFinishedMatch(m) && !m.is_live);

  const upcomingByDate = groupMatchesByDate(upcoming, { descending: false });
  const finishedByDate = groupMatchesByDate(finished, { descending: true });

  if (matches.length === 0) {
    return <p className="py-8 text-center text-sm text-pitch-muted">No fixtures</p>;
  }

  return (
    <div className="space-y-3 pb-2">
      {live.length > 0 && (
        <DateCard label="Live" matches={live} onCreateRoom={onCreateRoom} />
      )}

      {upcomingByDate.map(({ key, label, matches: dayMatches }) => (
        <DateCard key={`up-${key}`} label={label} matches={dayMatches} onCreateRoom={onCreateRoom} />
      ))}

      {finishedByDate.length > 0 && (
        <>
          <p className="px-1 pt-2 text-sm text-pitch-muted">Results</p>
          {finishedByDate.map(({ key, label, matches: dayMatches }) => (
            <DateCard key={`ft-${key}`} label={label} matches={dayMatches} />
          ))}
        </>
      )}
    </div>
  );
}
