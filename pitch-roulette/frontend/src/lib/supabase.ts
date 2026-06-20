import { createClient } from '@supabase/supabase-js';
import { config } from './config';

if (!config.supabaseUrl || !config.supabaseAnonKey) {
  throw new Error(
    'Supabase environment variables are missing. ' +
    'Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in Vercel dashboard → ' +
    'Project → Settings → Environment Variables → Production',
  );
}

export const supabase = createClient(config.supabaseUrl, config.supabaseAnonKey, {
  auth: {
    persistSession: true,
    storageKey: 'pitch-roulette-auth',
    storage: window.localStorage,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
  },
});
