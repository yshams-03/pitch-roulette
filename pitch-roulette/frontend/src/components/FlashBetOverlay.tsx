import { useEffect, useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import * as Slider from '@radix-ui/react-slider';
import toast from 'react-hot-toast';
import { api, ApiError } from '../lib/api';
import { useGameStore } from '../store/gameStore';
import { useFocusTrap } from '../hooks/useFocusTrap';
import type { FlashBet } from '../../../shared/types';

interface Props {
  bet: FlashBet;
  onDismiss: () => void;
}

export function FlashBetOverlay({ bet, onDismiss }: Props) {
  const { sessionToken, underdogTeam, myTeam, underdogMultiplier, activeSabotages, myBalance } = useGameStore();
  const trapRef = useFocusTrap(true, onDismiss);
  const maxWager = Math.min(500, Math.max(10, Math.floor(myBalance / 50) * 50));
  const [amount, setAmount] = useState(Math.min(50, maxWager));
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [timeLeft, setTimeLeft] = useState(0);
  const [frozenLeft, setFrozenLeft] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [inlineError, setInlineError] = useState('');

  const hasMirror = activeSabotages.some((s) => s.token_type === 'MIRROR');

  useEffect(() => {
    setAmount((a) => Math.min(a, maxWager));
  }, [maxWager]);

  useEffect(() => {
    const tick = () => {
      const now = Date.now();
      const frozenUntil = new Date(bet.frozen_until).getTime();
      const closesAt = new Date(bet.closes_at).getTime();
      setFrozenLeft(Math.max(0, Math.ceil((frozenUntil - now) / 1000)));
      setTimeLeft(Math.max(0, Math.ceil((closesAt - now) / 1000)));

      if (bet.state === 'CLOSED' || (bet.state === 'OPEN' && now >= closesAt)) {
        toast.error('Too slow! Bet closed.');
        onDismiss();
      }
    };
    tick();
    const interval = setInterval(tick, 200);
    return () => clearInterval(interval);
  }, [bet, onDismiss]);

  const options = useMemo(() => {
    const entries = Object.entries(bet.options);
    if (hasMirror && entries.length === 2) {
      return entries.reverse();
    }
    return entries;
  }, [bet.options, hasMirror]);

  const isFrozen = bet.state === 'FROZEN' || frozenLeft > 0;
  const isOpen = bet.state === 'OPEN' && frozenLeft === 0;

  const selectedMultiplier = selectedOption
    ? bet.options[selectedOption]?.multiplier || 1.5
    : 1.5;

  let payoutMultiplier = selectedMultiplier;
  if (underdogTeam && myTeam === underdogTeam) {
    payoutMultiplier *= underdogMultiplier;
  }

  const potentialPayout = Math.floor(amount * payoutMultiplier);

  const handleConfirm = async () => {
    if (!sessionToken || !selectedOption || !isOpen) return;
    setSubmitting(true);
    setInlineError('');
    try {
      const result = await api.placeWager(sessionToken, bet.id, selectedOption, amount);
      const label = result.option_label || bet.options[selectedOption]?.label || selectedOption;
      toast.success(`Wager placed — ${amount} PC on ${label}`);
      onDismiss();
    } catch (e) {
      if (e instanceof ApiError) {
        if (e.data.error === 'insufficient_balance') {
          setInlineError('Not enough PC for this wager');
        } else if (e.data.error === 'bet_closed') {
          toast.error('Too slow! Bet closed.');
          onDismiss();
        } else {
          setInlineError((e.data.error as string) || 'Wager failed');
        }
      }
    } finally {
      setSubmitting(false);
    }
  };

  const totalDuration = 12;
  const ringProgress = isFrozen ? 0 : ((totalDuration - timeLeft) / totalDuration) * 100;

  const ringUrgent = !isFrozen && timeLeft <= 5;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-40 bg-pitch-black/70"
        aria-hidden
        onClick={onDismiss}
      />
      <motion.div
        ref={trapRef}
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        className="fixed inset-x-0 bottom-0 z-50 animate-overlay-slam rounded-t-2xl border-t border-pitch-green/30 bg-pitch-card p-4 shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-label="Flash bet"
      >
        <div className="mb-3 flex items-start justify-between">
          <div>
            <p className="text-xs uppercase tracking-wider text-pitch-green">Flash Bet</p>
            <h3 className="text-lg font-bold text-white">{bet.event_label}</h3>
          </div>
          <div className={`relative flex h-14 w-14 items-center justify-center ${ringUrgent ? 'animate-pulse-ring' : ''}`}>
            <svg className="absolute inset-0 -rotate-90" viewBox="0 0 36 36">
              <circle cx="18" cy="18" r="16" fill="none" stroke="#2A2A32" strokeWidth="2" />
              <circle
                cx="18" cy="18" r="16" fill="none"
                stroke={isFrozen ? '#6B7280' : '#39FF14'}
                strokeWidth="2"
                strokeDasharray={`${ringProgress} 100`}
                strokeLinecap="round"
              />
            </svg>
            <span className="font-mono text-sm font-bold text-white">
              {isFrozen ? frozenLeft : timeLeft}s
            </span>
          </div>
        </div>

        {isFrozen && (
          <p className="mb-3 text-center text-sm text-pitch-muted">Locking odds...</p>
        )}

        <div className="mb-4 space-y-2">
          {options.map(([key, opt]) => (
            <button
              key={key}
              type="button"
              disabled={!isOpen}
              onClick={() => setSelectedOption(key)}
              className={`min-h-[44px] w-full rounded-xl border p-3 text-left transition-colors disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pitch-green ${
                selectedOption === key
                  ? 'border-pitch-green bg-pitch-green/10'
                  : 'border-pitch-border bg-pitch-dark'
              }`}
            >
              <div className="flex justify-between">
                <span className="text-white">{opt.label}</span>
                <span className="font-mono text-pitch-amber">{opt.multiplier}x</span>
              </div>
            </button>
          ))}
        </div>

        {underdogTeam === myTeam && (
          <div className="mb-3 rounded-lg bg-pitch-amber/20 px-3 py-1 text-center text-xs text-pitch-amber">
            Underdog {underdogMultiplier}x active on payouts
          </div>
        )}

        {isOpen && (
          <>
            <div className="mb-2 flex justify-between text-sm">
              <span className="text-pitch-muted">Wager</span>
              <span className="font-mono text-pitch-green">{amount} PC</span>
            </div>
            <Slider.Root
              className="relative mb-4 flex h-5 w-full touch-none items-center"
              min={10}
              max={maxWager}
              step={50}
              value={[Math.min(amount, maxWager)]}
              onValueChange={([v]) => setAmount(v)}
              disabled={maxWager < 10}
            >
              <Slider.Track className="relative h-1.5 grow rounded-full bg-pitch-border">
                <Slider.Range className="absolute h-full rounded-full bg-pitch-green" />
              </Slider.Track>
              <Slider.Thumb className="block h-7 w-7 rounded-full bg-pitch-green shadow focus:outline-none focus-visible:ring-2 focus-visible:ring-pitch-green" aria-label="Wager amount" />
            </Slider.Root>

            <p className="mb-3 text-center font-mono text-sm text-pitch-muted">
              Potential win: <span className="text-pitch-green">{potentialPayout} PC</span>
              {underdogTeam === myTeam && (
                <span className="text-pitch-amber"> ({underdogMultiplier}x underdog boost)</span>
              )}
            </p>

            {inlineError && (
              <p className="mb-2 text-center text-sm text-pitch-red">{inlineError}</p>
            )}

            <button
              type="button"
              onClick={handleConfirm}
              disabled={!selectedOption || submitting || !isOpen}
              className="min-h-[44px] w-full rounded-xl bg-pitch-green py-3 font-bold text-pitch-black disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              {submitting ? 'Placing...' : 'Confirm Wager'}
            </button>
          </>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
