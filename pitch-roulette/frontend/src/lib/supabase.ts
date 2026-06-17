import { createClient, type SupabaseClient } from '@supabase/supabase-js';

function cleanEnv(value: string | undefined): string {
  return (value || '').trim().replace(/^['"]|['"]$/g, '');
}

const url = cleanEnv(import.meta.env.VITE_SUPABASE_URL);
const anon = cleanEnv(import.meta.env.VITE_SUPABASE_ANON_KEY);

function looksLikePlaceholder(): boolean {
  if (!url || !anon) return true;
  if (url.includes('your-project')) return true;
  if (anon === 'your_anon_key' || anon.includes('paste_anon')) return true;
  // Real Supabase anon JWTs are long base64 strings
  if (anon.length < 40) return true;
  return false;
}

export const supabaseConfigError = (() => {
  if (!url) return 'VITE_SUPABASE_URL is missing in frontend/.env';
  if (!anon) return 'VITE_SUPABASE_ANON_KEY is missing in frontend/.env';
  if (looksLikePlaceholder()) return 'Supabase keys in frontend/.env still look like placeholders';
  return null;
})();

export const supabaseConfigured = supabaseConfigError === null;

export const supabase: SupabaseClient | null = supabaseConfigured
  ? createClient(url, anon)
  : null;

if (import.meta.env.DEV && supabaseConfigError) {
  console.warn('[Pitch Roulette] Supabase:', supabaseConfigError, '— restart npm run dev after editing frontend/.env');
}
