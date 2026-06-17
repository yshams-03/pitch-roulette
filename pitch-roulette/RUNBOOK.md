# Pitch Roulette — Operations Runbook

## On-call quick reference

| Symptom | Likely cause | Action |
|---------|--------------|--------|
| 503 `feature_disabled` | Kill switch env var | Set `FEATURE_*=true` on Railway, redeploy |
| Rooms stuck in LOBBY | Host left without transfer | Wait for pipeline (~30s) or call cleanup manually |
| Flash bets not appearing | `FEATURE_FLASH_BETS=false` or room not LIVE | Check flags + room state |
| ESPN events missing | ESPN API down / SSL issue | Set `ESPN_ENABLED=false`, use demo rooms |
| High error rate in Sentry | Deploy regression | Roll back Railway/Vercel to last green deploy |

## Health endpoints

```bash
curl https://YOUR-API/api/health
```

Key fields: `supabase_connected`, `active_rooms`, `feature_flags`, `sentry_enabled`, `telemetry_24h`

Funnel metrics (ops):

```bash
curl https://YOUR-API/api/metrics/funnel?hours=24
```

## Feature kill switches

Set on Railway backend (restart required):

```
FEATURE_SABOTAGE=false   # disable sabotage shop
FEATURE_DRAFT=false      # disable fantasy draft
FEATURE_SIDES=false      # disable side swap
FEATURE_FLASH_BETS=false # disable flash bets
```

Frontend reads `/api/flags` at load and hides UI accordingly.

## Host transfer

- **API:** `POST /api/rooms/{code}/transfer-host` `{ "user_id": "<uuid>" }` (host only)
- **Auto-promote:** When host calls `POST /api/rooms/{code}/leave`, next human player becomes host
- **Orphan recovery:** Event pipeline runs `cleanup_orphan_host_rooms()` every tick

## Database migrations

Apply in Supabase SQL Editor in numeric order. Phase 4 adds `analytics_events` (`007_phase4_ops.sql`).

## Load testing

```bash
cd pitch-roulette/backend
python scripts/load_test_rooms.py --rooms 50 --base-url https://YOUR-API --token YOUR_JWT
```

Target: 50/50 rooms created, no 5xx.

## Rollback

1. **Railway:** Deployments → select previous successful deploy → Redeploy
2. **Vercel:** Deployments → Promote previous production build
3. **Flags:** Disable broken feature via env without full rollback

## Incident comms template

> Pitch Roulette [staging|prod]: [brief impact]. Root cause: [TBD]. Mitigation: [flag flip / rollback]. ETA: [time].

## Contacts / links

- Repo: GitHub `pitch-roulette`
- Supabase dashboard: project settings → Database / Auth
- Sentry: filter by `environment` tag
