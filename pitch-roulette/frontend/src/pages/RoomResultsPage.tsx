import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { api } from '../lib/api';
import { Avatar } from '../components/Avatar';
import { Card } from '../components/ui/Card';
import { Tabs } from '../components/ui/Tabs';
import { PPBreakdownCard } from '../components/PPBreakdownCard';
import type { Prediction, RoomPlayer } from '../../../shared/types';

const RESULT_TABS = [
  { id: 'pp' as const, label: '🎯 Skill Board (PP)' },
  { id: 'pc' as const, label: '🎲 Party Board (PC)' },
  { id: 'draft' as const, label: '⚽ Draft Performance' },
];

const MEDALS = ['🥇', '🥈', '🥉'];

interface DraftPickRow {
  id: string;
  display_name?: string;
  player_name?: string;
  player_team?: string;
  position?: string;
  pc_earned?: number;
  pick_order?: number;
}

export function RoomResultsPage() {
  const { code } = useParams<{ code: string }>();
  const [leaderboard, setLeaderboard] = useState<Prediction[]>([]);
  const [partyBoard, setPartyBoard] = useState<RoomPlayer[]>([]);
  const [draftPicks, setDraftPicks] = useState<DraftPickRow[]>([]);
  const [actual, setActual] = useState<{ home: number; away: number } | null>(null);
  const [tab, setTab] = useState<'pp' | 'pc' | 'draft'>('pp');

  useEffect(() => {
    if (!code) return;
    api.roomResults(code).then((r) => {
      setLeaderboard((r.leaderboard as unknown as Prediction[]) || []);
      setPartyBoard((r.party_leaderboard as unknown as RoomPlayer[]) || []);
      setDraftPicks((r.draft_picks as unknown as DraftPickRow[]) || []);
      setActual(r.actual_score);
    });
  }, [code]);

  const winner = leaderboard[0];

  return (
    <div className="px-4 py-6 max-w-lg mx-auto">
      {winner && (
        <motion.div
          className="relative surface p-6 mb-6 text-center overflow-hidden confetti-burst"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: 'spring', stiffness: 200, damping: 20 }}
        >
          <p className="text-3xl mb-2">👑</p>
          <Avatar name={winner.display_name || '?'} color={winner.avatar_color} size="xl" />
          <p className="text-[var(--pr-gold)] font-bold text-xl mt-3">Winner!</p>
          <p className="text-sm text-[var(--text-secondary)]">{winner.display_name}</p>
        </motion.div>
      )}

      <h1 data-testid="results-heading" className="text-xl font-bold mb-2">Match results</h1>
      {actual && (
        <p className="score text-2xl text-[var(--pr-green)] mb-6 text-center">
          Final: {actual.home} – {actual.away}
        </p>
      )}

      <Tabs tabs={RESULT_TABS} active={tab} onChange={setTab} className="mb-4" />

      {tab === 'pp' ? (
        <div className="space-y-2">
          {leaderboard.map((p, i) => (
            <Card key={p.id} className="flex items-center gap-3 p-3" lift={false}>
              <span className="w-6">{i < 3 ? MEDALS[i] : (p as Prediction & { rank?: number }).rank}</span>
              <Avatar name={p.display_name || '?'} color={p.avatar_color} />
              <div className="flex-1 min-w-0">
                <Link to={`/profile/${p.username}`} className="font-medium no-underline">{p.display_name}</Link>
                <p className="text-sm text-[var(--text-muted)]">Predicted {p.home_goals}–{p.away_goals}</p>
                {p.pp_breakdown && actual && (
                  <PPBreakdownCard
                    breakdown={p.pp_breakdown}
                    predicted={`${p.home_goals}-${p.away_goals}`}
                    actual={`${actual.home}-${actual.away}`}
                  />
                )}
              </div>
              <span className="font-bold text-[var(--pr-green)] shrink-0">+{p.points_earned} PP</span>
            </Card>
          ))}
        </div>
      ) : tab === 'pc' ? (
        <div className="space-y-2">
          {partyBoard.map((p, i) => (
            <Card key={p.user_id} className="flex items-center gap-3 p-3" lift={false}>
              <span className="w-6">{i < 3 ? MEDALS[i] : (p as RoomPlayer & { party_rank?: number }).party_rank}</span>
              <Avatar name={p.display_name || '?'} color={p.avatar_color} />
              <span className="flex-1 font-medium">{p.display_name}</span>
              <span className="font-bold text-[var(--pr-gold)]">🪙 {Math.round(p.session_pc ?? 0)}</span>
            </Card>
          ))}
        </div>
      ) : (
        <div className="space-y-2" data-testid="draft-performance">
          {draftPicks.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)] text-center py-4">No draft picks in this room</p>
          ) : (
            draftPicks.map((pick) => (
              <Card key={pick.id} className="flex items-center gap-3 p-3" lift={false}>
                <span className="text-xs text-[var(--text-muted)] w-6">#{pick.pick_order}</span>
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{pick.player_name}</p>
                  <p className="text-xs text-[var(--text-muted)]">
                    {pick.display_name} · {pick.position} · {pick.player_team}
                  </p>
                </div>
                <span className={`font-bold ${(pick.pc_earned ?? 0) >= 0 ? 'text-[var(--pr-green)]' : 'text-red-400'}`}>
                  {(pick.pc_earned ?? 0) >= 0 ? '+' : ''}{Math.round(pick.pc_earned ?? 0)} PC
                </span>
              </Card>
            ))
          )}
        </div>
      )}

      <Link to="/" className="btn btn-secondary w-full no-underline text-center mt-8 block">
        Back to Schedule
      </Link>
    </div>
  );
}
