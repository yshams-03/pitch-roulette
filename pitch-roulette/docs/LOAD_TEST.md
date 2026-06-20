# Load test — room creation ramp

## Goal

Know how the API behaves under concurrent room creation, document the breaking point, and wire an ops alert before match day.

## Script

```bash
cd pitch-roulette/backend

# Health smoke (no JWT) — checks /api/health + alerts[]
python scripts/load_test_rooms.py --health-only --base-url https://pitch-roulette-production.up.railway.app

# Full ramp: 10 → 25 → 50 → 75 concurrent creates (needs Supabase JWT)
python scripts/load_test_rooms.py \
  --token "$SUPABASE_ACCESS_TOKEN" \
  --base-url https://pitch-roulette-production.up.railway.app \
  --ramp 10,25,50,75

# Single batch of 50
python scripts/load_test_rooms.py --token "$TOKEN" --rooms 50 --no-ramp --base-url https://YOUR-API
```

Report JSON: `backend/scripts/load_test_report.json` (written on ramp runs).

## Alert threshold

`/api/health` returns `alerts[]` when `active_rooms >= LIVE_ROOM_ALERT_THRESHOLD` (default **40**, override via Railway env).

Example:

```json
{
  "active_rooms": 42,
  "alerts": ["high_live_room_count:42>=40"]
}
```

**Recommended monitoring:** page on `alerts` non-empty, or `active_rooms > 35` as early warning.

## Baseline results (local MOCK_MODE, 2026-06-20)

| Batch | OK | Elapsed | req/s | Health ms | Notes |
|-------|-----|---------|-------|-----------|-------|
| 10 | 10/10 | ~2s | ~5 | &lt;500 | No failures |
| 25 | 25/25 | ~4s | ~6 | &lt;800 | No failures |
| 50 | 50/50 | ~8s | ~6 | &lt;1200 | Target met |

*Re-run against production with a real JWT before a major match; MOCK_MODE skips Supabase write pressure.*

## Breaking point criteria

Ramp stops when any batch has `failed > 0` (non-200 room create). The script sets `breaking_point` and prints an alert recommendation.

If all batches pass but `health_ms > 2000`, treat Supabase latency as the limiter — see [MATCH_DAY.md](./MATCH_DAY.md).

## Pre-match checklist

1. `python scripts/load_test_rooms.py --health-only` → 200, empty `alerts`
2. Ramp to 50 with staging JWT → 50/50 OK
3. Confirm Railway `LIVE_ROOM_ALERT_THRESHOLD=40` (or your chosen cap)
4. Sentry alert on 5xx rate spike
