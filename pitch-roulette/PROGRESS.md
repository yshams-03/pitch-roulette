# Pitch Roulette — Project Progress

**Last updated:** 17 June 2026  
**Status:** Phase 2 feature-complete; demo sandbox for end-to-end testing without live matches

---

## Overview

Pitch Roulette is a World Cup prediction app. Users sign up, join friend groups, compete on leaderboards, and create **prediction rooms** during live matches. Phase 1 covered score predictions and PP awards. **Phase 2** adds realtime rooms, flash bets, knockout bracket, in-room chat/reactions, host control panel, ESPN live events, and a **demo sandbox** (France vs Netherlands mock match).

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
- `flash_bet_generator.py` polls LIVE rooms every 30s (skips demo rooms)
- `GET /api/espn/events/{espn_event_id}` proxy endpoint
- Config: `ESPN_ENABLED`, `ESPN_LEAGUE_SLUG` in `backend/.env`

### 4. Demo sandbox ✅

Full match flow **without a real live fixture** — for testing predictions, flash bets, and PP.

| Piece | Path / detail |
|-------|----------------|
| Enable | `DEMO_MODE=true` in `backend/.env` |
| Entry | `/demo` → **Enter demo match** |
| Match | France vs Netherlands, 3 bot players (Alex, Sam, Jordan) |
| Flow | LOBBY → PREDICTING → CLOSED → LIVE → RESULTS (normal room routes) |
| Auto events | `demo_auto_events.py` injects random goals/cards/penalties every ~18s |
| Bot behaviour | Bots submit predictions + answer flash bets; resolve after host answers or 20s grace |
| API | `/api/demo/start`, `/api/demo/rooms/{code}`, inject/resolve/end helpers |

**Demo go-live** uses local `match_data` (no Football-Data/ESPN). `normalize_demo_match_data()` repairs stale rows on API read.

### 5. Knockout bracket ✅

- New **Bracket** tab on home page
- Rounds: R32 → R16 → QF → SF → Final (from match `stage` field)
- TBD teams handled safely
- Tap match → modal with score / create room if live

### 6. Chat + reactions ✅

- Collapsible chat on live page (`room_messages` table + Realtime)
- Paginated: last 50, load older on scroll
- Basic profanity filter (backend)
- Host can soft-delete messages
- 6 emoji reactions via Supabase **broadcast** (ephemeral, 2s rate limit)

### 7. Host control panel ✅

- `/host/:code` — host-only (validates `host_id` on every API call)
- Phase buttons: Start predictions → Lock → Go live → End match
- Flash bet presets + custom builder + resolve
- Kick players, toggle chat on/off
- Live score display

---

## Updated room flow

```
/demo (optional) → /lobby → /predict → /live → /results
```

**State machine:**

```
LOBBY → PREDICTING → CLOSED → LIVE → FULL_TIME → RESULTS
```

| Step | Route | What happens |
|------|-------|--------------|
| Demo entry | `/demo` | Creates demo room in LOBBY, redirects to lobby |
| Lobby | `/room/:code/lobby` | Players join, host starts predictions |
| Predict | `/room/:code/predict` | Score predictions, host locks, host goes live |
| Live | `/room/:code/live` | Flash bets, match events feed (demo), chat, reactions |
| Results | `/room/:code/results` | Prediction PP awarded on **End match** |
| Host panel | `/host/:code` | Second-screen controls for host |

**Breaking change from Phase 1:** `POST /close` now only **locks** predictions (CLOSED). Host must **Go live** then **End match** to award prediction PP.

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
| Backend | FastAPI, Uvicorn, Pydantic, httpx |
| Database | Supabase PostgreSQL + **Realtime** |
| Auth | Supabase Auth + JWT (backend) |
| Sports API | Football-Data.org v4 + ESPN (live events) |

---

## Database — Phase 2 additions

**Existing DBs:** run `supabase/phase2_migration.sql` in Supabase SQL Editor.

**Fresh installs:** `supabase/schema.sql` includes Phase 2 tables.

| Table / column | Purpose |
|----------------|---------|
| `rooms.state` | Added LIVE, FULL_TIME |
| `rooms.chat_enabled` | Host toggle |
| `rooms.last_seen_event_key` | Auto flash bet dedup |
| `rooms.espn_event_id` | ESPN match cursor for live events |
| `room_players.session_pp` | Flash bet PP in session |
| `flash_bets` | Flash bet lifecycle |
| `flash_bet_answers` | Player answers + PP change |
| `room_messages` | In-room chat |

Realtime enabled on: `flash_bets`, `flash_bet_answers`, `room_messages`, `rooms`, `room_players`, `predictions` (see `schema.sql`).

---

## New API routes

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/rooms/{code}/lock` | PREDICTING → CLOSED |
| POST | `/api/rooms/{code}/go-live` | CLOSED → LIVE (+ ESPN bootstrap for real rooms) |
| POST | `/api/rooms/{code}/end` | LIVE → RESULTS + award PP |
| GET/POST | `/api/rooms/{code}/flash-bets` | List / create flash bets |
| POST | `/api/rooms/{code}/flash-bets/{id}/answer` | Submit answer |
| POST | `/api/rooms/{code}/flash-bets/{id}/resolve` | Host resolves + awards PP |
| GET | `/api/rooms/{code}/flash-bets/{id}/results` | Answer breakdown |
| GET/POST | `/api/rooms/{code}/messages` | Chat |
| DELETE | `/api/rooms/{code}/messages/{id}` | Host soft-delete |
| POST | `/api/rooms/{code}/chat-toggle` | Enable/disable chat |
| POST | `/api/rooms/{code}/kick` | Remove player |
| GET | `/api/espn/events/{espn_event_id}` | ESPN live snapshot proxy |
| GET | `/api/demo/enabled` | Demo mode flag |
| POST | `/api/demo/start` | Create demo room (default LOBBY) |
| GET | `/api/demo/rooms/{code}` | Demo status + events + flash bets |
| POST | `/api/demo/rooms/{code}/inject-event` | Manual event inject (dev) |
| POST | `/api/demo/rooms/{code}/inject-random` | Random event inject (dev) |
| POST | `/api/demo/rooms/{code}/bot-answers` | Force bot flash answers |
| POST | `/api/demo/rooms/{code}/resolve-active` | Resolve open bet |
| POST | `/api/demo/rooms/{code}/end` | End demo match |

`POST /close` remains as alias for `/lock` (Phase 1 compat).

---

## Key files

| Area | Path |
|------|------|
| Realtime hook | `frontend/src/hooks/useRoomRealtime.ts` |
| Live page | `frontend/src/pages/RoomLivePage.tsx` |
| Demo entry | `frontend/src/pages/DemoSandboxPage.tsx` |
| Host panel | `frontend/src/pages/HostPanelPage.tsx` |
| Bracket | `frontend/src/components/KnockoutBracket.tsx` |
| Flash bet UI | `frontend/src/components/FlashBetCard.tsx` |
| Chat | `frontend/src/components/RoomChat.tsx` |
| Reactions | `frontend/src/components/ReactionOverlay.tsx` |
| Flash bets | `backend/services/flash_bets.py` |
| ESPN poller (real rooms) | `backend/services/flash_bet_generator.py` |
| ESPN client | `backend/services/espn.py` |
| Demo match + inject | `backend/services/demo_match.py` |
| Demo bots | `backend/services/demo_bots.py` |
| Demo auto events | `backend/services/demo_auto_events.py` |
| Demo router | `backend/routers/demo.py` |
| Room snapshot | `backend/services/room_snapshot.py` |
| Chat service | `backend/services/room_messages.py` |
| Migration | `supabase/phase2_migration.sql` |

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

### Before testing Phase 2

1. Run **`supabase/phase2_migration.sql`** in Supabase SQL Editor (if you already ran Phase 1 schema)
2. Set **`DEMO_MODE=true`** in `backend/.env` for demo sandbox
3. Restart backend (flash bet generator + demo auto-events start on app lifespan)
4. Ensure Realtime is enabled for new tables in Supabase dashboard
5. **Windows:** if port 8000 hangs, kill stray `python.exe` processes and restart a single uvicorn instance

### Demo test flow (recommended)

1. Log in → open **`/demo`** → **Enter demo match**
2. Lobby → **Start predictions** → go to predict page
3. Lock your score → **Lock predictions** → **Go live**
4. On live page: watch **Match events**, answer **flash bets** (30s window)
5. **End match** → check results PP

Verify: `GET http://localhost:8000/api/health` → `demo_mode: true`

---

## Phase 2 limitations / follow-ups

| Item | Notes |
|------|-------|
| Real rooms need live fixture | Room create still requires Football-Data live match; use **demo** for offline testing |
| ESPN on Windows dev | SSL/cert issues possible when calling ESPN directly from dev machine; backend proxies ESPN |
| Auto flash bets (real) | Driven by ESPN `details[]`; score fallback if ESPN missing |
| Bracket SVG connectors | Horizontal scroll columns; no SVG lines yet |
| `FULL_TIME` state | Not auto-set from match API; host ends from LIVE |
| Underdog bonus | Spec mentioned for flash bets — not implemented |
| Host message delete UI | API exists; live page doesn't expose delete button yet |
| E2E tests | Not updated for Phase 2 room flow |

---

## Not built (Phase 3)

- Fantasy draft / player picks
- Sabotage shop / Pitch Chips
- Side assignment
- Scouting page
- Push notifications
- Share cards / monetization

---

## Issues fixed (recent)

| Issue | Fix |
|-------|-----|
| Demo sandbox disabled / stale `DEMO_MODE` | Load `.env` before imports; `reload_settings()` in lifespan |
| Backend hang / timeouts | Flash generator skipped demo rooms; kill zombie uvicorn on :8000 |
| Live page black screen | `room.match_id` accessed before null check on `RoomLivePage` |
| Demo scoreboard blank (T / T) | Demo go-live preserves teams; `normalize_demo_match_data()` on read |
| Events not visible on live page | 2s polling + **Match events** panel + toasts |
| Flash bet Yes/No not clickable | 30s demo window; accept OPEN/LOCKED + 5s grace; wait for host answer before auto-resolve |
| Bets “not accepted” | Option normalization; optimistic UI; auto-join room on live page |
| Knockout null team names | `TBD` fallback in backend + `TeamCrest` |
| Room polling only | `useRoomRealtime` + fallback |
| Phase 1 close skipped LIVE | Split into lock → go-live → end |

---

## Repo structure

```
pitch-roulette/
├── backend/
│   ├── routers/
│   │   ├── rooms.py
│   │   └── demo.py
│   ├── services/
│   │   ├── flash_bets.py
│   │   ├── flash_bet_generator.py
│   │   ├── demo_match.py
│   │   ├── demo_bots.py
│   │   ├── demo_auto_events.py
│   │   ├── espn.py
│   │   ├── sports_service.py
│   │   ├── room_snapshot.py
│   │   └── room_messages.py
│   ├── config.py              # DEMO_MODE, ESPN_*
│   └── main.py                # lifespan: flash generator + demo auto-events
├── frontend/src/
│   ├── hooks/useRoomRealtime.ts
│   ├── pages/
│   │   ├── RoomLivePage.tsx
│   │   ├── DemoSandboxPage.tsx
│   │   └── HostPanelPage.tsx
│   └── components/
│       ├── KnockoutBracket.tsx
│       ├── FlashBetCard.tsx
│       └── ...
├── shared/types.ts
├── supabase/
│   ├── schema.sql
│   └── phase2_migration.sql
└── PROGRESS.md
```

---

## Next: Phase 3

Sabotage shop, Pitch Chips, side assignment, fantasy draft — prompt TBD.
