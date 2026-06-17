# Pitch Roulette — Test Suite

One place to run backend, frontend, and E2E tests.

## Quick start

```bash
# Install dev dependencies
make install-dev

# Backend unit + integration (mocked Supabase — no live DB required)
make test

# Frontend component/unit tests (Vitest)
make test-frontend

# E2E (Playwright — requires running stack + test user)
make test-e2e
```

## Backend (`backend/tests/`)

| Suite | Command | Notes |
|-------|---------|-------|
| Unit | `cd backend && pytest tests/unit` | Flash bets, match engine, bots, PP, chat filter |
| Integration | `cd backend && pytest tests/integration` | FastAPI TestClient + in-memory fake Supabase |
| Coverage | `pytest tests/unit --cov=services` | Target >80% on `services/` over time |

### Fixtures

- `tests/conftest.py` — `fake_db`, `client`, `espn_snapshot`, `demo_room`
- `tests/mocks/fake_supabase.py` — chainable in-memory PostgREST mock
- `tests/fixtures/espn_snapshot.json` — sample ESPN live payload

## Frontend (`frontend/src/**/*.test.ts`)

```bash
cd frontend
npm run test:unit        # single run
npm run test:unit:watch  # watch mode
```

Covers `roomUtils`, `FlashBetCard` (optimistic pick), with more components added incrementally.

## E2E (`frontend/e2e/`)

```bash
# Terminal 1 — backend
cd backend && uvicorn main:app --port 8000

# Terminal 2 — frontend (or let Playwright start it)
cd frontend && npm run dev

# Terminal 3 — E2E
cd frontend
set E2E_TEST_EMAIL=you@example.com
set E2E_TEST_PASSWORD=yourpassword
npm run test:e2e
```

### E2E env vars

| Variable | Purpose |
|----------|---------|
| `E2E_TEST_EMAIL` | Supabase test user email |
| `E2E_TEST_PASSWORD` | Supabase test user password |
| `VITE_SUPABASE_URL` | From `frontend/.env` |
| `VITE_SUPABASE_ANON_KEY` | From `frontend/.env` |
| `E2E_API_URL` | Default `http://localhost:8000` |
| `E2E_SKIP_WEBSERVER` | Set `1` if frontend already running |

### Windows / corporate TLS (`UNABLE_TO_VERIFY_LEAF_SIGNATURE`)

E2E uses **installed Google Chrome** (`channel: 'chrome'` in `playwright.config.ts`) so you do **not** need `npx playwright install`. Login goes through the browser UI (not Node → Supabase), which avoids the same TLS error during auth.

If you still hit certificate errors:

```powershell
$env:NODE_OPTIONS="--use-system-ca"
npm run test:e2e
```

Fallback (local dev only): `$env:NODE_TLS_REJECT_UNAUTHORIZED="0"` before running tests.

Specs:
- `demo-flow.spec.ts` — critical demo path (login → predict → live → flash bet)
- `full-game.spec.ts` — **ignored** (legacy Phase 0 party game)

## Health check (used by smoke tests)

`GET http://localhost:8000/api/health` returns:

```json
{
  "status": "ok",
  "version": "3.0.0",
  "active_rooms": 0,
  "active_simulation_rooms": 0,
  "supabase_connected": true,
  "football_data_configured": true,
  "espn_enabled": true
}
```

## Seed script

```bash
make seed
# or
cd backend && python scripts/seed_test_data.py
```

Creates test users and sample rooms when `SUPABASE_*` is configured in `backend/.env`.

## CI

GitHub Actions workflow: `.github/workflows/test.yml` runs backend pytest + frontend Vitest on every push. E2E runs when repository secrets `E2E_TEST_EMAIL` / `E2E_TEST_PASSWORD` are set.
