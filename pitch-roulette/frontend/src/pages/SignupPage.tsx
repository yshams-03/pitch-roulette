import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Check, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { supabase } from '../lib/supabase';
import { friendlyAuthError } from '../lib/authErrors';
import { useAuthStore } from '../store/authStore';
import { AuthShell } from '../components/layout/AuthShell';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';

const COLORS = ['#00E676', '#2979FF', '#FFD600', '#D500F9', '#FF1744', '#4A5568'];

export function SignupPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const setSessionFromAuth = useAuthStore((s) => s.setSessionFromAuth);

  const u = username.trim().toLowerCase();
  const usernameValid = /^[a-z0-9_]{3,20}$/.test(u);

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 6) return toast.error('Password must be at least 6 characters');
    if (password !== confirm) return toast.error('Passwords do not match');
    if (!usernameValid) return toast.error('Username: 3-20 chars, letters, numbers, underscore');
    setLoading(true);
    const color = COLORS[Math.floor(Math.random() * COLORS.length)];
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: { username: u, display_name: displayName.trim() || u, avatar_color: color },
      },
    });
    setLoading(false);
    if (error) {
      toast.error(friendlyAuthError(error.message), { duration: 6000 });
      return;
    }
    if (data.session) {
      setSessionFromAuth(data.session);
      navigate('/');
      return;
    }
    toast.success('Check your email to confirm, then log in.', { duration: 8000 });
    navigate('/auth/login');
  };

  return (
    <AuthShell title="Create account">
      <form onSubmit={handleSignup} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input label="Display name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
          <div>
            <Input label="Username" value={username} onChange={(e) => setUsername(e.target.value)} />
            {username.length > 0 && (
              <p className={`text-xs mt-1 flex items-center gap-1 ${usernameValid ? 'text-[var(--pr-green)]' : 'text-[var(--pr-red)]'}`}>
                {usernameValid ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                {usernameValid ? 'Username available' : 'Invalid username'}
              </p>
            )}
          </div>
        </div>
        <Input type="email" required label="Email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
        <Input type="password" required minLength={6} label="Password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
        <Input type="password" required label="Confirm password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
        <Button type="submit" variant="primary" size="lg" fullWidth loading={loading}>
          Create account
        </Button>
      </form>
      <p className="mt-4 text-center text-sm text-[var(--text-secondary)]">
        Have an account? <Link to="/auth/login" className="text-[var(--pr-green)]">Sign in</Link>
      </p>
    </AuthShell>
  );
}
