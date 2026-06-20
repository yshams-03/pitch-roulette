import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Eye, EyeOff } from 'lucide-react';
import toast from 'react-hot-toast';
import { supabase } from '../lib/supabase';
import { friendlyAuthError } from '../lib/authErrors';
import { useAuthStore } from '../store/authStore';
import { AuthShell } from '../components/layout/AuthShell';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const setSessionFromAuth = useAuthStore((s) => s.setSessionFromAuth);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
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
    <AuthShell title="Sign in">
      <form onSubmit={handleLogin} className="space-y-4">
        <Input
          type="email"
          required
          label="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
        />
        <Input
          type={showPassword ? 'text' : 'password'}
          required
          label="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          suffix={
            <button type="button" onClick={() => setShowPassword(!showPassword)} className="btn btn-ghost btn-sm p-0 min-h-0 border-0">
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          }
        />
        <Button type="submit" variant="primary" size="lg" fullWidth loading={loading}>
          Sign in
        </Button>
      </form>
      <p className="mt-3 text-center text-sm">
        <Link to="/auth/reset-password" className="text-[var(--pr-green)]">Forgot password?</Link>
      </p>
      <div className="flex items-center gap-3 my-6">
        <div className="flex-1 h-px bg-[var(--border)]" />
        <span className="text-xs text-[var(--text-muted)]">or</span>
        <div className="flex-1 h-px bg-[var(--border)]" />
      </div>
      <Link to="/auth/signup" className="btn btn-secondary w-full no-underline">Create account</Link>
    </AuthShell>
  );
}
