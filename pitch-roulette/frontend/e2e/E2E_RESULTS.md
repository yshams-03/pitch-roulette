# E2E Test Results — production hardening pass

**Date:** 2026-06-20  
**Suite:** `pitch-roulette/frontend/e2e/`  
**Total tests:** 69 (12 spec files)

## Latest run (no `E2E_TEST_*` in shell)

| Area | Result | Notes |
|------|--------|-------|
| `home.spec.ts` | **7/7 passed** | Standings, fixtures, bracket |
| `cleanup.spec.ts` | **3/3 passed** (2 skipped) | README branch protection + workflow YAML |
| `groups.spec.ts` | **1/1 passed** (3 skipped) | Global leaderboard tabs + Load more |
| Credential-gated specs | Skipped | Set `E2E_TEST_EMAIL` + `E2E_TEST_PASSWORD` |

**11 passing** without credentials; **58 skipped** pending E2E user env.

## With credentials (target)

```powershell
cd pitch-roulette\frontend
$env:E2E_TEST_EMAIL = "your@email.com"
$env:E2E_TEST_PASSWORD = "yourpassword"
$env:E2E_SKIP_WEBSERVER = "true"
# backend :8000 + frontend :5173 running
npx playwright test --reporter=list
```

Target: **54+ passing**, intentional skips only for `FULL_TIME auto-set` and `real-room-flow` when no live fixture.

## Fixes in this pass

- `config.ts` + `api.ts` — single API URL source (no hardcoded localhost in app code)
- CORS hardened in `backend/main.py`
- E2E: `dismissSideRevealIfPresent`, `submitPredictionApi`, `startRoomApi` polls PREDICTING
- E2E: leaderboard selectors (`tab` role, Global Leaderboard heading)
- E2E: logout waits for `/auth/login` hard redirect
- E2E: `real-room-flow` skips before browser context when no fixture
- README: branch protection docs for cleanup spec

See `e2e/E2E_BUGS.md` for feature/UI gaps.
