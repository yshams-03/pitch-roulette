# E2E Test Results — Phase 3

**Date:** 2026-06-17  
**Suite:** `pitch-roulette/frontend/e2e/`  
**Total tests:** 69 (12 spec files)  
**Config:** `playwright.config.ts` — serial (`workers: 1`), 60s timeout, retries 1 in CI

## Run command

```powershell
cd pitch-roulette\frontend
$env:E2E_TEST_EMAIL = "your@email.com"
$env:E2E_TEST_PASSWORD = "yourpassword"
# Optional second/third accounts for multi-browser specs:
$env:E2E_TEST_EMAIL_2 = "friend1@email.com"
$env:E2E_TEST_PASSWORD_2 = "friendpassword1"

# Start backend (port 8000) + frontend (port 5173) first, then:
$env:E2E_API_URL = "http://127.0.0.1:8000"
$env:E2E_SKIP_WEBSERVER = "true"
npm run test:e2e
```

### Backend prerequisites (Phase 3 E2E)

1. **Single backend instance** — stale uvicorn processes on port 8000 serve API `2.1.0` without side assignment, draft, or sabotage routes. Kill extras (`netstat -ano | findstr :8000`) and start fresh:
   ```powershell
   cd pitch-roulette\backend
   .\venv\Scripts\Activate.ps1
   uvicorn main:app --reload --port 8000
   ```
2. **Verify version** — `curl http://127.0.0.1:8000/openapi.json` → `"version":"3.0.0"` and `/api/rooms/{code}/start-draft` exists.
3. **Supabase migrations** — run `003` → `006` in order (`005_phase3_sides.sql` adds `room_players.assigned_side`). Without it, `/start` succeeds but sides stay null.
4. **Use `127.0.0.1`** — set `E2E_API_URL=http://127.0.0.1:8000` (default in helpers) to avoid Windows IPv6 `localhost` hangs.

## Spec files

| File | Tests | Focus |
|------|-------|-------|
| `auth.spec.ts` | 7 | Login, logout, protected routes, reset password |
| `home.spec.ts` | 8 | Standings, fixtures, bracket |
| `groups.spec.ts` | 4 | Create/join group, leaderboard |
| `demo-flow.spec.ts` | 2 | Full lobby → draft → live → results |
| `pitch-chips.spec.ts` | 7 | PC balance, flash bet tiers, party board |
| `sabotage.spec.ts` | 9 | Shop, TAX, host panel, 2-player SILENCE/BLINDFOLD |
| `side-assignment.spec.ts` | 5 | Side reveal, swap, underdog bonus |
| `fantasy-draft.spec.ts` | 8 | Draft UI, picks, timer, bots |
| `cleanup.spec.ts` | 5 | Bracket SVG, chat delete API, CI docs |
| `realtime.spec.ts` | 4 | Connection badge, redirects, flash bet sync |
| `host-controls.spec.ts` | 6 | Kick, chat toggle, flash bets (existing) |
| `real-room-flow.spec.ts` | 5 | Live fixture (skips if none) |

## Known gaps

See `e2e/E2E_BUGS.md` for feature/UI gaps adapted in tests.

## CI note

Local video on failure requires `npx playwright install ffmpeg`. Config uses `video: off` locally, `retain-on-failure` in CI.

## Latest local run (partial)

**2026-06-18 — blocker identified**

| Issue | Cause | Fix |
|-------|--------|-----|
| Side assignment null after `/start` | Stale API v2.1.0 on :8000 (no `assign_room_sides`) | Restart Phase 3 backend; confirm openapi `3.0.0` |
| `waitForRoomState` timeout | Same stale backend / `localhost` IPv6 hang | `E2E_API_URL=http://127.0.0.1:8000` |
| Migration gap | `assigned_side` column missing in Supabase | Run `005_phase3_sides.sql` |

**Code fix:** `demo_compat` `/advance` now calls `assign_room_sides` when LOBBY → PREDICTING (parity with `/start`).

**Backend unit tests:** 64 passed (including new `test_demo_compat_advance.py`).

Initial full run hit missing ffmpeg (fixed). Re-run after:

1. `npx playwright install chromium` (or use Chrome channel)
2. Backend + frontend running
3. Valid `E2E_TEST_*` credentials

Target: **69 tests**, 0 failures, intentional skips only for `real-room-flow` (no live fixture) and `FULL_TIME auto-set` (no stable demo inject).
