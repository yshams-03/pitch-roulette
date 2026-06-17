# Pitch Roulette — Phase 2

World Cup prediction app: live standings, schedule, prediction rooms, flash bets, realtime rooms, chat, and host panel.

## Stack

- **Frontend:** React 19, TypeScript, Vite, Tailwind v4, Zustand, Supabase Auth
- **Backend:** FastAPI, Supabase (PostgreSQL + Realtime)
- **Sports:** [Football-Data.org](https://www.football-data.org) v4 API with Supabase cache

## Quick start

### 1. Supabase

1. Create a project at [supabase.com](https://supabase.com)
2. Open **SQL Editor** and run `supabase/schema.sql` (new projects)
3. **Already on Phase 1?** Run `supabase/phase2_migration.sql` for flash bets, chat, and new room states
4. If sign-up fails, also run `supabase/fix_auth_trigger.sql`
5. Enable **Email** auth under Authentication → Providers
6. **For local dev:** Authentication → Providers → Email → turn **OFF** “Confirm email”
7. Copy **Project URL**, **anon key**, and **service_role key**

### 2. Backend

```bash
cd backend
python -m venv venv
venv\Scripts\activate          # Windows
pip install -r requirements.txt
copy .env.example .env         # fill in keys
```

`backend/.env`:

```env
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
FOOTBALL_DATA_API_KEY=your_token
SPORTS_COMPETITION=WC
SPORTS_SEASON=2022
MOCK_MODE=false
FRONTEND_URL=http://localhost:5173
```

Get a free API token at [football-data.org/client/register](https://www.football-data.org/client/register). World Cup code is `WC`. Use `SPORTS_SEASON=2022` for historical WC data; set `2026` when your plan includes the upcoming tournament.

```bash
uvicorn main:app --reload --port 8000
```

### 3. Frontend

```bash
cd frontend
npm install
copy .env.example .env
npm run dev
```

Open http://localhost:5173

## Sports data

All standings and schedules come from **Football-Data.org** (`MOCK_MODE=false`). Group tables for World Cup are built from group-stage results when the standings endpoint is unavailable. Responses are cached in Supabase (10 req/min on free tier).

## Features

| Feature | Route |
|---------|-------|
| Standings + fixtures + bracket | `/` |
| Sign up / log in | `/auth/signup`, `/auth/login` |
| Profile | `/profile` |
| Friend groups | `/groups` |
| Global leaderboard | `/leaderboard` |
| Prediction room | `/room/:code/lobby` → `/predict` → `/draft` → `/live` → `/results` |
| Host panel | `/host/:code` |

## Points (PP)

- Correct outcome → 1 PP
- Exact score → 3 PP
- First submission in room → +0.5 PP
- 3-streak → next correct outcome doubles

## API health

`GET http://localhost:8000/api/health` — cache stats, mock mode, API status

## Phase 3 (on `feat/phase3-sabotage`)

Pitch Chips (merged), Sabotage shop, Side assignment, Fantasy draft, and cleanup (bracket SVG, auto FULL_TIME, nightly E2E).

Run migrations `003`–`006` in Supabase before testing.

## CI / Branch protection

PR CI runs `backend` + `frontend-unit` (see `.github/workflows/test.yml`).  
Nightly E2E: `.github/workflows/e2e-nightly.yml`.

To enable branch protection on `main`:

1. GitHub → Settings → Branches → Add rule
2. Branch name pattern: `main`
3. Check: **Require status checks to pass before merging**
4. Add checks: `backend`, `frontend-unit`
5. Check: **Require branches to be up to date before merging**
