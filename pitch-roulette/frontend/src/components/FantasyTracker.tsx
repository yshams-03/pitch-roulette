import { useEffect, useRef } from 'react';
import { motion, useSpring, useTransform } from 'framer-motion';
import { useGameStore } from '../store/gameStore';

function RatingDisplay({ value }: { value: number }) {
  const spring = useSpring(value, { stiffness: 100, damping: 15 });
  const display = useTransform(spring, (v) => v.toFixed(1));
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    spring.set(value);
    const unsub = display.on('change', (v) => {
      if (ref.current) ref.current.textContent = v;
    });
    return unsub;
  }, [value, spring, display]);

  return <span ref={ref} className="font-mono text-2xl font-bold text-pitch-green">{value.toFixed(1)}</span>;
}

export function FantasyTracker() {
  const { myFantasyPicks, myFantasyScores, handicapActive } = useGameStore();
  const prevRatings = useRef<Record<number, number>>({});

  if (myFantasyPicks.length === 0) {
    return (
      <div className="rounded-xl border border-pitch-border bg-pitch-card p-4 text-center text-sm text-pitch-muted">
        No fantasy picks yet
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-medium uppercase tracking-wider text-pitch-muted">Fantasy Tracker</h3>
      <div className="grid gap-3">
        {myFantasyPicks.map((pick) => {
          const score = myFantasyScores.find((s) => s.api_player_id === pick.api_player_id);
          const rating = score?.current_rating ?? 0;
          const prev = prevRatings.current[pick.api_player_id] ?? 0;
          const milestoneFlash = rating >= 8 && prev < 8 && prev > 0;
          const penaltyFlash = rating <= 4 && prev > 4 && prev > 0;
          prevRatings.current[pick.api_player_id] = rating;

          return (
            <motion.div
              key={pick.id}
              layout
              className="relative overflow-hidden rounded-xl border border-pitch-border bg-pitch-card p-4"
            >
              {milestoneFlash && (
                <motion.div
                  initial={{ opacity: 0.8 }}
                  animate={{ opacity: 0 }}
                  transition={{ duration: 1 }}
                  className="absolute inset-0 bg-pitch-green/30"
                />
              )}
              {penaltyFlash && (
                <motion.div
                  initial={{ opacity: 0.8 }}
                  animate={{ opacity: 0 }}
                  transition={{ duration: 1 }}
                  className="absolute inset-0 bg-pitch-red/30"
                />
              )}
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-white">{pick.player_name}</p>
                  <p className="text-xs text-pitch-muted">{pick.position}</p>
                </div>
                <div className="text-right">
                  <RatingDisplay value={rating} />
                  {handicapActive && <span className="text-xs">⚖️</span>}
                  {(score?.bonus_pc ?? 0) > 0 && (
                    <p className="text-xs text-pitch-green">+{score?.bonus_pc} PC</p>
                  )}
                  {(score?.penalty_pc ?? 0) > 0 && (
                    <p className="text-xs text-pitch-red">−{score?.penalty_pc} PC</p>
                  )}
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
