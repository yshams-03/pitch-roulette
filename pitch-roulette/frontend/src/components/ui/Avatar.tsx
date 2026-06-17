type AvatarSize = 'sm' | 'md' | 'lg' | 'xl';

const sizeMap: Record<AvatarSize, string> = {
  sm: 'h-7 w-7 text-[10px]',
  md: 'h-10 w-10 text-sm',
  lg: 'h-14 w-14 text-lg',
  xl: 'h-20 w-20 text-2xl',
};

export function Avatar({
  username,
  name,
  color = '#00E676',
  size = 'md',
  selected = false,
}: {
  username?: string;
  /** @deprecated use username — kept for existing call sites */
  name?: string;
  color?: string;
  size?: AvatarSize;
  selected?: boolean;
}) {
  const display = username || name || '?';
  const initials = display
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <div
      className={`flex shrink-0 items-center justify-center rounded-full font-bold text-white ring-2 ${
        selected ? 'ring-[var(--pr-green)]' : 'ring-transparent'
      } ${sizeMap[size]}`}
      style={{ backgroundColor: color }}
      aria-hidden
    >
      {initials}
    </div>
  );
}
