import { create } from 'zustand';
import type { Profile } from '../../../shared/types';
import { supabase } from '../lib/supabase';

interface AuthState {
  session: { access_token: string } | null;
  userId: string | null;
  profile: Profile | null;
  loading: boolean;
  init: () => Promise<void>;
  setProfile: (p: Profile | null) => void;
  signOut: () => Promise<void>;
  setSessionFromAuth: (session: { access_token: string; user: { id: string } } | null) => void;
}

function mapSession(session: { access_token: string; user: { id: string } } | null) {
  return {
    session: session ? { access_token: session.access_token } : null,
    userId: session?.user?.id ?? null,
  };
}

function clearSupabaseSessionStorage() {
  if (typeof window === 'undefined') return;
  const keys = Object.keys(window.localStorage);
  for (const key of keys) {
    if (key.startsWith('sb-') && key.endsWith('-auth-token')) {
      window.localStorage.removeItem(key);
    }
  }
}

export const useAuthStore = create<AuthState>((set) => ({
  session: null,
  userId: null,
  profile: null,
  loading: true,

  init: async () => {
    const { data } = await supabase.auth.getSession();
    set({ ...mapSession(data.session), loading: false });
    supabase.auth.onAuthStateChange((_event, session) => {
      set(mapSession(session));
    });
  },

  setSessionFromAuth: (session) => set(mapSession(session)),

  setProfile: (profile) => set({ profile }),

  signOut: async () => {
    await supabase.auth.signOut();
    clearSupabaseSessionStorage();
    set({ session: null, userId: null, profile: null });
    window.location.href = '/auth/login';
  },
}));
