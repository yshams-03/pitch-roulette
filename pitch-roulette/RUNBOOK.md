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

Key fields: `supabase_connected`, `active_rooms`, `alerts`, `feature_flags`, `sentry_enabled`, `telemetry_24h`, `flash_bet_conversion_24h`, `product_insight`

**Alerts:** non-empty `alerts[]` when `active_rooms >= LIVE_ROOM_ALERT_THRESHOLD` (default 40). Page on-call or scale before match day.

Funnel metrics (ops):

```bash
curl https://YOUR-API/api/metrics/funnel?hours=24
```

Returns `flash_bet_seen`, `flash_bet_answered`, `flash_bet_conversion_rate`, and `insight` when conversion &lt; 50% with enough volume.

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

See **`docs/LOAD_TEST.md`** for ramp procedure, baseline, and alert wiring.

```bash
cd pitch-roulette/backend
python scripts/load_test_rooms.py --health-only --base-url https://YOUR-API
python scripts/load_test_rooms.py --token YOUR_JWT --ramp 10,25,50,75 --base-url https://YOUR-API
```

Target: 50/50 rooms created at 50 concurrency, no 5xx. Set `LIVE_ROOM_ALERT_THRESHOLD` on Railway.

## Match day degradation

See **`docs/MATCH_DAY.md`**. Drill script:

```bash
python scripts/match_day_drill.py --base-url https://YOUR-API --health-only
```

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
