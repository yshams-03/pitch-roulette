import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Coins } from 'lucide-react';
import { useGameStore } from '../store/gameStore';

export function ChipBalance() {
  const balance = useGameStore((s) => s.myBalance);
  const [displayBalance, setDisplayBalance] = useState(balance);
  const [flying, setFlying] = useState(false);
  const prevBalance = useRef(balance);

  useEffect(() => {
    if (balance !== prevBalance.current) {
      setFlying(true);
      const timer = setTimeout(() => {
        setDisplayBalance(balance);
        setFlying(false);
      }, 400);
      prevBalance.current = balance;
      return () => clearTimeout(timer);
    }
  }, [balance]);

  const isLow = displayBalance < 200;

  return (
    <div className="relative flex items-center justify-end gap-2 font-mono">
      <AnimatePresence>
        {flying && (
          <motion.div
            key="fly"
            initial={{ y: -40, opacity: 1, x: 20 }}
            animate={{ y: 0, opacity: 0, x: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
            className="absolute right-8 -top-2"
          >
            <Coins className="h-5 w-5 text-pitch-amber" />
          </motion.div>
        )}
      </AnimatePresence>
      <motion.span
        key={displayBalance}
        initial={{ scale: 1.2 }}
        animate={{ scale: 1 }}
        className={`text-lg font-bold tabular-nums ${
          isLow ? 'text-pitch-red animate-pulse-ring' : 'text-pitch-green'
        }`}
      >
        {displayBalance.toLocaleString()} PC
      </motion.span>
      <Coins className={`h-5 w-5 ${isLow ? 'text-pitch-red' : 'text-pitch-amber'}`} />
    </div>
  );
}
