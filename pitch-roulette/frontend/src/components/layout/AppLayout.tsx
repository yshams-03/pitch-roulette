import { Link, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { ThemeToggle } from '../ui/ThemeToggle';
import { Avatar } from '../ui/Avatar';

const BOTTOM_NAV = [
  { to: '/', emoji: '⚽', label: 'Home' },
  { to: '/leaderboard', emoji: '🏆', label: 'Leaderboard' },
  { to: '/groups', emoji: '👥', label: 'Groups', auth: true },
  { to: '/profile', emoji: '👤', label: 'Profile', auth: true },
];

const DESKTOP_NAV = [
  { to: '/', label: 'Home' },
  { to: '/leaderboard', label: 'Leaderboard' },
  { to: '/groups', label: 'Groups', auth: true },
];

function Wordmark() {
  return (
    <Link to="/" className="flex items-baseline gap-0.5 no-underline">
      <span className="wordmark-pitch text-lg">Pitch</span>
      <span className="wordmark-roulette text-lg">Roulette</span>
    </Link>
  );
}

export function AppLayout({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation();
  const { session, profile } = useAuthStore();

  const hideChrome =
    pathname.startsWith('/auth') ||
    pathname.startsWith('/room') ||
    pathname.startsWith('/demo') ||
    pathname.startsWith('/host');

  const showBottomNav = !hideChrome;
  const showTopNav = !hideChrome;

  return (
    <div className="min-h-screen bg-[var(--bg-base)] text-[var(--text-primary)]" style={{ paddingBottom: showBottomNav ? 'calc(60px + env(safe-area-inset-bottom))' : 0 }}>
      {showTopNav && (
        <header className="sticky top-0 z-50 h-14 border-b border-[var(--border)] bg-[var(--bg-base)]">
          <div className="mx-auto flex h-full max-w-6xl items-center justify-between px-4">
            <Wordmark />

            <nav className="hidden md:flex items-center gap-6">
              {DESKTOP_NAV.filter((n) => !n.auth || session).map(({ to, label }) => {
                const active = pathname === to || (to !== '/' && pathname.startsWith(to));
                return (
                  <Link
                    key={to}
                    to={to}
                    className={`text-sm font-semibold no-underline transition-colors ${
                      active ? 'text-[var(--pr-green)]' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    {label}
                  </Link>
                );
              })}
            </nav>

            <div className="flex items-center gap-2">
              <ThemeToggle />
              {session ? (
                <Link to="/profile" className="no-underline">
                  <Avatar
                    name={profile?.display_name || profile?.username || 'U'}
                    color={profile?.avatar_color || '#00E676'}
                    size="sm"
                  />
                </Link>
              ) : (
                <Link
                  to="/auth/login"
                  className="text-sm font-semibold text-[var(--pr-green)] no-underline hover:underline"
                >
                  Sign in
                </Link>
              )}
            </div>
          </div>
        </header>
      )}

      <main>{children}</main>

      {showBottomNav && (
        <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-[var(--border)] bg-[var(--bg-surface)] md:hidden" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
          <div className="mx-auto flex h-[60px] max-w-lg items-center justify-around">
            {BOTTOM_NAV.filter((n) => !n.auth || session).map(({ to, emoji, label }) => {
              const active = pathname === to || (to !== '/' && pathname.startsWith(to));
              return (
                <Link
                  key={to}
                  to={to}
                  className={`flex min-w-14 flex-col items-center justify-center gap-0.5 px-2 text-[10px] font-semibold no-underline ${
                    active ? 'text-[var(--pr-green)]' : 'text-[var(--text-muted)]'
                  }`}
                >
                  <span className="text-lg leading-none">{emoji}</span>
                  {label}
                </Link>
              );
            })}
          </div>
        </nav>
      )}
    </div>
  );
}
