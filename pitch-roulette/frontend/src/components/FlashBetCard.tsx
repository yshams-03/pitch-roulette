import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { api, ApiError } from '../lib/api';
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

  const progress = useMemo(() => {
    return Math.min(1, (totalSeconds - remaining) / totalSeconds);
  }, [remaining, totalSeconds]);

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
    <div data-testid="flash-bet-card" className="ui-surface mb-4 p-4 animate-in slide-in-from-top duration-300 relative z-10">
      <div className="flex items-start justify-between gap-3 mb-3">
        <p className="text-sm font-medium text-white flex-1">{bet.question}</p>
        {open && (
          <div className="relative h-12 w-12 shrink-0">
            <svg className="h-12 w-12 -rotate-90" viewBox="0 0 36 36">
              <circle cx="18" cy="18" r="16" fill="none" stroke="#2A2A32" strokeWidth="3" />
              <circle
                cx="18" cy="18" r="16" fill="none" stroke="#22c55e" strokeWidth="3"
                strokeDasharray={`${progress * 100} 100`}
                pathLength={100}
              />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center text-sm font-mono text-pitch-green">
              {Math.max(0, remaining)}
            </span>
          </div>
        )}
      </div>

      <p className="text-xs text-pitch-muted mb-3">
        Wager: {bet.wager_amount} PC · Win {bet.wager_amount * 2} PC · +0.5 PP if correct
        {open && <span className="text-pitch-green"> · Tap Yes or No</span>}
      </p>

      {locked && !answered && !resolved && (
        <p className="text-xs text-pitch-amber mb-2">Voting closed — waiting for result…</p>
      )}

      <div className="grid gap-2">
        {options.map((opt, i) => {
          const display = blindfolded && open && !answered ? '???' : opt;
          const chosen = answered === opt;
          const correct = resolved && bet.correct_option === opt;
          const wrong = resolved && chosen && !correct;
          const canPick = open && !answered && !submitting;
          return (
            <button
              key={opt}
              type="button"
              data-testid={blindfolded && open ? `blindfold-option-${i}` : undefined}
              disabled={!canPick}
              onClick={() => pick(opt)}
              className={`min-h-11 rounded-lg px-3 text-sm font-medium transition-colors ${
                correct ? 'bg-pitch-green/20 border border-pitch-green text-pitch-green'
                  : wrong ? 'bg-red-500/20 border border-red-500 text-red-300'
                  : chosen ? 'bg-pitch-green text-pitch-black'
                  : canPick
                    ? 'bg-pitch-card border-2 border-pitch-green text-white hover:bg-pitch-green/10 cursor-pointer'
                    : 'bg-pitch-card border border-pitch-border text-pitch-muted'
              }`}
            >
              {display}
              {(locked || resolved) && results[opt] != null && (
                <span className="ml-2 text-xs text-pitch-muted">({results[opt]})</span>
              )}
            </button>
          );
        })}
      </div>

      {answered && !resolved && (
        <p className="mt-3 text-center text-sm text-pitch-green">Your pick: {answered}</p>
      )}

      {resolved && myAnswer?.pp_change != null && myAnswer.pp_change !== 0 && (
        <p className={`mt-3 text-center text-sm font-bold ${myAnswer.pp_change > 0 ? 'text-pitch-green' : 'text-red-400'}`}>
          {myAnswer.pp_change > 0 ? `+${myAnswer.pp_change} PP 🎉` : `${myAnswer.pp_change} PP`}
        </p>
      )}
    </div>
  );
}
