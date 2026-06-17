import { useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { supabase } from '../lib/supabase';

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
    <div className="min-h-screen flex flex-col justify-center px-4 max-w-sm mx-auto">
      <h1 className="text-2xl font-bold text-white mb-6">Reset password</h1>
      <form onSubmit={handleReset} className="space-y-4">
        <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
          placeholder="Email" className="w-full min-h-11 rounded-xl bg-pitch-card border border-pitch-border px-4 text-white" />
        <button type="submit" disabled={loading}
          className="w-full min-h-11 rounded-xl bg-pitch-green font-bold text-pitch-black">
          Send reset email
        </button>
      </form>
      <p className="mt-4 text-center text-sm text-pitch-muted">
        <Link to="/auth/login" className="text-pitch-green">Back to login</Link>
      </p>
    </div>
  );
}
