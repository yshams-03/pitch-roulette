# Pitch Roulette — Complete Application Documentation

> Real-time football party game that runs on players' phones during a live match.  
> No native app. No downloads. Just a shared URL.

---

## Table of Contents

1. [Overview](#1-overview)
2. [Architecture](#2-architecture)
3. [Project Structure](#3-project-structure)
4. [Tech Stack](#4-tech-stack)
5. [Environment Variables](#5-environment-variables)
6. [Database Schema](#6-database-schema)
7. [Game Flow & State Machine](#7-game-flow--state-machine)
8. [Business Logic Reference](#8-business-logic-reference)
9. [Backend API Reference](#9-backend-api-reference)
10. [Backend Services](#10-backend-services)
11. [Frontend Routes & Pages](#11-frontend-routes--pages)
12. [Frontend Components](#12-frontend-components)
13. [State Management](#13-state-management)
14. [Realtime & Polling](#14-realtime--polling)
15. [Session & Security](#15-session--security)
16. [Error Handling](#16-error-handling)
17. [Local Development](#17-local-development)
18. [Deployment](#18-deployment)
19. [Known Limitations](#19-known-limitations)

---

## 1. Overview

**Pitch Roulette** is a multiplayer game designed for watch parties during live football matches. Players join via a 6-character room code on their phones, get assigned to Team A or Team B, pick fantasy players, place flash bets on live events, deploy sabotage tokens against opponents, and compete for Pitch Chips (PC).

### Core Features

| Module | Description |
|--------|-------------|
| **Lobby** | Create/join rooms, invite via link or code |
| **Team Assignment** | Random A/B split with optional team switch (penalty) |
| **Scouting Hub** | Tactical pitch view with real lineup data |
| **Fantasy Draft** | Pick 3 players; earn/lose PC from live ratings |
| **Flash Bets** | 15-second betting windows triggered by match events |
| **Sabotage** | 5 token types to disrupt opponents |
| **Trash Talk Chat** | In-game chat with emoji picker |
| **Host Panel** | Separate route for match flow control |
| **Results** | Leaderboard, shareable card, rematch |

### Design Principles

- **Mobile-first** — built for 390px width screens
- **Server-authoritative** — all chip arithmetic happens in the backend
- **Realtime sync** — Supabase Realtime pushes state to all clients
- **No mock data** — loading skeletons while fetching real API data
- **sessionStorage** — tokens die with the browser tab (not localStorage)

---

## 2. Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        PLAYERS (Mobile Browsers)                │
│  React SPA  │  Zustand Store  │  Supabase Realtime (read-only)  │
└─────────────┬───────────────────────────────┬───────────────────┘
              │ HTTP REST                      │ WebSocket (Realtime)
              ▼                                ▼
┌─────────────────────────────┐    ┌─────────────────────────────┐
│   FastAPI Backend (Python)  │    │   Supabase (PostgreSQL)     │
│   - All writes              │◄──►│   - rooms, players, bets... │
│   - Game engine             │    │   - Realtime publication    │
│   - Sports API proxy        │    └─────────────────────────────┘
└─────────────┬───────────────┘
              │ HTTPS
              ▼
┌─────────────────────────────┐
│   API-Football (api-sports)   │
│   - Fixtures, lineups, events │
└─────────────────────────────┘
```

### Request Flow Example: Place Wager

1. Player moves slider in `FlashBetOverlay` and taps Confirm
2. Frontend `POST /flash-bets/wager` with `session_token`
3. Backend validates: player exists, room is `LIVE`, bet is `OPEN`, no duplicate wager, sufficient balance
4. Backend deducts PC from `players.balance`, inserts `wagers` row
5. Supabase Realtime pushes `players` update → all clients see new balance
6. On resolve: `bet_resolver` pays winners, updates balances again via Realtime

---

## 3. Project Structure

```
pitch-roulette/
├── README.md                    # Quick start guide
├── APP_DOCUMENTATION.md         # This file
├── .gitignore
│
├── shared/
│   └── types.ts                 # Shared TypeScript interfaces
│
├── supabase/
│   └── schema.sql               # Full database schema (run in SQL Editor)
│
├── backend/
│   ├── main.py                  # FastAPI app entry, CORS, routers
│   ├── config.py                # Settings, state machine, sabotage costs
│   ├── database.py              # Supabase client singleton
│   ├── models.py                # Pydantic request/response models
│   ├── requirements.txt
│   ├── Procfile                 # Railway/Render start command
│   ├── .env                     # Secrets (not committed)
│   ├── .env.example
│   ├── routers/
│   │   ├── rooms.py             # Room CRUD, state, host actions
│   │   ├── players.py           # Switch team, fantasy picks, /me
│   │   ├── flash_bets.py        # Wagers, active bet, resolve
│   │   ├── sabotage.py          # Deploy tokens, list active
│   │   ├── chat.py              # Send/fetch messages
│   │   ├── sports.py            # API-Football proxy
│   │   └── webhooks.py          # Incoming sports events
│   └── services/
│       ├── game_engine.py       # State machine, teams, flash bets, events
│       ├── sports_api.py        # API-Football client + live polling
│       ├── bet_resolver.py      # Flash bet payout logic
│       └── fantasy.py           # Fantasy picks + live scoring
│
└── frontend/
    ├── package.json
    ├── vite.config.ts           # Build + code splitting
    ├── vercel.json              # SPA rewrites
    ├── index.html               # Fonts, meta, root mount
    ├── .env                     # VITE_* vars (not committed)
    ├── .env.example
    └── src/
        ├── main.tsx
        ├── App.tsx              # Router + session restore + toast
        ├── index.css            # Tailwind v4 + design tokens
        ├── pages/               # Route-level screens (7 pages)
        ├── components/          # Reusable UI (12 components)
        ├── hooks/               # Realtime + live polling
        ├── store/
        │   └── gameStore.ts     # Zustand global state
        └── lib/
            ├── api.ts           # Backend HTTP client
            ├── session.ts       # sessionStorage helpers
            └── supabase.ts      # Supabase client (Realtime only)
```

---

## 4. Tech Stack

| Layer | Technology | Version / Notes |
|-------|------------|-----------------|
| Frontend framework | React | 19.x |
| Build tool | Vite | 8.x |
| Styling | Tailwind CSS | v4 (`@tailwindcss/vite`) |
| Routing | React Router | v7 |
| State | Zustand | v5 |
| Animation | Framer Motion | v12 |
| Toasts | react-hot-toast | |
| UI primitives | Radix Slider | Wager amount slider |
| Icons | lucide-react | |
| Share cards | html-to-image | PNG export on results screen |
| Realtime | @supabase/supabase-js | Subscriptions only |
| Backend | FastAPI | Python 3.11+ |
| ASGI server | Uvicorn | |
| Database | Supabase (PostgreSQL) | |
| Sports data | API-Football | api-sports.io |
| Rate limiting | slowapi | Room create/join limits |
| HTTP client | httpx | Sports API + Supabase |

---

## 5. Environment Variables

### Frontend — `frontend/.env`

| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_BACKEND_URL` | Yes | FastAPI URL, e.g. `http://localhost:8000` |
| `VITE_SUPABASE_URL` | Yes | `https://<project>.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | Yes | Legacy **anon** JWT key (safe in browser) |

> **Never** put `service_role` or API-Football keys in the frontend.

### Backend — `backend/.env`

| Variable | Required | Description |
|----------|----------|-------------|
| `SUPABASE_URL` | Yes | Same project URL as frontend |
| `SUPABASE_SERVICE_KEY` | Yes | Legacy **service_role** JWT key |
| `SPORTS_API_KEY` | Yes | API-Football key (`x-apisports-key`) |
| `SPORTS_API_BASE` | No | Default: `https://v3.football.api-sports.io` |
| `SECRET_KEY` | No | Reserved for future JWT use |
| `FRONTEND_URL` | Yes | CORS origin, e.g. `http://localhost:5173` |
| `EXTRA_CORS_ORIGINS` | No | Comma-separated extra CORS origins |

### File Rules

| File | Purpose |
|------|---------|
| `.env` | Real secrets — **app reads this** |
| `.env.example` | Template with placeholders — safe to commit |

---

## 6. Database Schema

Run `supabase/schema.sql` in the Supabase SQL Editor before first use.

### Entity Relationship Diagram

```
rooms ─────┬────< players
           ├────< fantasy_picks
           ├────< flash_bets ────< wagers
           ├────< sabotages
           ├────< chat_messages
           └────< fantasy_scores

players ───┬────< fantasy_picks
           ├────< wagers
           ├────< fantasy_scores
           ├────< sabotages (as sender_id / target_id)
           └────< chat_messages
```

### Table Reference

#### `rooms`

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `code` | VARCHAR(6) | Unique join code |
| `host_player_id` | UUID | FK → players |
| `match_id` | VARCHAR(50) | API-Football fixture ID |
| `match_name` | VARCHAR(200) | Display name |
| `team_a_name` / `team_b_name` | VARCHAR(100) | Team labels |
| `state` | VARCHAR(20) | Game phase (see state machine) |
| `settings` | JSONB | Room configuration |
| `underdog_team` | VARCHAR(1) | `A` or `B` or null |
| `underdog_multiplier` | DECIMAL | Payout boost for minority team |
| `squad_strength_a/b` | DECIMAL | SSR from lineups |
| `handicap_active` | BOOLEAN | Handicap flag |
| `expires_at` | TIMESTAMPTZ | Auto-expire after 8 hours |

**Default `settings` JSON:**
```json
{
  "allow_switching": true,
  "module_fantasy": true,
  "module_flash_bets": true,
  "module_sabotage": true,
  "chaos_frequency": "medium",
  "api_buffer_seconds": 3,
  "custom_switch_penalty": null
}
```

#### `players`

| Column | Type | Default | Description |
|--------|------|---------|-------------|
| `balance` | INTEGER | 1000 | Pitch Chips (PC) |
| `assigned_team` | VARCHAR(1) | null | `A` or `B` |
| `switched_team` | BOOLEAN | false | One switch allowed |
| `switch_penalty_paid` | INTEGER | 0 | PC paid to switch |
| `is_host` | BOOLEAN | false | Room host flag |
| `is_connected` | BOOLEAN | true | Presence indicator |
| `session_token` | VARCHAR(64) | — | Unique auth token |

#### `flash_bets`

| State | Meaning |
|-------|---------|
| `FROZEN` | Odds locking — no wagers yet |
| `OPEN` | 12-second betting window |
| `CLOSED` | No more wagers |
| `RESOLVED` | Winner paid out |

`options` JSONB example:
```json
{
  "option_a": { "label": "Goal", "multiplier": 1.3 },
  "option_b": { "label": "Save", "multiplier": 3.5 }
}
```

#### `sabotages` — Token Types

`BLINDFOLD` | `TAX_COLLECTOR` | `CHAT_SILENCER` | `JINX` | `MIRROR`

#### `fantasy_scores`

Unique constraint: `(player_id, room_id, api_player_id)`

### Realtime

These tables are added to `supabase_realtime` publication:
`rooms`, `players`, `flash_bets`, `wagers`, `sabotages`, `chat_messages`, `fantasy_scores`

RLS is **disabled** on all tables — backend uses service role key for all writes.

---

## 7. Game Flow & State Machine

### State Diagram

```
LOBBY ──► SCOUTING ──► DRAFT_LOCKED ──► LIVE ──► FULL_TIME ──► RESULTS
  │            │              │            │            │
  │            │              │            │            └── Terminal
  │            │              │            └── Auto on FT (polling/webhook)
  │            │              └── Host advances
  │            └── Host start-draft (also allocates teams)
  └── Players join here only
```

### Phase Details

| Phase | Route | What Happens |
|-------|-------|--------------|
| **LOBBY** | `/room/:code/lobby` | Players join; host picks match; invite friends |
| **SCOUTING** | `/room/:code/scouting` | Teams revealed; lineup scouting; optional switch |
| **DRAFT_LOCKED** | `/room/:code/draft` | Each player locks 3 fantasy picks |
| **LIVE** | `/room/:code/live` | Flash bets, sabotage, chat, fantasy tracking |
| **FULL_TIME** | (still on live route briefly) | Match ended; polling stops |
| **RESULTS** | `/room/:code/results` | Leaderboard, share card, rematch vote |

### Host Actions

| Action | Endpoint | Effect |
|--------|----------|--------|
| Start draft | `POST /rooms/{code}/start-draft` | LOBBY → SCOUTING + team allocation |
| Advance state | `POST /rooms/{code}/advance-state` | Move to next phase |
| Manual flash bet | `POST /rooms/{code}/manual-flash-bet` | Trigger test bet during LIVE |
| Kick player | `POST /rooms/{code}/kick` | Remove non-host player |
| Rematch | `POST /rooms/{code}/rematch` | New room, same settings |

Host panel lives at `/host/:code` on a separate device.

### Flash Bet Sub-State Machine

```
Created (FROZEN)
    │  wait api_buffer_seconds (default 3s)
    ▼
OPEN (12 seconds)
    │  timer expires
    ▼
CLOSED
    │  POST /flash-bets/resolve
    ▼
RESOLVED (payouts distributed)
```

Transitions run via `asyncio.create_task` + `asyncio.sleep` in-process (not cron).

---

## 8. Business Logic Reference

### Starting Balance

Every player starts with **1000 PC**.

### Switch Penalty

Function: `calculate_switch_penalty(lobby_size, custom_override)`

| Condition | Penalty (PC) |
|-----------|--------------|
| `custom_switch_penalty` set in settings | `clamp(value, 50, 500)` |
| Lobby ≤ 4 players | 250 |
| Lobby ≤ 8 players | 200 |
| Lobby ≤ 16 players | 150 |
| Lobby > 16 players | 100 |

Rules:
- One switch per player (`switched_team` flag)
- Only in `SCOUTING` or `DRAFT_LOCKED`
- Requires `settings.allow_switching = true`
- Recalculates underdog multiplier after switch

### Underdog Multiplier

Function: `calculate_underdog_multiplier(count_a, count_b)`

Applied to **flash bet payouts** for players on the minority team.

| Majority team share | Multiplier |
|---------------------|------------|
| ≥ 70% | 2.0× |
| ≥ 65% | 1.7× |
| ≥ 60% | 1.4× |
| ≥ 55% | 1.2× |
| < 55% | 1.0× (no underdog) |

### Flash Bets

**Creation timing:**
- `frozen_until` = now + `settings.api_buffer_seconds` (default 3s)
- `closes_at` = frozen_until + 12s

**Chaos frequency** (probability a non-critical bet is created on events):

| Setting | Chance |
|---------|--------|
| `low` | 30% |
| `medium` | 60% |
| `high` | 90% |

Always created (bypass chaos): `MANUAL`, `VAR_REVIEW`, `PENALTY`, `SUPER_SUB`

**Event → Bet mapping:**

| Match Event | Bet Type | Options |
|-------------|----------|---------|
| Goal | PULSE | Next Goal 2.5× / No More Goals 1.5× |
| VAR | VAR_REVIEW | Stands 1.8× / Overturned 2.1× |
| Penalty | PENALTY | Goal 1.3× / Save 3.5× / Miss 5.0× |
| Substitution | SUPER_SUB | Scores 5.0× / No Impact 1.2× |
| Possession shift ≥15% | MOMENTUM | Dominates 1.6× / Shifts 2.4× |

**Wager rules:**
- Amount: 10–500 PC, snapped to 50 PC increments
- One wager per player per flash bet
- Only when room state is `LIVE` and bet state is `OPEN`

**Payout formula:**
```
payout = floor(amount × option_multiplier × underdog_multiplier)
```
(underdog_multiplier applies only if player's team matches `rooms.underdog_team`)

### Sabotage Tokens

| Token | Cost | Duration | Effect |
|-------|------|----------|--------|
| BLINDFOLD | 150 PC | 15 min | Blurs scouting hub for target |
| TAX_COLLECTOR | 200 PC | 10 min | Steals min(100, target balance) |
| CHAT_SILENCER | 100 PC | 3 min | Blocks chat input (403 on send) |
| JINX | 175 PC | 5 min | Deployed; no additional gameplay effect yet |
| MIRROR | 125 PC | 4 min | Reverses Yes/No labels on 2-option flash bets |

Deploy rules:
- Target must be on opposing team
- Cannot target self or teammates
- Allowed in `LIVE`, `SCOUTING`, `DRAFT_LOCKED`

### Fantasy Scoring

**Draft:** Exactly 3 players from confirmed lineups.

**Live rating bonuses/penalties** (on rating cross):

| Event | PC Change | Trigger |
|-------|-----------|---------|
| Rating crosses 8.0↑ | +50 PC | `bonus_pc += 50` |
| Rating crosses 4.0↓ | −50 PC | `penalty_pc += 50` |
| Yellow card | −25 PC | Event handler |
| Red card | −50 PC | Event handler |

**Score formula:**
```
total_fantasy_score = current_rating + (bonus_pc / 100) - (penalty_pc / 100)
```

### Squad Strength & Handicap

```python
compute_ssr(lineup) → average player rating (default 6.5 if missing)
apply_handicap_if_needed(ssr_a, ssr_b):
  if abs(ssr_a - ssr_b) >= 10 → weaker team gets 0.5 bonus
```

### Live Polling (API-Football)

When room enters `LIVE`:
- Poll every **30 seconds**
- Compare new events → `handle_event()`
- Update momentum from possession stats
- Sync fantasy ratings from player data
- Auto-advance to `FULL_TIME` on fixture status `FT` / `AET` / `PEN`
- Stop polling on `FULL_TIME` or `RESULTS`

---

## 9. Backend API Reference

Base URL: `http://localhost:8000` (dev) or your Railway/Render URL (prod).

### Health

```
GET /health
→ { "status": "ok", "timestamp": "2026-06-11T..." }
```

### Rooms

| Method | Path | Rate Limit | Description |
|--------|------|------------|-------------|
| POST | `/rooms/create` | 10/hour/IP | Create room + host player |
| POST | `/rooms/join` | 30/hour/IP | Join existing lobby |
| GET | `/rooms/{code}` | — | Full room snapshot + players |
| PATCH | `/rooms/{code}/settings` | — | Host updates settings |
| POST | `/rooms/{code}/start-draft` | — | Allocate teams → SCOUTING |
| POST | `/rooms/{code}/advance-state` | — | Host advances state machine |
| POST | `/rooms/{code}/manual-flash-bet` | — | Host triggers test bet |
| POST | `/rooms/{code}/kick` | — | Host removes player |
| POST | `/rooms/{code}/rematch` | — | New room, same config |

**Create room request:**
```json
{
  "nickname": "Yassin",
  "match_id": "1234567",
  "match_name": "Arsenal vs Chelsea",
  "team_a_name": "Arsenal",
  "team_b_name": "Chelsea"
}
```

**Create room response:**
```json
{
  "room_id": "uuid",
  "code": "ABC123",
  "host_token": "64-char-hex",
  "player_id": "uuid"
}
```

### Players

| Method | Path | Description |
|--------|------|-------------|
| GET | `/players/me?session_token=...` | Current player + fantasy data |
| POST | `/players/switch-team` | Pay penalty, flip team |
| POST | `/players/fantasy/pick` | Submit 3 fantasy picks |

### Flash Bets

| Method | Path | Description |
|--------|------|-------------|
| GET | `/flash-bets/{room_id}/active` | Current FROZEN/OPEN bet |
| POST | `/flash-bets/wager` | Place wager on open bet |
| POST | `/flash-bets/resolve` | Resolve bet + pay winners |

### Sabotage

| Method | Path | Description |
|--------|------|-------------|
| POST | `/sabotage/deploy` | Buy + deploy token on target |
| GET | `/sabotage/{room_id}/active?session_token=...` | Active tokens affecting you |

### Chat

| Method | Path | Description |
|--------|------|-------------|
| POST | `/chat/send` | Send message |
| GET | `/chat/{room_id}/messages?limit=50` | Fetch recent messages |

### Sports (API-Football Proxy)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/sports/search-match?q=Arsenal` | Search upcoming fixtures |
| GET | `/sports/lineups/{match_id}` | Confirmed lineups + SSR |
| GET | `/sports/live/{match_id}` | Score, clock, events, stats |

### Webhooks

| Method | Path | Description |
|--------|------|-------------|
| POST | `/webhooks/sports-event` | Push match events to active rooms |

**Webhook body:**
```json
{
  "fixture_id": 1234567,
  "event_type": "goal",
  "event": { "type": "Goal", "team": { "name": "Arsenal" } }
}
```

### Common Error Responses

| Status | `error` | Meaning |
|--------|---------|---------|
| 401 | `unauthorized` | Invalid/missing session token |
| 403 | `not_host` | Host-only action |
| 403 | `silenced` | Chat silencer active |
| 404 | `room_not_found` | Bad room code |
| 409 | `invalid_state` | Action not allowed in current phase |
| 409 | `already_wagered` | Duplicate wager on same bet |
| 409 | `bet_not_open` | Bet not in OPEN state |
| 400 | `insufficient_balance` | Not enough PC |

409 invalid_state shape:
```json
{
  "error": "invalid_state",
  "current": "LOBBY",
  "required": "LIVE"
}
```

---

## 10. Backend Services

### `game_engine.py`

Core game logic and state management.

| Function | Purpose |
|----------|---------|
| `generate_room_code()` | Random 6-char alphanumeric code |
| `generate_session_token()` | 64-char hex token |
| `calculate_switch_penalty()` | PC cost by lobby size |
| `calculate_underdog_multiplier()` | Minority team payout boost |
| `compute_ssr()` | Squad strength from lineup ratings |
| `apply_handicap_if_needed()` | Handicap if SSR diff ≥ 10 |
| `allocate_teams()` | Shuffle players into A/B + underdog |
| `advance_room_state()` | Validate + apply state transition |
| `create_flash_bet()` | Insert bet + schedule timers |
| `schedule_bet_transitions()` | FROZEN→OPEN→CLOSED async tasks |
| `handle_event()` | Route API-Football events to game actions |
| `update_momentum()` | Detect possession shifts |
| `send_system_message()` | Insert system chat message |
| `validate_host()` | Ensure session token is room host |
| `validate_state()` | Ensure room is in required phase |

### `sports_api.py`

| Function | Purpose |
|----------|---------|
| `_api_get()` | HTTP GET with cache + rate-limit fallback |
| `search_fixtures()` | `GET /fixtures?search=&status=NS` |
| `get_lineups()` | `GET /fixtures/lineups` |
| `get_live_events()` | `GET /fixtures/events` |
| `get_live_stats()` | `GET /fixtures/statistics` |
| `get_player_ratings()` | `GET /fixtures/players` |
| `get_fixture()` | `GET /fixtures?id=` |
| `start_live_polling()` | 30s loop during LIVE |
| `stop_polling()` | Cancel polling for room |

### `bet_resolver.py`

| Function | Purpose |
|----------|---------|
| `resolve_flash_bet()` | Mark winner, calculate payouts, update balances |

### `fantasy.py`

| Function | Purpose |
|----------|---------|
| `submit_fantasy_picks()` | Save 3 picks + init score rows |
| `sync_fantasy_ratings()` | Update ratings from live API data |
| `update_fantasy_scores_from_event()` | Card penalties from events |

---

## 11. Frontend Routes & Pages

Configured in `src/App.tsx` via React Router v6.

| Route | Component | Entry Condition |
|-------|-----------|-----------------|
| `/` | `LandingPage` | Always |
| `/room/:code/lobby` | `LobbyPage` | After create/join |
| `/room/:code/scouting` | `ScoutingPage` | `roomState === SCOUTING` |
| `/room/:code/draft` | `DraftPage` | `roomState === DRAFT_LOCKED` |
| `/room/:code/live` | `LivePage` | `roomState === LIVE` or `FULL_TIME` |
| `/room/:code/results` | `ResultsPage` | `roomState === RESULTS` |
| `/host/:code` | `HostPage` | Host only, separate device |
| `*` | Redirect → `/` | Unknown routes |

### Auto-Navigation

All room pages watch `roomState` from Zustand (updated via Realtime) and redirect to the correct route when the host advances the game.

### Landing Page Flows

**Create session:**
1. Enter nickname
2. Optionally search + select a match (API-Football)
3. `POST /rooms/create` → save session → navigate to lobby

**Join session:**
1. Enter nickname + 6-char code (or `/?join=ABC123` prefill)
2. `POST /rooms/join` → save session → navigate to current phase route

---

## 12. Frontend Components

### Layout & Status

| Component | File | Purpose |
|-----------|------|---------|
| `ChipBalance` | `ChipBalance.tsx` | Animated PC counter; red pulse below 200 PC |
| `ReconnectBanner` | `ReconnectBanner.tsx` | "Reconnecting..." when Realtime drops |

### Game Phase Components

| Component | Used On | Purpose |
|-----------|---------|---------|
| `TeamAssignmentReveal` | Scouting | Full-screen team reveal + switch option |
| `ScoutingHub` | Scouting | SVG pitch, formation nodes, player sheet |
| `FlashBetOverlay` | Live | Bottom sheet: countdown ring, slider, wager |
| `FantasyTracker` | Live | 3 player cards with live ratings |
| `SabotageShop` | Live | Slide-up drawer with 5 tokens |
| `TrashTalkChat` | Live | Floating chat bubble + drawer |
| `MomentumIndicator` | Live | Possession bar |
| `SuperSubAlert` | Live | 20s countdown banner for super sub bets |
| `HostControlPanel` | Host route | State controls, stats, kick, manual bet |
| `PostMatchBreakdown` | Results | Leaderboard, share PNG, rematch, poll |

### Design Tokens (`index.css`)

| Token | Value | Usage |
|-------|-------|-------|
| `pitch-black` | `#0D0D0F` | Background |
| `pitch-dark` | `#141417` | Input backgrounds |
| `pitch-card` | `#1A1A1F` | Card surfaces |
| `pitch-border` | `#2A2A32` | Borders |
| `pitch-green` | `#39FF14` | Primary accent |
| `pitch-amber` | `#F5A623` | Warnings, system messages |
| `pitch-red` | `#C0392B` | Errors, sabotage |
| `pitch-muted` | `#6B7280` | Secondary text |

Fonts: **Inter** (UI), **JetBrains Mono** (balances, codes, timers)

---

## 13. State Management

### Zustand Store — `src/store/gameStore.ts`

#### Identity
```typescript
sessionToken: string | null
playerId: string | null
roomCode: string | null
roomId: string | null
isHost: boolean
isReconnecting: boolean
```

#### Room
```typescript
roomState: 'LOBBY' | 'SCOUTING' | 'DRAFT_LOCKED' | 'LIVE' | 'FULL_TIME' | 'RESULTS'
players: Player[]
settings: RoomSettings
```

#### Player
```typescript
myBalance: number          // default 1000
myTeam: 'A' | 'B' | null
myFantasyPicks: FantasyPick[]
myFantasyScores: FantasyScore[]
```

#### Live Game
```typescript
activeBet: FlashBet | null
activeSabotages: Sabotage[]
chatMessages: ChatMessage[]
```

#### Match
```typescript
matchId: string | null
teamAName: string
teamBName: string
liveScore: { a: number; b: number }
matchClock: string
underdogTeam: 'A' | 'B' | null
underdogMultiplier: number
handicapActive: boolean
lineupPlayers: LineupPlayer[]
```

#### Key Actions
- `hydrateFromRoom(room)` — populate store from `GET /rooms/{code}`
- `setPlayers(players)` — also syncs `myBalance` and `myTeam` for current player
- `reset()` — clear all state on session end

### Session Storage — `src/lib/session.ts`

```typescript
interface SessionData {
  sessionToken: string
  playerId: string
  roomCode: string
  isHost: boolean
}
```

Stored in `sessionStorage` under key `pitch_roulette_session`. Cleared when tab closes.

---

## 14. Realtime & Polling

### Supabase Realtime — `useRoomSubscription.ts`

Channel name: `room-{roomId}`

| Table | Filter | Updates |
|-------|--------|---------|
| `rooms` | `id=eq.{roomId}` | state, settings, underdog, handicap |
| `players` | `room_id=eq.{roomId}` | player list, balances, teams |
| `flash_bets` | `room_id=eq.{roomId}` | active bet overlay |
| `chat_messages` | `room_id=eq.{roomId}` INSERT | append message |
| `sabotages` | `room_id=eq.{roomId}` | re-fetch active vs self |
| `fantasy_scores` | `room_id=eq.{roomId}` | live fantasy ratings |

**Reconnection:** Exponential backoff 1s → 30s; shows `ReconnectBanner`.

### HTTP Polling

| Hook / Location | Interval | Data |
|-----------------|----------|------|
| `useLivePolling` | 15s | Score + match clock |
| `LivePage` (possession) | 120s | Ball possession stats |
| Backend `start_live_polling` | 30s | Events, stats, fantasy, FT detection |

---

## 15. Session & Security

### Authentication Model

- No user accounts — anonymous play via `session_token`
- Token generated server-side on create/join (`secrets.token_hex(32)`)
- Token passed in request body or query string
- Host validated by `is_host` flag + token match

### Key Security Rules

| Rule | Implementation |
|------|----------------|
| No localStorage for tokens | `sessionStorage` only |
| No API keys in frontend | Sports + service key backend-only |
| `.env` in `.gitignore` | Secrets never committed |
| Rate limits on public endpoints | slowapi on create/join |
| CORS restricted | `FRONTEND_URL` + optional extras |
| RLS disabled | Backend is sole write authority |

### SSL on Windows

`database.py` configures `certifi` CA bundle for Supabase HTTPS on Windows Python installs.

---

## 16. Error Handling

### Frontend

| Scenario | Behavior |
|----------|----------|
| Realtime disconnect | `ReconnectBanner` + exponential backoff |
| Insufficient balance on wager | Inline error on slider (no toast) |
| Room not found | Redirect to `/` with toast |
| Session expired | Clear storage, redirect to `/` |
| Flash bet closed before submit | Dismiss overlay + "Too slow!" toast |
| Chat silenced | Input replaced with countdown message |

### Backend

| Scenario | Behavior |
|----------|----------|
| Sports API rate limit | Serve cached last-known response |
| No lineups yet | `{ available: false }` |
| Invalid session token | HTTP 401 |
| Wrong game state | HTTP 409 with `invalid_state` |
| Duplicate wager | HTTP 409 `already_wagered` |

---

## 17. Local Development

### Prerequisites

- Node.js 18+
- Python 3.11+
- Supabase project (schema applied)
- API-Football key

### Setup Checklist

- [ ] Run `supabase/schema.sql` in Supabase SQL Editor
- [ ] Copy keys to `backend/.env` and `frontend/.env` (not `.env.example`)
- [ ] Install backend: `pip install -r requirements.txt`
- [ ] Install frontend: `npm install`

### Start Commands

```powershell
# Terminal 1 — Backend
cd "c:\Users\yassi\Downloads\world cup\pitch-roulette\backend"
.\venv\Scripts\Activate.ps1
uvicorn main:app --reload --port 8000

# Terminal 2 — Frontend
cd "c:\Users\yassi\Downloads\world cup\pitch-roulette\frontend"
npm run dev
```

### Verify

| Check | URL / Command |
|-------|---------------|
| API health | http://localhost:8000/health |
| Frontend | http://localhost:5173 |
| DB connection | `python -c "from database import get_supabase; print(get_supabase().table('rooms').select('id', count='exact').execute())"` |

### Test Flow

1. Create session on phone/browser 1
2. Copy room code; join on browser 2 (or incognito)
3. Open `/host/{code}` on browser 3 as host
4. Host: Start Draft → Advance through phases
5. During LIVE: trigger manual flash bet from host panel
6. Verify Realtime updates on all clients

---

## 18. Deployment

### Backend — Railway or Render

| Setting | Value |
|---------|-------|
| Root directory | `backend` |
| Start command | `uvicorn main:app --host 0.0.0.0 --port $PORT` |
| Python version | 3.11 (`runtime.txt`) |

Set all `backend/.env` variables in the platform dashboard.

### Frontend — Vercel

| Setting | Value |
|---------|-------|
| Root directory | `frontend` |
| Build command | `npm run build` |
| Output directory | `dist` |
| Framework | Vite |

Environment variables:
```
VITE_BACKEND_URL=https://your-backend.railway.app
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
```

### Post-Deploy

1. Deploy backend first
2. Set `FRONTEND_URL` on backend to your Vercel domain
3. Deploy frontend with `VITE_BACKEND_URL` pointing to backend
4. Test with two real devices on the deployed URL

### Build Output Chunks

Vite manual chunks: `vendor`, `supabase`, `motion` for optimal loading.

---

## 19. Known Limitations

| Item | Status |
|------|--------|
| JINX sabotage | Deployed but no gameplay effect beyond cost |
| Handicap (`handicap_active`) | Calculated in sports API response but not persisted to `rooms` |
| Flash bet auto-resolve | Manual via `POST /flash-bets/resolve` only |
| API-Football free tier | 100 requests/day — sufficient for dev only |
| Webhooks | API-Football free tier has no push; polling is the fallback |
| `socket.io-client` | Listed in package.json but unused (Supabase Realtime used instead) |
| `SECRET_KEY` | Defined in config but not used in current auth flow |
| Wagers table | Not subscribed via Realtime; balance updates come through `players` |

---

## Quick Reference Card

```
Create room  → POST /rooms/create
Join room    → POST /rooms/join  (LOBBY only)
Host panel   → /host/{code}
Invite link  → /?join={code}

States: LOBBY → SCOUTING → DRAFT_LOCKED → LIVE → FULL_TIME → RESULTS

Starting PC: 1000
Wager range: 10–500 (steps of 50)
Flash bet window: 3s frozen + 12s open

Env files:  .env = real secrets | .env.example = template only
```

---

*Documentation generated for Pitch Roulette v1.0.0 — June 2026*
