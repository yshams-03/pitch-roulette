import { useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { supabase } from '../lib/supabase';
import { AuthShell } from '../components/layout/AuthShell';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';

export function ResetPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) return;
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/login`,
    });
    setLoading(false);
    if (error) toast.error(error.message);
    else toast.success('Check your email for reset link');
  };

  return (
    <AuthShell title="Reset password">
      <form onSubmit={handleReset} className="space-y-4">
        <Input type="email" required label="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <Button type="submit" variant="primary" size="lg" fullWidth loading={loading}>
          Send reset email
        </Button>
      </form>
      <p className="mt-4 text-center text-sm">
        <Link to="/auth/login" className="text-[var(--pr-green)]">Back to sign in</Link>
      </p>
    </AuthShell>
  );
}
