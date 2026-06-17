export function friendlyAuthError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('failed to fetch') || m.includes('networkerror')) {
    return 'Cannot reach Supabase — check frontend/.env has your real VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY, then restart npm run dev.';
  }
  if (m.includes('invalid login credentials') || m.includes('invalid credentials')) {
    return 'Wrong email or password. If you just signed up, you may need to confirm your email first.';
  }
  if (m.includes('email not confirmed')) {
    return 'Confirm your email first — check your inbox (and spam) for the Supabase link.';
  }
  if (m.includes('user already registered')) {
    return 'This email is already registered. Try logging in instead.';
  }
  if (m.includes('database error saving new user')) {
    return 'Sign-up failed creating your profile — username may already be taken. Try another username.';
  }
  return message;
}
