export function TeamCrest({
  name,
  logo,
  size = 20,
}: {
  name?: string | null;
  logo?: string | null;
  size?: number;
}) {
  const safeName = (name || 'TBD').trim() || 'TBD';

  if (logo) {
    return (
      <img
        src={logo}
        alt=""
        width={size}
        height={size}
        className="rounded-full object-contain bg-white/5 shrink-0"
        loading="lazy"
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
      className="inline-flex items-center justify-center rounded-full bg-pitch-border text-[9px] font-bold text-pitch-muted shrink-0"
      style={{ width: size, height: size }}
      aria-hidden
    >
      {initials || '?'}
    </span>
  );
}
