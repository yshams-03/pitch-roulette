import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useGameStore } from '../store/gameStore';

interface Props {
  playerName: string;
  onDismiss: () => void;
  onAct: () => void;
}

export function SuperSubAlert({ playerName, onDismiss, onAct }: Props) {
  const [countdown, setCountdown] = useState(20);

  useEffect(() => {
    if (countdown <= 0) {
      onDismiss();
      return;
    }
    const timer = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [countdown, onDismiss]);

  return (
    <AnimatePresence>
      <motion.div
        initial={{ y: -100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: -100, opacity: 0 }}
        className="fixed inset-x-4 top-16 z-50 rounded-xl border border-pitch-amber bg-pitch-card p-4 shadow-xl"
      >
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-wider text-pitch-amber">Super Sub Alert</p>
            <h3 className="font-bold text-white">{playerName} is on!</h3>
            <p className="text-sm text-pitch-muted">5.0× payout if they score</p>
          </div>
          <div className="text-center">
            <span className="font-mono text-2xl font-bold text-pitch-amber">{countdown}</span>
            <p className="text-xs text-pitch-muted">seconds</p>
          </div>
        </div>
        <button
          onClick={onAct}
          className="mt-3 w-full rounded-lg bg-pitch-amber py-2 font-bold text-pitch-black"
        >
          Bet on Super Sub
        </button>
      </motion.div>
    </AnimatePresence>
  );
}

export function useSuperSubDetection() {
  const activeBet = useGameStore((s) => s.activeBet);
  const [alert, setAlert] = useState<string | null>(null);
  const [seen, setSeen] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (activeBet?.bet_type === 'SUPER_SUB' && !seen.has(activeBet.id)) {
      setSeen((s) => new Set(s).add(activeBet.id));
      const label = activeBet.event_label.replace('Super Sub: ', '').replace(' enters the pitch!', '');
      setAlert(label);
    }
  }, [activeBet, seen]);

  return { alert, clearAlert: () => setAlert(null) };
}
