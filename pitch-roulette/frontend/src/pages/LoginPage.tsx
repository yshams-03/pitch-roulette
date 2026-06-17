import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { supabase, supabaseConfigError } from '../lib/supabase';
import { friendlyAuthError } from '../lib/authErrors';
import { useAuthStore } from '../store/authStore';

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const setSessionFromAuth = useAuthStore((s) => s.setSessionFromAuth);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) {
      return toast.error(
        supabaseConfigError
          ? `${supabaseConfigError}. Stop and restart: npm run dev`
          : 'Supabase not configured — check frontend/.env and restart npm run dev',
        { duration: 8000 },
      );
    }
    setLoading(true);
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setLoading(false);
    if (error) {
      toast.error(friendlyAuthError(error.message), { duration: 6000 });
      return;
    }
    if (data.session) {
      setSessionFromAuth(data.session);
      navigate('/');
    }
  };

  return (
    <div className="mx-auto flex min-h-screen max-w-sm flex-col justify-center px-4">
      <h1 className="mb-6 text-lg font-semibold text-white">Log in</h1>
      <form onSubmit={handleLogin} className="space-y-3">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          autoComplete="email"
          className="ui-input"
        />
        <input
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          autoComplete="current-password"
          className="ui-input"
        />
        <button type="submit" disabled={loading} className="ui-btn ui-btn-primary w-full">
          {loading ? 'Logging in…' : 'Log in'}
        </button>
      </form>
      <p className="mt-4 text-center text-sm text-pitch-muted">
        <Link to="/auth/reset-password" className="text-white">Forgot password</Link>
        {' · '}
        <Link to="/auth/signup" className="text-white">Sign up</Link>
      </p>
    </div>
  );
}
