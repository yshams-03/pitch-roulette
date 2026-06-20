# PR: Production 10-gap + Phase 3 ship

**Branch:** `feat/phase3-sabotage` → `main`  
**Create:** https://github.com/yshams-03/pitch-roulette/compare/main...feat/phase3-sabotage

## Summary

- **Ops:** `/api/health` `alerts[]` when `active_rooms >= LIVE_ROOM_ALERT_THRESHOLD` (default 40); funnel conversion at `/api/metrics/funnel`
- **CI:** 11 credential-free `@pr-smoke` E2E specs gate PRs (home + cleanup + leaderboard)
- **Analytics:** `flash_bet_seen` / `flash_bet_answered` telemetry; urgency CTA when ≤10s left
- **Runbooks:** `docs/LOAD_TEST.md`, `docs/MATCH_DAY.md`, `scripts/match_day_drill.py`
- **Product:** FotMob-style `MatchFacts`, points/PP breakdown, time-based flash bet scheduler
- **Migration:** `008_points_flash_schedule.sql` — apply in Supabase before relying on new PP/flash columns

## Test plan

- [x] Backend: `pytest tests/` — 92 passed
- [x] Frontend: `npm run build` — green
- [x] Frontend unit: `FlashBetCard` tests pass
- [ ] CI: `@pr-smoke` job on this PR (11 specs)
- [ ] Merge → Railway + Vercel auto-deploy
- [ ] Post-deploy: `curl .../api/health | jq '.alerts, .flash_bet_conversion_24h'` — not `null`
- [ ] Railway: `LIVE_ROOM_ALERT_THRESHOLD=40`
- [ ] Supabase: run migration `008_points_flash_schedule.sql`
- [ ] Load ramp: `python scripts/load_test_rooms.py --token $JWT --ramp 10,25,50,75 --base-url https://pitch-roulette-production.up.railway.app`
- [ ] Branch protection: require `e2e-smoke` check on `main`

## Post-merge verification

```powershell
# Health (after deploy)
curl https://pitch-roulette-production.up.railway.app/api/health

# Expected new fields:
# "alerts": []
# "flash_bet_conversion_24h": null | 0.0-1.0

# Funnel
curl "https://pitch-roulette-production.up.railway.app/api/metrics/funnel?hours=24"

# Load test health smoke
cd pitch-roulette/backend
python scripts/load_test_rooms.py --health-only --base-url https://pitch-roulette-production.up.railway.app
```

## Load test results (fill after production ramp)

| Batch | OK | Elapsed | req/s | Health ms |
|-------|-----|---------|-------|-----------|
| 10 | | | | |
| 25 | | | | |
| 50 | | | | |
| 75 | | | | |

**Breaking point:** _TBD_  
**Alert threshold:** 40 (adjust if 75 passes cleanly)

## Railway env (set tonight)

```
LIVE_ROOM_ALERT_THRESHOLD=40
```

## Vercel env

```
VITE_API_BASE_URL=https://pitch-roulette-production.up.railway.app
```

Hard-refresh / redeploy after env changes.
