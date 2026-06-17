# Staging / production deployment

Pitch Roulette ships as a **Vite React frontend** (Vercel) and a **FastAPI backend** (Railway or any Docker host). Supabase remains the database and auth provider.

## Prerequisites

1. Supabase project with migrations `001`–`007` applied (see `supabase/migrations/`)
2. GitHub repo connected to Vercel and Railway (or run deploy workflow manually)

## Backend (Railway)

**Important:** Railway must build the FastAPI app, not the repo root folder listing.

### Option A — recommended

1. Create a Railway project → **Deploy from GitHub**
2. Open the service → **Settings** → **Root Directory** → set to **`pitch-roulette/backend`**
3. Railway uses `pitch-roulette/backend/Dockerfile` + `railway.toml`
4. Set environment variables (copy from `backend/.env.example`):

| Variable | Notes |
|----------|--------|
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key (server only) |
| `FRONTEND_URL` | Production Vercel URL |
| `STAGING_FRONTEND_URL` | Optional preview URL |
| `ENVIRONMENT` | `staging` or `production` |
| `SENTRY_DSN` | Optional backend error tracking |
| `FEATURE_*` | Kill switches — all default `true` |
| `MOCK_MODE` | `false` in production |
| `DEMO_MODE` | `true` to allow demo rooms without live fixtures |

### Option B — repo root (no root directory change)

If Root Directory is left empty, the repo root **`Dockerfile`** + **`railway.toml`** build `pitch-roulette/backend` automatically.

### Railway build troubleshooting

If you see **`mise python@3.11.0`** or **Railpack could not determine how to build**:

1. **Settings → Build → Builder** → select **Dockerfile** (not Railpack/Nixpacks)
2. Set **Root Directory** to `pitch-roulette/backend` OR use repo-root `Dockerfile`
3. Do **not** use `runtime.txt` / `Procfile` — those trigger Railpack; this project uses Docker only
4. Push latest code (includes `railway.json` with `"builder": "DOCKERFILE"`)
5. Optional env var: `RAILWAY_DOCKERFILE_PATH=Dockerfile`

Health check: `GET /api/health` should return `supabase_connected: true`

## Frontend (Vercel)

1. Import repo → root directory `pitch-roulette/frontend`
2. Build: `npm run build` · Output: `dist`
3. Environment variables:

| Variable | Example |
|----------|---------|
| `VITE_SUPABASE_URL` | `https://xxx.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | anon key |
| `VITE_API_BASE_URL` | Railway backend URL |
| `VITE_SENTRY_DSN` | Optional |
| `VITE_ENVIRONMENT` | `staging` / `production` |

4. `vercel.json` enables SPA routing for React Router

## GitHub Actions

- **Test** (`.github/workflows/test.yml`) — pytest + Vitest on every PR; E2E smoke (home page, no secrets)
- **Deploy** (`.github/workflows/deploy-staging.yml`) — optional manual dispatch to verify health after deploy
- **E2E Nightly** — full demo flow with Supabase secrets

## Post-deploy checklist

- [ ] `/api/health` shows expected `feature_flags` and `telemetry_24h`
- [ ] Create demo room from UI
- [ ] Sentry receives a test error (if configured)
- [ ] Run `python scripts/load_test_rooms.py --rooms 50 --token <jwt>` against staging

## Local parity

```bash
# Backend
cd pitch-roulette/backend
cp .env.example .env   # fill in real keys locally only
uvicorn main:app --reload --port 8000

# Frontend
cd pitch-roulette/frontend
npm run dev
```
