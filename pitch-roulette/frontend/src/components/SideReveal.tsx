import { useEffect, useState } from 'react';
import type { Side } from '../../../shared/types';

interface Props {
  teamName: string;
  side: Side;
  onDismiss: () => void;
}

export function SideReveal({ teamName, side, onDismiss }: Props) {
  const [phase, setPhase] = useState<'build' | 'reveal'>('build');

  useEffect(() => {
    const t = setTimeout(() => setPhase('reveal'), 1000);
    return () => clearTimeout(t);
  }, []);

  const bg = side === 'HOME'
    ? 'from-blue-900/90 to-pitch-black'
    : 'from-red-900/90 to-pitch-black';

  return (
    <div
      data-testid="side-reveal"
      className={`fixed inset-0 z-50 flex flex-col items-center justify-center bg-gradient-to-b ${bg} px-6`}
    >
      <p className="text-pitch-muted mb-4">You are rooting for…</p>
      {phase === 'reveal' && (
        <h1 className={`text-3xl font-bold mb-8 ${side === 'HOME' ? 'text-blue-300' : 'text-red-300'}`}>
          {side === 'HOME' ? '🔵' : '🔴'} {teamName}
        </h1>
      )}
      <button
        type="button"
        onClick={onDismiss}
        className="ui-btn ui-btn-primary min-h-11 px-8"
      >
        Let&apos;s go! 🔥
      </button>
    </div>
  );
}
