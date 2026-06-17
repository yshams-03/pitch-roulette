import type { ReactNode } from 'react';

type BadgeVariant = 'live' | 'green' | 'gold' | 'blue' | 'purple';

const variantClass: Record<BadgeVariant, string> = {
  live: 'badge badge-live',
  green: 'badge badge-green',
  gold: 'badge badge-gold',
  blue: 'badge badge-blue',
  purple: 'badge badge-purple',
};

export function Badge({
  variant = 'green',
  dot = false,
  children,
  className = '',
}: {
  variant?: BadgeVariant;
  dot?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span className={`${variantClass[variant]} ${dot ? 'pulse-red' : ''} ${className}`.trim()}>
      {children}
    </span>
  );
}
