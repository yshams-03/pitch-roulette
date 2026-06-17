import { Link, useLocation } from 'react-router-dom';
import { Home, Trophy, Users, User } from 'lucide-react';
import { useAuthStore } from '../store/authStore';

const NAV = [
  { to: '/', icon: Home, label: 'Home' },
  { to: '/leaderboard', icon: Trophy, label: 'Ranks' },
  { to: '/groups', icon: Users, label: 'Groups', auth: true },
  { to: '/profile', icon: User, label: 'Profile', auth: true },
];

export function Layout({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation();
  const { session } = useAuthStore();
  const showNav = !pathname.startsWith('/auth') && !pathname.startsWith('/room') && !pathname.startsWith('/demo') && !pathname.startsWith('/host');

  return (
    <div className="min-h-screen bg-pitch-black pb-16">
      {children}
      {showNav && (
        <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-pitch-border bg-pitch-card">
          <div className="mx-auto flex h-14 max-w-lg items-center justify-around">
            {NAV.filter((n) => !n.auth || session).map(({ to, icon: Icon, label }) => {
              const active = pathname === to || (to !== '/' && pathname.startsWith(to));
              return (
                <Link
                  key={to}
                  to={to}
                  className={`flex min-w-14 flex-col items-center justify-center gap-0.5 px-2 text-[11px] ${
                    active ? 'text-white' : 'text-pitch-muted'
                  }`}
                >
                  <Icon className="h-[18px] w-[18px]" strokeWidth={active ? 2.25 : 1.75} />
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
