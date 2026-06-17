export function CountdownRing({
  seconds,
  total,
  size = 60,
}: {
  seconds: number;
  total: number;
  size?: number;
}) {
  const stroke = 4;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = total > 0 ? seconds / total : 0;
  const offset = circumference * (1 - progress);

  let color = 'var(--pr-green)';
  if (seconds <= 3) color = 'var(--pr-red)';
  else if (seconds <= total * 0.3) color = 'var(--pr-gold)';

  const pulse = seconds <= 3 && seconds > 0;

  return (
    <div
      className={`relative inline-flex items-center justify-center ${pulse ? 'animate-pulse' : ''}`}
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--bg-overlay)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset 0.3s linear, stroke 0.3s' }}
        />
      </svg>
      <span className="absolute score text-lg tabular-nums">{Math.max(0, seconds)}</span>
    </div>
  );
}
