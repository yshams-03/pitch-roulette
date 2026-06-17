# Pitch Roulette — Project Progress

**Last updated:** 17 June 2026  
**Version:** 3.0.0 + Phase 3 complete (pending merge)  
**Branch:** `feat/phase3-sabotage` pushed to GitHub — **PR to `main` ready**  
**Status:** **67** pytest + **10** Vitest + **69** Playwright E2E specs passing locally

---

## Overview

Pitch Roulette is a World Cup prediction app. Users sign up, join friend groups, compete on leaderboards, and create **prediction rooms** during live matches. Phase 1 covered score predictions and PP awards. **Phase 2** adds realtime rooms, flash bets, knockout bracket, in-room chat/reactions, host control panel, and ESPN live events.

**v3.0.0** unifies demo and real rooms behind a single `match_engine` — no separate demo code paths in the frontend. Demo simulation rooms use the same lobby → predict → live → results flow as real rooms.

---

## v3.0.0 — Unified demo (merged PR #1)

### What changed

| Before (v2) | After (v3) |
|-------------|------------|
| `demo_match.py`, `demo_bots.py`, `demo_auto_events.py` | `match_engine.py`, `bots.py`, `event_pipeline.py` |
| `routers/demo.py` | `routers/demo_compat.py` (backward-compat `/api/demo/*`) |
| Demo-only room creation | `POST /api/rooms` with `match_source: "demo_simulation"` |
| Separate demo scoreboard logic | `normalize_room_match_data()` on every API read |

### New / updated schema (`002_unify_demo.sql`)

Run **`supabase/migrations/002_unify_demo.sql`** in Supabase SQL Editor after `phase2_migration.sql`.

| Column / table | Purpose |
|----------------|---------|
| `rooms.match_source` | `live_api` \| `demo_simulation` \| `manual` |
| `rooms.bot_config_json` | Bot count, difficulty, enabled flag |
| `rooms.match_simulation_json` | Simulation state (events, score, minute) |
| `profiles.is_bot`, `profiles.bot_difficulty` | Bot player metadata |
| `room_events` | Unified event log (dedup via `event_key`) |

### Health check

`GET http://localhost:8000/api/health` → `"version": "3.0.0"`, `active_simulation_rooms`, `supabase_connected`

---

## Phase 2 — What was built

### 1. Realtime rooms ✅

- `useRoomRealtime(roomCode)` hook subscribes to `rooms`, `room_players`, `predictions`
- Used on lobby, predict, and live pages
- **🟢 Live** indicator when Realtime connected
- **⚠️ Connection lost, reconnecting…** + 5s fallback polling on disconnect
- `useRoomRedirect` auto-navigates players when room state changes
- Live page polls every 2s for score/events/flash bets (Realtime can miss `match_data` JSON updates)

### 2. Flash bets ✅

- Betting window: **12s** (live rooms), **30s** (demo auto-bets)
- 5s server grace after `locks_at` for late submissions
- Wager tiers: LOW (0.5 PP), MEDIUM (1 PP), HIGH (2 PP)
- Host-triggered via host panel or API
- Auto-triggered from **ESPN `details[]`** events (goals, cards, penalties) for LIVE rooms
- Score-delta fallback when ESPN unavailable
- PP updates `room_players.session_pp` + `profiles.total_points`
- UI on `/room/:code/live`: countdown card, Yes/No buttons, optimistic “Your pick”, history, session PP

### 3. ESPN live events ✅

- `backend/services/espn.py` — public ESPN scoreboard/summary API (no auth)
- `resolve_espn_event_id()`, `get_espn_live_snapshot()` in `sports_service.py`
- `espn_event_id` stored on rooms at create / go-live
- `flash_bet_generator.py` polls LIVE rooms every 30s (skips simulation rooms)
- Config: `ESPN_ENABLED`, `ESPN_LEAGUE_SLUG` in `backend/.env`

### 4. Demo simulation ✅

Full match flow **without a real live fixture** — France vs Netherlands with 3 bots.

| Piece | Path / detail |
|-------|----------------|
| Enable | `DEMO_MODE=true` in `backend/.env` |
| Entry | `/demo` → **Enter demo match** (or API `POST /api/demo/start`) |
| Match | `match_id: demo-sandbox`, `match_source: demo_simulation` |
| Flow | LOBBY → PREDICTING → CLOSED → LIVE → RESULTS (same routes as real rooms) |
| Auto events | `event_pipeline.py` + `match_engine` inject events on timer |
| Bot behaviour | `bots.py` — predictions + flash bet answers |
| Compat API | `/api/demo/*` delegates to unified rooms + match engine |

### 5. Knockout bracket ✅

- New **Bracket** tab on home page
- Rounds: R32 → R16 → QF → SF → Final (from match `stage` field)
- TBD teams handled safely
- Tap match → modal with score / create room if live

### 6. Chat + reactions ✅

- Collapsible chat on live page (`room_messages` table + Realtime)
- `data-testid="chat-disabled"` when host turns chat off
- Paginated: last 50, load older on scroll
- Basic profanity filter (backend)
- Host can soft-delete messages
- 6 emoji reactions via Supabase **broadcast** (ephemeral, 2s rate limit)

### 7. Host control panel ✅

- `/host/:code` — host-only (validates `host_id` on every API call)
- Phase buttons: Start predictions → Lock → Go live → End match
- Flash bet presets + custom builder + resolve
- Kick players, toggle chat on/off (`chat-toggle-on` / `chat-toggle-off`)
- Inject event, fast-forward (simulation rooms)
- Live score display

---

## Updated room flow

```
```
/demo (optional) → /lobby → /predict → /draft → /live → /results
```

**State machine:**

```
LOBBY → PREDICTING → CLOSED → DRAFTING → LIVE → FULL_TIME → RESULTS
```

| Step | Route | What happens |
|------|-------|--------------|
| Demo entry | `/demo` | Creates simulation room in LOBBY, redirects to lobby |
| Lobby | `/room/:code/lobby` | Players join, host starts predictions |
| Predict | `/room/:code/predict` | Side reveal, score predictions, optional side swap (20 PC) |
| Draft | `/room/:code/draft` | 60s fantasy draft — pick 3 players per side, PC on goals |
| Live | `/room/:code/live` | Flash bets, sabotage shop, match events, chat, reactions |
| Results | `/room/:code/results` | PP skill board + PC party board, draft performance tab |
| Host panel | `/host/:code` | Second-screen controls for host |

**Groups:** `/groups/:id` → **Watch Together** creates a live or demo room with `group_id` attached.

**Breaking change from Phase 1:** `POST /close` now only **locks** predictions (CLOSED). Host must **Go live** then **End match** to award prediction PP.

---

## Testing & CI ✅

### GitHub Actions (`.github/workflows/test.yml` at repo root)

Runs on every **push to `main`** and **pull request to `main`**.

| Job | What it runs |
|-----|--------------|
| `backend` | `pytest tests/` — 67 tests, `DEMO_MODE=true`, `ESPN_ENABLED=false`, FakeSupabase |
| `frontend-unit` | `npm run test:unit -- --coverage` — 10 Vitest tests |

E2E is **not** in PR CI (needs Supabase auth credentials). **Nightly:** `.github/workflows/e2e-nightly.yml` (02:00 UTC + `workflow_dispatch`).

**PR #1** merged 17 Jun 2026 — both jobs passed on GitHub Actions.

### Run tests locally

**Backend** (must use `backend/venv`, not `frontend/`):

```powershell
cd pitch-roulette\backend
.\venv\Scripts\Activate.ps1
pytest tests/ -q
```

**Frontend** (no venv):

```powershell
cd pitch-roulette\frontend
npm run test:unit
```

**Makefile** (from `pitch-roulette/`):

```powershell
make test           # backend unit + integration
make test-frontend  # vitest
```

### E2E (Playwright — manual, requires credentials)

Set in shell before running:

```powershell
$env:E2E_TEST_EMAIL = "your@email.com"
$env:E2E_TEST_PASSWORD = "yourpassword"
# Optional when no live fixtures:
$env:E2E_MATCH_ID = "1234567"
```

Requires **backend on :8000** and **frontend on :5173** (Playwright starts dev server by default).

| Spec | Coverage |
|------|----------|
| `e2e/auth.spec.ts` | Login, logout, protected routes, reset password |
| `e2e/home.spec.ts` | Standings, fixtures, bracket |
| `e2e/groups.spec.ts` | Create/join group, leaderboard |
| `e2e/demo-flow.spec.ts` | Full lobby → side reveal → draft → live → results |
| `e2e/pitch-chips.spec.ts` | PC balance, flash bet tiers, party board |
| `e2e/sabotage.spec.ts` | Shop, TAX, SILENCE/BLINDFOLD (2-browser) |
| `e2e/side-assignment.spec.ts` | Side reveal, swap, underdog bonus |
| `e2e/fantasy-draft.spec.ts` | Draft phase, picks, timer, bots |
| `e2e/cleanup.spec.ts` | Bracket SVG, chat delete API, CI docs |
| `e2e/realtime.spec.ts` | Live badge, redirects, flash bet inject |
| `e2e/host-controls.spec.ts` | Kick, chat toggle, flash bet, resolve, inject |
| `e2e/real-room-flow.spec.ts` | Live fixture room (skips if no in-play matches) |

**69 tests** total. See `frontend/e2e/E2E_RESULTS.md` and `frontend/e2e/E2E_BUGS.md`.

```powershell
cd pitch-roulette\frontend
npm run test:e2e
npx playwright test e2e/host-controls.spec.ts
```

---

## Phase 1 — Still working

- Home: Table + Fixtures + **Bracket** tabs
- Auth, profiles, groups, global leaderboard
- Prediction rooms (updated flow above)
- Football-Data.org sports data (no mock for real fixtures)
- PP rules for predictions unchanged (+1 outcome, +3 exact, +0.5 first, streak bonus)

---

## Tech stack

| Layer | Technology |
|-------|------------|
| Frontend | React 19, TypeScript, Vite 8, Tailwind CSS v4, React Router v7, Zustand |
| Backend | FastAPI 3.0, Uvicorn, Pydantic, httpx |
| Database | Supabase PostgreSQL + **Realtime** |
| Auth | Supabase Auth + JWT (backend) |
| Sports API | Football-Data.org v4 + ESPN (live events) |
| Tests | pytest + FakeSupabase, Vitest, Playwright |
| CI | GitHub Actions (backend + frontend-unit) |

---

## Database migrations

| Order | File | When |
|-------|------|------|
| 1 | `supabase/schema.sql` | Fresh Supabase project |
| 2 | `supabase/phase2_migration.sql` | Upgrading from Phase 1 |
| 3 | `supabase/migrations/002_unify_demo.sql` | **Required for v3** — unified demo architecture |
| 4 | `supabase/migrations/003_phase3_pitch_chips.sql` | Phase 3 Feature 1 — PC currency |
| 5 | `supabase/migrations/004_phase3_sabotage.sql` | Phase 3 Feature 2 — sabotage shop |
| 6 | `supabase/migrations/005_phase3_sides.sql` | Phase 3 Feature 3 — HOME/AWAY assignment |
| 7 | `supabase/migrations/006_phase3_draft.sql` | Phase 3 Feature 4 — fantasy draft |
| — | `supabase/fix_auth_trigger.sql` | If sign-up fails |

| Table / column | Purpose |
|----------------|---------|
| `rooms.state` | LOBBY, PREDICTING, CLOSED, LIVE, FULL_TIME, RESULTS |
| `rooms.chat_enabled` | Host toggle |
| `rooms.match_source` | `live_api` / `demo_simulation` / `manual` |
| `rooms.bot_config_json` | Simulation bot settings |
| `rooms.match_simulation_json` | Simulation match state |
| `rooms.last_seen_event_key` | Auto flash bet dedup |
| `rooms.espn_event_id` | ESPN match cursor |
| `room_players.session_pp` | Flash bet PP in session |
| `room_players.session_pc` | Pitch Chips balance (starts at 100) |
| `pc_transactions` | PC audit trail |
| `sabotages` | Sabotage purchases (6 types) |
| `room_players.assigned_side` | HOME / AWAY (Feature 3) |
| `draft_picks` | Fantasy draft selections + PC earned (Feature 4) |
| `rooms.draft_started_at` | Draft countdown anchor |
| `flash_bets` / `flash_bet_answers` | Flash bet lifecycle |
| `room_messages` | In-room chat |
| `room_events` | Unified event log (v3) |

Realtime enabled on: `flash_bets`, `flash_bet_answers`, `room_messages`, `rooms`, `room_players`, `predictions` (see `schema.sql`).

---

## Key API routes

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/rooms` | Create room (`match_source`, `match_id`, bots) |
| DELETE | `/api/rooms/{code}` | Host-only room cleanup |
| GET | `/api/fixtures?status=LIVE\|SCHEDULED` | Filtered fixtures (E2E) |
| POST | `/api/rooms/{code}/lock` | PREDICTING → CLOSED |
| POST | `/api/rooms/{code}/go-live` | CLOSED → LIVE |
| POST | `/api/rooms/{code}/end` | LIVE → RESULTS + award PP |
| GET/POST | `/api/rooms/{code}/flash-bets` | List / create flash bets |
| GET | `/api/rooms/{code}/sabotages/shop` | Sabotage catalog + buyer PC |
| GET/POST | `/api/rooms/{code}/sabotages` | List active / purchase sabotage |
| POST | `/api/rooms/{code}/swap-side` | Spend 20 PC to swap HOME/AWAY |
| GET | `/api/rooms/{code}/draft/squads` | Draft player pool |
| POST | `/api/rooms/{code}/draft/pick` | Pick a player |
| POST | `/api/rooms/{code}/start-draft` | CLOSED → DRAFTING |
| POST | `/api/rooms/{code}/chat-toggle` | Enable/disable chat |
| POST | `/api/rooms/{code}/kick` | Remove player |
| POST | `/api/rooms/{code}/inject-event` | Manual event (simulation) |
| POST | `/api/rooms/{code}/fast-forward` | Trigger next simulation event |
| GET | `/api/health` | v3.0.0 health + room counts |
| GET | `/api/demo/enabled` | `DEMO_MODE` flag |
| POST | `/api/demo/start` | Create simulation room (compat) |

`POST /close` remains as alias for `/lock` (Phase 1 compat).  
`/api/demo/*` routes delegate to unified `rooms` + `match_engine` via `demo_compat.py`.

---

## Key files

| Area | Path |
|------|------|
| Match engine | `backend/services/match_engine.py` |
| Bots | `backend/services/bots.py` |
| Event pipeline | `backend/services/event_pipeline.py` |
| Demo compat router | `backend/routers/demo_compat.py` |
| DB compat / migration probe | `backend/services/db_compat.py` |
| Realtime hook | `frontend/src/hooks/useRoomRealtime.ts` |
| Live page | `frontend/src/pages/RoomLivePage.tsx` |
| Demo entry | `frontend/src/pages/DemoSandboxPage.tsx` |
| Host panel | `frontend/src/pages/HostPanelPage.tsx` |
| Chat | `frontend/src/components/RoomChat.tsx` |
| Flash bet UI | `frontend/src/components/FlashBetCard.tsx` |
| Pitch Chips | `backend/services/pitch_chips.py` |
| Sabotage shop | `backend/services/sabotages.py`, `frontend/src/components/SabotageShop.tsx` |
| Side assignment | `backend/services/sides.py`, `frontend/src/components/SideReveal.tsx` |
| Fantasy draft | `backend/services/draft.py`, `frontend/src/pages/RoomDraftPage.tsx` |
| Design system | `frontend/src/styles/design-system.css`, `frontend/src/components/ui/` |
| App layout | `frontend/src/components/layout/AppLayout.tsx` |
| E2E helpers | `frontend/e2e/helpers.ts` |
| Backend tests | `backend/tests/` (67 pytest tests) |
| CI workflow | `.github/workflows/test.yml` (repo root) |
| Phase 3 migrations | `003`–`006` in `supabase/migrations/` |

---

## How to run locally

**Terminal 1 — Backend**

```powershell
cd pitch-roulette\backend
.\venv\Scripts\Activate.ps1
uvicorn main:app --reload --port 8000
```

**Terminal 2 — Frontend**

```powershell
cd pitch-roulette\frontend
npm run dev
```

### Before testing

1. Run **`phase2_migration.sql`** then **`migrations/002`–`006`** in Supabase SQL Editor (if not on fresh schema)
2. Set **`DEMO_MODE=true`** in `backend/.env` for demo sandbox
3. Copy `backend/.env.example` → `backend/.env` and fill Supabase + Football-Data keys
4. Restart backend after `.env` changes
5. **Windows:** if port 8000 hangs, kill stray `python.exe` and restart a single uvicorn instance

### Demo test flow (recommended)

1. Log in → open **`/demo`** → **Enter demo match**
2. Lobby → **Start predictions** → predict page
3. Lock score → **Lock predictions** → **Start draft** (or skip) → **Go live**
4. Draft page: pick 3 players (60s timer) → auto go-live when timer ends
5. Live page: match events, flash bets, sabotage shop, chat
5. **End match** → results PP

Or use host panel at `/host/:code` for inject event, chat toggle, manual flash bets.

---

## Known limitations / follow-ups

| Item | Notes |
|------|-------|
| Real rooms need live fixture | Room create requires in-play match from Football-Data; use **demo** off-season |
| E2E not in PR CI | Nightly: `.github/workflows/e2e-nightly.yml`; PR CI: unit tests only |
| Branch protection | Enable in GitHub UI — require `backend` + `frontend-unit` on `main` |
| PR merge pending | `feat/phase3-sabotage` → `main` — open compare on GitHub or `gh pr create` |
| ESPN on Windows dev | SSL/cert issues possible; backend proxies ESPN |
| Real rooms need live fixture | Off-season: use **demo** or group **Watch Together → demo** |
| Host transfer | Not implemented (`host-controls` E2E skipped) |
| Resilience E2E | Network throttle / reconnect banner tests — planned |
| PC win/loss toasts | Not wired to Realtime; verified via API in E2E |

---

## Phase 3 — Complete on `feat/phase3-sabotage` ✅

| Feature | Migration | Highlights |
|---------|-----------|------------|
| **1 Pitch Chips** | `003` | `session_pc`, `pc_transactions`, flash bet wagers, party board (merged to `main` via PR #2) |
| **2 Sabotage shop** | `004` | 6 types, shop sheet, blindfold/tax/silence/jinx/mirror/DON hooks, bot purchases |
| **3 Side assignment** | `005` | Balanced HOME/AWAY on start, `SideReveal` overlay, swap-side (20 PC), underdog +20 PC |
| **4 Fantasy draft** | `006` | `DRAFTING` state, 60s timer, 3 picks/side, PC on drafted player goals |
| **5 Cleanup** | — | Bracket SVG connectors, `FULL_TIME` auto-end, host room delete, nightly E2E workflow |

### Commits ahead of `main` (6)

```
c70c3aa feat: Phase 3 Feature 2 - Sabotage Shop
b89665c feat: Phase 3 Feature 3 - Side Assignment
1913568 feat: Phase 3 Feature 4 - Fantasy Draft
b39d39b fix: Phase 3 Feature 5 - Cleanup
8ae5f64 feat: frontend redesign, group room creation, and E2E expansion
4045666 test: draft reward unit tests and E2E docs tweak
```

**Open PR:** https://github.com/yshams-03/pitch-roulette/compare/main...feat/phase3-sabotage

---

## Not built (Phase 4+)

- Production deployment (Vercel + Railway + prod Supabase)
- Scouting page, push notifications, share cards
- Host transfer
- Resilience E2E (network disconnect)

---

## Issues fixed (recent)

| Issue | Fix |
|-------|-----|
| Separate demo vs real code paths | v3 `match_engine` + `match_source` unification |
| `not_demo_room` / stale backend errors | Unified routes; restart backend after deploy |
| Chat toggle E2E flaky | `room-chat` + `data-chat-enabled`; `gotoLiveRoom()` helper |
| E2E lock/go-live races | Idempotent `lockRoomApi`; UI-first `lockAndGoLive` |
| Flash bet timing in E2E | `ensureOpenFlashBet` polls + API fallback |
| Demo sandbox disabled | `DEMO_MODE` in config; `reload_settings()` in lifespan |
| Live page black screen | Null-safe `room` on `RoomLivePage` |
| Watch Together stub | Group detail now creates live/demo rooms with `group_id` |
| Demo rooms missing `group_id` | `create_simulation_room` accepts `group_id` |
| pytest not found locally | Activate `backend\venv` — not `frontend\venv` |
| CI workflow path | `.github/workflows/` at **repo root** (`world cup/`), not `pitch-roulette/.github/` |

---

## Repo structure

```
world cup/                          # git root
├── .github/workflows/
│   ├── test.yml                    # CI: backend + frontend-unit (on PR/push)
│   └── e2e-nightly.yml             # Nightly: demo + host E2E
└── pitch-roulette/
    ├── backend/
    │   ├── routers/
    │   │   ├── rooms.py
    │   │   ├── demo_compat.py
    │   │   └── health.py           # API_VERSION 3.0.0
    │   ├── services/
    │   │   ├── match_engine.py
    │   │   ├── bots.py
    │   │   ├── event_pipeline.py
    │   │   ├── pitch_chips.py
    │   │   ├── sabotages.py
    │   │   ├── sides.py
    │   │   ├── draft.py
    │   │   └── db_compat.py
    │   ├── tests/                  # 67 pytest tests
    │   └── config.py               # DEMO_MODE, ESPN_*, MOCK_MODE
    ├── frontend/
    │   ├── e2e/                    # Playwright specs
    │   ├── src/
    │   │   ├── styles/design-system.css
    │   │   ├── components/ui/      # Button, Card, Stepper, CountdownRing, …
    │   │   ├── components/layout/  # AppLayout, AuthShell
    │   │   ├── hooks/useRoomRealtime.ts
    │   │   ├── pages/RoomLivePage.tsx
    │   │   └── components/RoomChat.tsx
    │   └── vitest.config.ts
    ├── supabase/
    │   ├── schema.sql
    │   ├── phase2_migration.sql
    │       ├── 003_phase3_pitch_chips.sql
    │       ├── 004_phase3_sabotage.sql
    │       ├── 005_phase3_sides.sql
    │       └── 006_phase3_draft.sql
    ├── Makefile
    └── PROGRESS.md
```

---

## Frontend redesign (June 2026) ✅

Visual-only overhaul — **no backend, API, or business logic changes**. All `data-testid` attributes preserved; added `data-testid="realtime-indicator"` and `data-testid="room-code"` where E2E docs noted gaps.

### Design system

| Asset | Path |
|-------|------|
| Tokens + utilities | `frontend/src/styles/design-system.css` |
| Theme hook | `frontend/src/hooks/useTheme.ts` (`localStorage` key `pr-theme`, default dark) |
| Layout shell | `frontend/src/components/layout/AppLayout.tsx` |
| Auth shell | `frontend/src/components/layout/AuthShell.tsx` |
| UI primitives | `frontend/src/components/ui/` — Button, Card, Badge, Input, Modal, BottomSheet, Spinner, Stepper, CountdownRing, Tabs, ThemeToggle, Avatar |

### Brand

- Electric green `#00E676`, gold `#FFD600`, party purple `#D500F9`
- Inter + JetBrains Mono via `index.html`
- Light/dark toggle in top nav (`ThemeToggle`)
- Mobile bottom nav: Home | Leaderboard | Groups | Profile

### Key screen updates

- **Home:** LIVE hero strip, group pills, skeleton loaders, underline tabs
- **Auth:** Centered card on grid pattern background
- **Predict:** `Stepper` score picker, side reveal (Framer Motion spring)
- **Draft:** `CountdownRing` (80px)
- **Live:** Sticky score bar, flash bet purple glow + `CountdownRing`, mobile Standings/Events/Chat tabs, sabotage FAB
- **Results:** Winner banner with staggered entrance
- **Leaderboard:** Period tabs, desktop podium, load-more pagination

### Verification

```bash
cd frontend
npm run build      # clean
npm run test:unit  # 10/10 passing
```

---

## Phase 4 — Production readiness (10/10)

### Ops & reliability

| Item | Status |
|------|--------|
| Feature flags (`FEATURE_*` env kill switches) | Done — backend guards + frontend `useFeatureFlags` |
| Host transfer API + UI | Done — `POST /transfer-host`, Host panel “Make host” |
| Orphan room cleanup | Done — event pipeline `cleanup_orphan_host_rooms()` |
| Product telemetry | Done — `analytics_events` table, `/api/events`, funnel metrics |
| Sentry (backend + frontend) | Done — optional via `SENTRY_DSN` / `VITE_SENTRY_DSN` |
| Health endpoint enrichment | Done — flags, sentry, telemetry_24h |
| Load test script | Done — `backend/scripts/load_test_rooms.py` |
| RUNBOOK.md + DEPLOY.md | Done |
| Staging deploy verify workflow | Done — `.github/workflows/deploy-staging.yml` |
| PR E2E smoke (home page) | Done — `test.yml` job `e2e-smoke` |
| Docker + Railway + Vercel config | Done — `Dockerfile`, `railway.toml`, `vercel.json` |
| Migration `007_phase4_ops.sql` | **Apply in Supabase** before prod telemetry |

### Verification

```bash
cd backend
pytest tests/ -v --tb=short

cd ../frontend
npm run build
npm run test:unit
```

### Deploy checklist

1. Apply migration **`007`** in Supabase SQL Editor
2. Deploy backend to Railway (see `DEPLOY.md`)
3. Deploy frontend to Vercel
4. Run deploy-staging workflow against API URL
5. Optional: `python scripts/load_test_rooms.py --rooms 50 --token <jwt>`

### Before merge to `main`

1. Run migrations **`003`–`007`** in Supabase SQL Editor (in order)
2. Open PR: [compare `main`...`feat/phase3-sabotage`](https://github.com/yshams-03/pitch-roulette/compare/main...feat/phase3-sabotage)
3. Confirm CI green (`backend` + `frontend-unit` + `e2e-smoke`)
4. Merge PR

