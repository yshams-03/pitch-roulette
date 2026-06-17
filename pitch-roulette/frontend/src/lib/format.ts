import type { MatchSummary } from '../../../shared/types';

function parseKickoff(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatMatchTime(iso: string) {
  const d = parseKickoff(iso);
  if (!d) return '—';
  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  }).format(d);
}

export function formatDateHeader(iso: string) {
  const d = parseKickoff(iso);
  if (!d) return 'Unknown date';

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const matchDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffDays = Math.round((matchDay.getTime() - today.getTime()) / 86_400_000);

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Tomorrow';
  if (diffDays === -1) return 'Yesterday';

  return new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  }).format(d);
}

/** Stable sortable key in local calendar day (YYYY-MM-DD). */
export function dateKey(iso: string) {
  const d = parseKickoff(iso);
  if (!d) return 'unknown';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function isFinishedMatch(match: MatchSummary) {
  return match.status === 'FINISHED'
    || match.status === 'AWARDED'
    || match.status_label === 'Full time';
}

export function isUpcomingMatch(match: MatchSummary) {
  if (match.is_live || isFinishedMatch(match)) return false;
  return true;
}

export function groupMatchesByDate(
  matches: MatchSummary[],
  { descending = false }: { descending?: boolean } = {},
): { label: string; key: string; sortTs: number; matches: MatchSummary[] }[] {
  const map = new Map<string, { label: string; sortTs: number; matches: MatchSummary[] }>();

  for (const m of matches) {
    const kickoff = m.kickoff || '';
    const key = dateKey(kickoff);
    const ts = parseKickoff(kickoff)?.getTime() ?? 0;
    if (!map.has(key)) {
      map.set(key, { label: formatDateHeader(kickoff), sortTs: ts, matches: [] });
    }
    map.get(key)!.matches.push(m);
  }

  return [...map.entries()]
    .map(([key, { label, sortTs, matches: dayMatches }]) => ({
      key,
      label,
      sortTs,
      matches: dayMatches.sort((a, b) => new Date(a.kickoff).getTime() - new Date(b.kickoff).getTime()),
    }))
    .sort((a, b) => (descending ? b.sortTs - a.sortTs : a.sortTs - b.sortTs));
}

export function goalsForAgainst(forGoals: number, againstGoals: number) {
  return `${forGoals}-${againstGoals}`;
}

export function formatGoalDiff(gd: number) {
  if (gd > 0) return `+${gd}`;
  return String(gd);
}
