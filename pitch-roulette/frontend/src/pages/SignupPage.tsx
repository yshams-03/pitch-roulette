import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { supabase, supabaseConfigError } from '../lib/supabase';
import { friendlyAuthError } from '../lib/authErrors';
import { useAuthStore } from '../store/authStore';

const COLORS = ['#3d9a2f', '#8b7355', '#7a6b8a', '#9a7b3c', '#8b4a42', '#4a7a8b'];

export function SignupPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const setSessionFromAuth = useAuthStore((s) => s.setSessionFromAuth);

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) {
      return toast.error(
        supabaseConfigError
          ? `${supabaseConfigError}. Stop and restart: npm run dev`
          : 'Supabase not configured — check frontend/.env and restart npm run dev',
        { duration: 8000 },
      );
    }
    if (password.length < 6) return toast.error('Password must be at least 6 characters');
    if (password !== confirm) return toast.error('Passwords do not match');
    const u = username.trim().toLowerCase();
    if (!/^[a-z0-9_]{3,20}$/.test(u)) {
      return toast.error('Username: 3-20 chars, letters, numbers, underscore');
    }
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
    <div className="mx-auto max-w-sm px-4 py-8">
      <h1 className="mb-6 text-lg font-semibold text-white">Sign up</h1>
      <form onSubmit={handleSignup} className="space-y-3">
        <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Display name" className="ui-input" />
        <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Username" className="ui-input" />
        <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" autoComplete="email" className="ui-input" />
        <input type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" autoComplete="new-password" className="ui-input" />
        <input type="password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Confirm password" autoComplete="new-password" className="ui-input" />
        <button type="submit" disabled={loading} className="ui-btn ui-btn-primary w-full">
          {loading ? 'Creating…' : 'Create account'}
        </button>
      </form>
      <p className="mt-4 text-center text-sm text-pitch-muted">
        Have an account? <Link to="/auth/login" className="text-white">Log in</Link>
      </p>
    </div>
  );
}
