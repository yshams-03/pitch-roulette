import { useState } from 'react';

type CrestSize = 'xs' | 'sm' | 'md' | 'lg';

const pixelSize: Record<CrestSize, number> = {
  xs: 16,
  sm: 24,
  md: 32,
  lg: 48,
};

export function TeamCrest({
  name,
  logo,
  size = 'sm',
}: {
  name?: string | null;
  logo?: string | null;
  size?: CrestSize | number;
}) {
  const [imgError, setImgError] = useState(false);
  const px = typeof size === 'number' ? size : pixelSize[size];
  const safeName = (name || 'TBD').trim() || 'TBD';

  if (logo && !imgError) {
    return (
      <img
        src={logo}
        alt=""
        width={px}
        height={px}
        className="rounded-full object-contain bg-[var(--bg-overlay)] shrink-0"
        loading="lazy"
        onError={() => setImgError(true)}
      />
    );
  }

  const initials = safeName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();

  return (
    <span
      className="inline-flex items-center justify-center rounded-full bg-[var(--bg-overlay)] font-bold text-[var(--text-muted)] shrink-0 border border-[var(--border)]"
      style={{ width: px, height: px, fontSize: Math.max(8, px * 0.35) }}
      aria-hidden
    >
      {initials || '?'}
    </span>
  );
}
