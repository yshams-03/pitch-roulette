// Single source of truth for all environment config
// Vite bakes these in at build time

export const config = {
  apiUrl: (import.meta.env.VITE_API_BASE_URL as string || 'http://localhost:8000').replace(/\/$/, ''),
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL as string,
  supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY as string,
  environment: (import.meta.env.VITE_ENVIRONMENT as string) || 'development',
  isDev: import.meta.env.DEV,
  isProd: import.meta.env.PROD,
} as const;

// Validate at startup — fail loudly in dev, warn in prod
if (!config.supabaseUrl) {
  const msg = 'VITE_SUPABASE_URL is not set';
  if (config.isDev) throw new Error(msg);
  else console.error('[config]', msg);
}
if (!config.supabaseAnonKey) {
  const msg = 'VITE_SUPABASE_ANON_KEY is not set';
  if (config.isDev) throw new Error(msg);
  else console.error('[config]', msg);
}
