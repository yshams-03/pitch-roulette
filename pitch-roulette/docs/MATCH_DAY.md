# Match day runbook — degradation drill

Simulate worst-case external failures **before** kickoff. Run locally or on staging; document observed behavior.

## Quick drill

```bash
cd pitch-roulette/backend
python scripts/match_day_drill.py --base-url http://127.0.0.1:8000
```

With production (read-only health checks only):

```bash
python scripts/match_day_drill.py --base-url https://pitch-roulette-production.up.railway.app --health-only
```

## Scenarios

### 1. ESPN is down

**Simulate:** `ESPN_ENABLED=false` on Railway (or local `.env`), redeploy/restart.

| Area | Expected behavior |
|------|-------------------|
| Live real-match rooms | Match facts fall back to Football-Data → cached `room_events` → stale banner |
| Demo / simulation rooms | Unaffected — `match_engine` + scheduler drive events |
| Flash bets | Time-based scheduler still fires on match minute |
| Home fixtures/bracket | Football-Data or mock data; may show empty if both fail |

**Mitigation:** Promote demo rooms for watch parties; host uses manual event inject on host panel.

### 2. Football-Data rate-limited (429)

**Simulate:** Set invalid `FOOTBALL_DATA_API_KEY` or exhaust quota on staging.

| Area | Expected behavior |
|------|-------------------|
| Standings / fixtures API | Cached responses if TTL not expired; else empty state on home |
| Real-match live feed | ESPN primary when enabled; else last known `room_events` |
| Room creation | Unaffected |

**Mitigation:** `ESPN_ENABLED=true` for match day; increase cache TTL temporarily; disable home standings tab messaging (“stats updating”).

### 3. Supabase 30s latency

**Simulate (local):** `SUPABASE_DRILL_LATENCY_MS=30000` — see `match_day_drill.py` (wraps client only in drill mode).

| Area | Expected behavior |
|------|-------------------|
| `/api/health` | Slow but should return; `supabase_connected` may lag |
| Room join / flash bet answer | Timeouts possible; UI shows toast errors |
| Realtime (Supabase channels) | Delayed or disconnected; reconnect banner on live page |
| Event pipeline | Tick backlog; flash bets may fire late |

**Mitigation:**

1. Flip `FEATURE_FLASH_BETS=false` only if DB is unusable (prefer keeping scheduler)
2. Railway scale-up (more workers if using multiple replicas)
3. Communicate “refresh if stuck” to hosts
4. Roll back last deploy if regression suspected

## Decision tree

```
ESPN down?
  └─ Yes → FD + cache OK? → live feed degraded, game playable
  └─ No  → use demo_simulation rooms

FD rate-limited?
  └─ ESPN on? → home may be sparse, rooms OK
  └─ Both off? → MOCK_MODE fixtures only; real rooms need host inject

Supabase slow?
  └─ health alerts[] empty + errors < 5% → monitor
  └─ alerts[] or 5xx spike → rollback + status page
```

## Comms template

> Pitch Roulette: [ESPN/FD/DB] degradation. Impact: [live stats delayed / join slow]. Mitigation: [demo rooms / refresh]. Monitoring: /api/health alerts.

## Post-match

1. Export `/api/metrics/funnel?hours=48` — flash bet conversion
2. Review Sentry for timeout spikes
3. Archive `load_test_report.json` if you re-ran load test
