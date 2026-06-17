import type { ReactNode } from 'react';

type CardVariant = 'default' | 'elevated' | 'ghost';
type CardGlow = 'green' | 'gold' | 'red' | 'purple' | 'none';

const variantClass: Record<CardVariant, string> = {
  default: 'surface',
  elevated: 'surface-elevated',
  ghost: 'bg-transparent border border-[var(--border)] rounded-[var(--radius-lg)]',
};

const glowClass: Record<CardGlow, string> = {
  green: 'card-glow-green',
  gold: 'card-glow-gold',
  red: 'card-glow-red',
  purple: 'card-glow-purple',
  none: '',
};

export function Card({
  children,
  variant = 'default',
  glow = 'none',
  lift = true,
  className = '',
  ...props
}: {
  children: ReactNode;
  variant?: CardVariant;
  glow?: CardGlow;
  lift?: boolean;
  className?: string;
} & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`${variantClass[variant]} ${glow !== 'none' ? glowClass[glow] : ''} ${lift ? 'card-lift' : ''} ${className}`.trim()}
      {...props}
    >
      {children}
    </div>
  );
}
