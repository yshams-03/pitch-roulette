import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { api, ApiError } from '../lib/api';
import { CountdownRing } from './ui/CountdownRing';
import { Button } from './ui/Button';
import type { FlashBet, FlashBetAnswer } from '../../../shared/types';

function parseOptions(options: FlashBet['options']): string[] {
  if (Array.isArray(options)) return options.map(String);
  return ['Yes', 'No'];
}

function secondsLeft(locksAt: string | null): number {
  if (!locksAt) return 0;
  const end = new Date(locksAt).getTime();
  if (Number.isNaN(end)) return 0;
  return Math.ceil((end - Date.now()) / 1000);
}

function windowSeconds(bet: FlashBet): number {
  if (bet.opens_at && bet.locks_at) {
    const open = new Date(bet.opens_at).getTime();
    const lock = new Date(bet.locks_at).getTime();
    if (!Number.isNaN(open) && !Number.isNaN(lock) && lock > open) {
      return Math.ceil((lock - open) / 1000);
    }
  }
  return 30;
}

const ANSWER_GRACE_UI = 5;

const flashBetVariants = {
  initial: { opacity: 0, y: -40, scale: 0.95 },
  animate: { opacity: 1, y: 0, scale: 1, transition: { type: 'spring' as const, stiffness: 300, damping: 25 } },
  exit: { opacity: 0, y: -20, scale: 0.95 },
};

interface Props {
  bet: FlashBet;
  code: string;
  token: string;
  myAnswer?: FlashBetAnswer;
  onAnswered: () => void;
  blindfolded?: boolean;
}

export function FlashBetCard({ bet, code, token, myAnswer, onAnswered, blindfolded }: Props) {
  const options = useMemo(() => parseOptions(bet.options), [bet.options]);
  const totalSeconds = useMemo(() => windowSeconds(bet), [bet]);
  const [remaining, setRemaining] = useState(() => secondsLeft(bet.locks_at));
  const [results, setResults] = useState<Record<string, number>>({});
  const [submitting, setSubmitting] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);

  const answered = myAnswer?.chosen_option || picked;
  const resolved = bet.state === 'RESOLVED';
  const open = (bet.state === 'OPEN' || bet.state === 'LOCKED') && !resolved
    && remaining > -ANSWER_GRACE_UI && !answered;
  const locked = !open && !resolved && (bet.state === 'LOCKED' || remaining <= 0);

  useEffect(() => {
    setPicked(null);
    setRemaining(secondsLeft(bet.locks_at));
  }, [bet.id, bet.locks_at]);

  useEffect(() => {
    const tick = () => setRemaining(secondsLeft(bet.locks_at));
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [bet.locks_at]);

  useEffect(() => {
    if (bet.state !== 'LOCKED' && bet.state !== 'RESOLVED') return;
    api.flashBetResults(code, bet.id).then((r) => {
      const counts: Record<string, number> = {};
      for (const opt of options) counts[opt] = 0;
      for (const a of (r.answers as FlashBetAnswer[]) || []) {
        counts[a.chosen_option] = (counts[a.chosen_option] || 0) + 1;
      }
      setResults(counts);
    }).catch(() => {});
  }, [bet.state, bet.id, options, code]);

  const totalVotes = Object.values(results).reduce((a, b) => a + b, 0);

  const pick = async (opt: string) => {
    if (!open || answered || submitting) return;
    setPicked(opt);
    setSubmitting(true);
    try {
      await api.answerFlashBet(token, code, bet.id, opt);
      toast.success(`Locked in: ${opt}`);
      onAnswered();
    } catch (e) {
      setPicked(null);
      const msg = e instanceof ApiError
        ? ({
            bet_locked: 'Too late — voting closed',
            bet_not_open: 'This bet is no longer open',
            already_answered: 'You already answered',
            insufficient_pc: 'Not enough Pitch Chips for this wager',
          }[String(e.data.error)] || e.message)
        : e instanceof Error ? e.message : 'Could not submit';
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <motion.div
      data-testid="flash-bet-card"
      className="surface-elevated mb-4 p-5 relative z-10 border border-[rgba(213,0,249,0.3)]"
      style={{ boxShadow: '0 0 24px rgba(213,0,249,0.15)' }}
      variants={flashBetVariants}
      initial="initial"
      animate="animate"
      exit="exit"
    >
      <div className="flex items-start justify-between gap-3 mb-4">
        <p className="text-lg font-bold text-center flex-1">{bet.question}</p>
        {open && (
          <CountdownRing seconds={Math.max(0, remaining)} total={totalSeconds} size={60} />
        )}
      </div>

      <p className="text-xs text-[var(--text-secondary)] mb-4 text-center">
        Wager: {bet.wager_amount} PC · Win {bet.wager_amount * 2} PC · +0.5 PP if correct
        {open && <span className="text-[var(--pr-green)]"> · Tap to answer</span>}
      </p>

      {locked && !answered && !resolved && (
        <p className="text-xs text-[var(--pr-gold)] mb-2 text-center">Voting closed — waiting for result…</p>
      )}

      <div className="grid gap-2">
        {options.map((opt, i) => {
          const display = blindfolded && open && !answered ? '???' : opt;
          const chosen = answered === opt;
          const correct = resolved && bet.correct_option === opt;
          const wrong = resolved && chosen && !correct;
          const canPick = open && !answered && !submitting;
          const voteCount = results[opt] ?? 0;
          const pct = totalVotes > 0 ? Math.round((voteCount / totalVotes) * 100) : 0;

          return (
            <div key={opt} className="relative">
              {(locked || resolved) && totalVotes > 0 && (
                <div
                  className="absolute inset-0 rounded-[var(--radius-md)] bg-[var(--pr-purple)] opacity-10"
                  style={{ width: `${pct}%` }}
                />
              )}
              <Button
                variant={chosen && !resolved ? 'primary' : 'secondary'}
                size="lg"
                fullWidth
                data-testid={blindfolded && open ? `blindfold-option-${i}` : undefined}
                disabled={!canPick}
                onClick={() => pick(opt)}
                className={`relative z-10 ${
                  correct ? 'border-[var(--pr-green)] !bg-[rgba(0,230,118,0.15)] !text-[var(--pr-green)]'
                    : wrong ? 'flash-wrong !border-[var(--pr-red)] !text-[var(--pr-red)]'
                    : ''
                } ${blindfolded && open && !answered ? 'blur-sm' : ''}`}
              >
                {display}
                {(locked || resolved) && results[opt] != null && (
                  <span className="ml-2 text-xs opacity-70">({results[opt]}{totalVotes > 0 ? ` · ${pct}%` : ''})</span>
                )}
              </Button>
            </div>
          );
        })}
      </div>

      {answered && !resolved && (
        <p className="mt-3 text-center text-sm text-[var(--pr-green)] font-semibold">Your pick: {answered}</p>
      )}

      {resolved && myAnswer?.pp_change != null && myAnswer.pp_change !== 0 && (
        <p className={`mt-3 text-center text-sm font-bold ${myAnswer.pp_change > 0 ? 'text-[var(--pr-green)]' : 'text-[var(--pr-red)]'}`}>
          {myAnswer.pp_change > 0 ? `+${myAnswer.pp_change} PP 🎉` : `${myAnswer.pp_change} PP`}
        </p>
      )}
    </motion.div>
  );
}
