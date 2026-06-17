import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

export function AuthShell({ children, title }: { children: ReactNode; title?: string }) {
  return (
    <div className="auth-bg min-h-screen flex flex-col items-center justify-center px-4 py-8">
      <div className="mb-8 text-center">
        <Link to="/" className="inline-flex items-baseline gap-0.5 no-underline">
          <span className="wordmark-pitch text-3xl">Pitch</span>
          <span className="wordmark-roulette text-3xl">Roulette</span>
        </Link>
        <p className="text-[var(--text-secondary)] mt-2 text-sm">Make every match matter.</p>
      </div>
      <div className="surface-elevated w-full max-w-[400px] p-6">
        {title && <h1 className="text-xl font-bold mb-6 text-center">{title}</h1>}
        {children}
      </div>
    </div>
  );
}
