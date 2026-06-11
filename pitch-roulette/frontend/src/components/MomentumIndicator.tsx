import { useGameStore } from '../store/gameStore';

interface Props {
  possessionA?: number;
  possessionB?: number;
}

export function MomentumIndicator({ possessionA = 50, possessionB = 50 }: Props) {
  const { teamAName, teamBName } = useGameStore();
  const total = possessionA + possessionB || 100;
  const pctA = Math.round((possessionA / total) * 100);
  const pctB = 100 - pctA;

  return (
    <div className="rounded-xl border border-pitch-border bg-pitch-card p-4">
      <p className="mb-2 text-xs uppercase tracking-wider text-pitch-muted">Momentum</p>
      <div className="mb-1 flex justify-between text-xs text-pitch-muted">
        <span>{teamAName} {pctA}%</span>
        <span>{pctB}% {teamBName}</span>
      </div>
      <div className="flex h-3 overflow-hidden rounded-full bg-pitch-border">
        <div
          className="bg-blue-500 transition-all duration-1000 ease-out"
          style={{ width: `${pctA}%` }}
        />
        <div
          className="bg-red-500 transition-all duration-1000 ease-out"
          style={{ width: `${pctB}%` }}
        />
      </div>
    </div>
  );
}
