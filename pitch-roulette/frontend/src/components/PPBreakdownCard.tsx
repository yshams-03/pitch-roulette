import { useState } from 'react';
import type { PPBreakdown } from '../../../shared/types';

export function PPBreakdownCard({
  breakdown,
  predicted,
  actual,
}: {
  breakdown: PPBreakdown;
  predicted: string;
  actual: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="pp-breakdown mt-1">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="pp-breakdown-toggle text-xs text-[var(--pr-green)] font-semibold"
      >
        {breakdown.total} PP {open ? '▲' : '▼'}
      </button>

      {open && (
        <div className="pp-breakdown-detail mt-2 text-xs border-t border-[var(--border)] pt-2 space-y-1">
          <p className="text-[var(--text-muted)] mb-2">
            Predicted: {predicted} · Actual: {actual}
          </p>
          {breakdown.base > 0 && (
            <div className="pp-line flex justify-between">
              <span>
                {breakdown.score_exact
                  ? '🎯 Exact score'
                  : breakdown.score_diff_correct
                    ? '✓ Score difference'
                    : '✓ Correct outcome'}
              </span>
              <span>+{breakdown.base} PP</span>
            </div>
          )}
          {breakdown.streak_bonus > 0 && (
            <div className="pp-line flex justify-between">
              <span>🔥 Streak {breakdown.streak_mult}</span>
              <span>+{breakdown.streak_bonus} PP</span>
            </div>
          )}
          {breakdown.early_bonus > 0 && (
            <div className="pp-line flex justify-between">
              <span>⚡ Early prediction</span>
              <span>+{breakdown.early_bonus} PP</span>
            </div>
          )}
          {breakdown.underdog_bonus > 0 && (
            <div className="pp-line flex justify-between">
              <span>🏆 Underdog bonus</span>
              <span>+{breakdown.underdog_bonus} PP</span>
            </div>
          )}
          <div className="pp-line pp-total flex justify-between font-bold border-t border-[var(--border)] pt-1 mt-1">
            <span>Total</span>
            <span>{breakdown.total} PP</span>
          </div>
        </div>
      )}
    </div>
  );
}
