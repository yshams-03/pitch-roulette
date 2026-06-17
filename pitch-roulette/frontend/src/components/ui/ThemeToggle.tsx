import { Moon, Sun } from 'lucide-react';
import { useTheme } from '../../hooks/useTheme';

export function ThemeToggle() {
  const { isDark, toggleTheme } = useTheme();

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className="btn btn-ghost btn-sm min-h-[36px] min-w-[36px] p-0 rounded-full"
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      style={{ transition: 'color 0.25s, background 0.25s' }}
    >
      {isDark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
    </button>
  );
}
