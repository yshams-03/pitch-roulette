import { useCallback, useRef } from 'react';

export function Stepper({
  value,
  onChange,
  min = 0,
  max = 20,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
}) {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const step = useCallback(
    (delta: number) => {
      onChange(Math.min(max, Math.max(min, value + delta)));
      if (navigator.vibrate) navigator.vibrate(10);
    },
    [value, onChange, min, max],
  );

  const startHold = (delta: number) => {
    step(delta);
    intervalRef.current = setInterval(() => step(delta), 120);
  };

  const stopHold = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        className="btn btn-secondary btn-lg min-w-[56px] min-h-[56px] p-0 text-2xl"
        onClick={() => step(-1)}
        onPointerDown={() => startHold(-1)}
        onPointerUp={stopHold}
        onPointerLeave={stopHold}
        disabled={value <= min}
        aria-label="Decrease"
      >
        −
      </button>
      <span className="score text-3xl min-w-[3ch] text-center tabular-nums">{value}</span>
      <button
        type="button"
        className="btn btn-secondary btn-lg min-w-[56px] min-h-[56px] p-0 text-2xl"
        onClick={() => step(1)}
        onPointerDown={() => startHold(1)}
        onPointerUp={stopHold}
        onPointerLeave={stopHold}
        disabled={value >= max}
        aria-label="Increase"
      >
        +
      </button>
    </div>
  );
}
