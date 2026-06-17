export function Avatar({
  name,
  color = '#22c55e',
  size = 'md',
}: {
  name: string;
  color?: string;
  size?: 'sm' | 'md' | 'lg';
}) {
  const initials = name
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
  const sizes = { sm: 'h-8 w-8 text-xs', md: 'h-10 w-10 text-sm', lg: 'h-14 w-14 text-lg' };
  return (
    <div
      className={`flex shrink-0 items-center justify-center rounded-full font-bold text-white ${sizes[size]}`}
      style={{ backgroundColor: color }}
      aria-hidden
    >
      {initials}
    </div>
  );
}
