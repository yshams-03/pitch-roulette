# Pitch Roulette

A World Cup prediction game where friends compete in live **prediction rooms** during matches. Predict scores, draft players, place flash bets, spend Pitch Chips on sabotages, and climb leaderboards — with realtime updates powered by Supabase.

**API version:** 3.0.0 · **Phase 3:** Pitch Chips, Sabotage Shop, Side Assignment, Fantasy Draft

---

## What you get

| Area | Highlights |
|------|------------|
| **Home** | Group standings, fixtures, knockout bracket |
| **Rooms** | Lobby → predict → draft → live → results |
| **Social** | Friend groups, global leaderboard, in-room chat & reactions |
| **Host panel** | Lock predictions, go live, flash bets, kick players, inject events |
| **Demo mode** | Full France vs Netherlands simulation with bots — no live fixture required |
| **Phase 3** | Pitch Chips (PC), sabotage shop, HOME/AWAY sides, 60s fantasy draft |

### Room flow

```
/demo (optional) → /lobby → /predict → /draft → /live → /results
```

```
LOBBY → PREDICTING → CLOSED → DRAFTING → LIVE → FULL_TIME → RESULTS
```

| Route | Purpose |
|-------|---------|
| `/` | Standings, fixtures, bracket |
| `/auth/signup`, `/auth/login` | Supabase auth |
| `/groups` | Friend groups & watch-together rooms |
| `/leaderboard` | Global PP rankings |
| `/room/:code/lobby` | Join and wait for host |
| `/room/:code/predict` | Score predictions + side reveal |
| `/room/:code/draft` | Pick 3 players per side (60s) |
| `/room/:code/live` | Flash bets, sabotage shop, chat |
| `/room/:code/results` | PP skill board + PC party board |
| `/host/:code` | Host control panel (second screen) |
| `/demo` | One-click demo match |

---

## Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 19, TypeScript, Vite, Tailwind v4, Zustand, React Router |
| Backend | FastAPI 3.0, Uvicorn, Pydantic |
| Data | Supabase (PostgreSQL + Realtime + Auth) |
| Sports | [Football-Data.org](https://www.football-data.org) v4 (standings/fixtures) + ESPN public API (live events) |
| Tests | pytest, Vitest, Playwright |

---

## Quick start

### Prerequisites

- Node.js 20+
- Python 3.11+
- A [Supabase](https://supabase.com) project
- (Optional) Free token from [football-data.org](https://www.football-data.org/client/register)

### 1. Database (Supabase)

1. Create a project at [supabase.com](https://supabase.com).
2. Open **SQL Editor** and run migrations in order (see [Database migrations](#database-migrations) below).
3. Enable **Email** auth under Authentication → Providers.
4. For local dev: Authentication → Providers → Email → turn **OFF** “Confirm email”.
5. If sign-up fails, run `supabase/fix_auth_trigger.sql`.
6. Copy **Project URL**, **anon key**, and **service_role key** from Project Settings → API.

### 2. Backend

```powershell
cd pitch-roulette\backend
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
copy .env.example .env   # fill in your keys
uvicorn main:app --reload --port 8000
```

Verify the API is running:

```powershell
(Invoke-RestMethod http://127.0.0.1:8000/openapi.json).info.version
# → 3.0.0
```

> **Windows tip:** Prefer `127.0.0.1` over `localhost` for API calls — IPv6 can hang.

### 3. Frontend

```powershell
cd pitch-roulette\frontend
npm install
copy .env.example .env   # Supabase URL, anon key, API base
npm run dev
```

Open http://localhost:5173

Try the demo: http://localhost:5173/demo

---

## Environment variables

### Backend (`backend/.env`)

| Variable | Description |
|----------|-------------|
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key (server-side only) |
| `FOOTBALL_DATA_API_KEY` | Football-Data.org token |
| `SPORTS_COMPETITION` | Competition code, e.g. `WC` |
| `SPORTS_SEASON` | Season year, e.g. `2022` or `2026` |
| `MOCK_MODE` | `true` = serve cached standings/fixtures only (good for dev/E2E) |
| `DEMO_MODE` | `true` = enable `/demo` and simulation rooms |
| `FRONTEND_URL` | CORS origin, e.g. `http://localhost:5173` |
| `ESPN_ENABLED` | `true` = poll ESPN for live match events (flash bets) |

See `backend/.env.example` for the full list.

### Frontend (`frontend/.env`)

| Variable | Description |
|----------|-------------|
| `VITE_SUPABASE_URL` | Same as backend Supabase URL |
| `VITE_SUPABASE_ANON_KEY` | Public anon key |
| `VITE_API_BASE_URL` | Backend URL, e.g. `http://127.0.0.1:8000` |

---

## Database migrations

Run these in **Supabase SQL Editor** in order:

| Order | File | When |
|-------|------|------|
| 1 | `supabase/schema.sql` | Fresh project |
| 2 | `supabase/phase2_migration.sql` | Upgrading from Phase 1 |
| 3 | `supabase/migrations/002_unify_demo.sql` | **Required for v3** unified demo |
| 4 | `supabase/migrations/003_phase3_pitch_chips.sql` | Pitch Chips currency |
| 5 | `supabase/migrations/004_phase3_sabotage.sql` | Sabotage shop |
| 6 | `supabase/migrations/005_phase3_sides.sql` | HOME/AWAY side assignment |
| 7 | `supabase/migrations/006_phase3_draft.sql` | Fantasy draft phase |

---

## Scoring

### Prediction Points (PP) — skill

| Rule | Points |
|------|--------|
| Correct outcome (win/draw) | +1 PP |
| Exact score | +3 PP |
| First submission in room | +0.5 PP |
| 3-streak bonus | Next correct outcome doubles |

### Pitch Chips (PC) — party currency

- Start with **100 PC** when joining a room
- Spend on flash bet wagers, sabotages, and side swaps (20 PC)
- Earn PC from draft picks when your players score
- Underdog bonus: **+20 PC** on go-live when sides are imbalanced

---

## Testing

### Backend (67 tests)

```powershell
cd pitch-roulette\backend
.\venv\Scripts\Activate.ps1
pytest tests/ -q
```

### Frontend unit (10 tests)

```powershell
cd pitch-roulette\frontend
npm run test:unit
```

### E2E (Playwright, ~69 tests)

Requires a real Supabase user, backend on `:8000`, and optionally `MOCK_MODE=true`:

```powershell
$env:E2E_TEST_EMAIL = "your@email.com"
$env:E2E_TEST_PASSWORD = "yourpassword"
cd pitch-roulette\frontend
npm run test:e2e
```

See `frontend/e2e/E2E_RESULTS.md` and `frontend/e2e/E2E_BUGS.md` for run notes and known gaps.

---

## Project layout

```
pitch-roulette/
├── backend/           # FastAPI API, match engine, bots, ESPN/football services
├── frontend/          # React SPA + Playwright E2E specs
├── supabase/          # Schema and SQL migrations
├── shared/types.ts    # Shared TypeScript types
├── PHASE3.md          # Phase 3 feature spec
└── PROGRESS.md        # Detailed build log and API reference
```

---

## API health

```
GET http://127.0.0.1:8000/api/health
```

Returns cache stats, mock mode, Supabase connection, and active simulation room count.

Interactive docs: http://127.0.0.1:8000/docs

---

## CI

| Workflow | Trigger | Jobs |
|----------|---------|------|
| `.github/workflows/test.yml` | PR / push to `main` | `backend`, `frontend-unit` |
| `.github/workflows/e2e-nightly.yml` | Nightly + manual | Full Playwright suite |

E2E is not gated on PRs (requires Supabase credentials).

### Branch protection

On GitHub, protect `main` with required status checks: **backend** and **frontend-unit** (from `test.yml`). E2E nightly runs separately with repository secrets.

---

## Further reading

- **[PHASE3.md](./PHASE3.md)** — Phase 3 features, migrations, and rules
- **[PROGRESS.md](./PROGRESS.md)** — Full feature list, API routes, and development history

---

## License

Private project — see repository owner for usage terms.
