import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { Side } from '../../../shared/types';
import { TeamCrest } from './TeamCrest';
import { Button } from './ui/Button';

interface Props {
  teamName: string;
  side: Side;
  teamLogo?: string | null;
  onDismiss: () => void;
}

export function SideReveal({ teamName, side, teamLogo, onDismiss }: Props) {
  const [phase, setPhase] = useState<'intro' | 'reveal' | 'ready'>('intro');

  useEffect(() => {
    const t1 = setTimeout(() => setPhase('reveal'), 800);
    const t2 = setTimeout(() => setPhase('ready'), 1600);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);

  const bg = side === 'HOME'
    ? 'linear-gradient(180deg, #0A1628 0%, #1A3A6B 100%)'
    : 'linear-gradient(180deg, #1A0A0A 0%, #6B1A1A 100%)';

  return (
    <motion.div
      data-testid="side-reveal"
      className="fixed inset-0 z-50 flex flex-col items-center justify-center px-6"
      style={{ background: bg }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
    >
      <AnimatePresence mode="wait">
        {phase === 'intro' && (
          <motion.p
            key="intro"
            className="text-[var(--text-secondary)] text-lg"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            You are rooting for…
          </motion.p>
        )}
        {(phase === 'reveal' || phase === 'ready') && (
          <motion.div
            key="reveal"
            className="flex flex-col items-center text-center"
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1, transition: { type: 'spring', stiffness: 200, damping: 20 } }}
          >
            <TeamCrest name={teamName} logo={teamLogo} size="lg" />
            <h1 className="score text-4xl text-white font-black mt-6 mb-2">
              {side === 'HOME' ? '🔵' : '🔴'} {teamName}
            </h1>
          </motion.div>
        )}
      </AnimatePresence>

      {phase === 'ready' && (
        <motion.div
          className="absolute bottom-12 left-4 right-4"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 25 }}
        >
          <Button variant="primary" size="lg" fullWidth onClick={onDismiss}>
            Let&apos;s go! 🔥
          </Button>
        </motion.div>
      )}
    </motion.div>
  );
}
