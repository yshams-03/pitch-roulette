#!/usr/bin/env python3
"""Match-day degradation drill — documents expected behavior under external failures.

Usage:
  # Local backend must be running:
  python scripts/match_day_drill.py --base-url http://127.0.0.1:8000

  # Production health-only (no destructive actions):
  python scripts/match_day_drill.py --base-url https://YOUR-API --health-only
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from urllib import error, request

SCENARIOS = [
    {
        "id": "espn_down",
        "title": "ESPN is down",
        "env": "ESPN_ENABLED=false",
        "expect": [
            "Real-match live facts use FD/cache/room_events fallback",
            "Demo rooms unaffected; flash scheduler still runs",
        ],
    },
    {
        "id": "fd_rate_limit",
        "title": "Football-Data rate-limited",
        "env": "Invalid or exhausted FOOTBALL_DATA_API_KEY",
        "expect": [
            "Home standings/fixtures may empty after cache TTL",
            "ESPN primary for live when enabled",
        ],
    },
    {
        "id": "supabase_latency",
        "title": "Supabase 30s latency",
        "env": "SUPABASE_DRILL_LATENCY_MS=30000 (local drill only)",
        "expect": [
            "/api/health slow; joins/answers may timeout",
            "Realtime delayed; users should refresh",
        ],
    },
]


def _get(url: str, timeout: float = 35) -> tuple[int, dict, float]:
    started = time.perf_counter()
    req = request.Request(url, method="GET")
    try:
        with request.urlopen(req, timeout=timeout) as resp:
            body = json.loads(resp.read().decode())
            ms = (time.perf_counter() - started) * 1000
            return resp.status, body, ms
    except error.HTTPError as e:
        ms = (time.perf_counter() - started) * 1000
        try:
            body = json.loads(e.read().decode())
        except json.JSONDecodeError:
            body = {"error": str(e)}
        return e.code, body, ms
    except Exception as e:
        ms = (time.perf_counter() - started) * 1000
        return 0, {"error": str(e)}, ms


def main() -> int:
    p = argparse.ArgumentParser(description="Match day degradation drill")
    p.add_argument("--base-url", default="http://127.0.0.1:8000")
    p.add_argument("--health-only", action="store_true", help="Only ping /api/health")
    args = p.parse_args()
    base = args.base_url.rstrip("/")

    print("=== Match day drill ===\n")
    for s in SCENARIOS:
        print(f"## {s['title']}")
        print(f"   Simulate: {s['env']}")
        for line in s["expect"]:
            print(f"   - {line}")
        print()

    status, body, ms = _get(f"{base}/api/health")
    print(f"GET /api/health -> HTTP {status} in {ms:.0f}ms")
    if status == 200:
        summary = {
            k: body.get(k)
            for k in (
                "version",
                "espn_enabled",
                "mock_mode",
                "supabase_connected",
                "active_rooms",
                "alerts",
                "flash_bet_conversion_24h",
            )
        }
        print(json.dumps(summary, indent=2))
        if ms > 5000:
            print("WARN: health latency >5s — investigate Supabase")
        alerts = body.get("alerts") or []
        if alerts:
            print(f"ALERTS: {alerts}")
    else:
        print(json.dumps(body, indent=2))
        return 1

    if args.health_only:
        print("\n(health-only - set env vars manually per docs/MATCH_DAY.md)")
        return 0

    print("\nManual steps:")
    print("1. Restart backend with ESPN_ENABLED=false, re-run this script")
    print("2. Restart with bad FD key, check home standings")
    print("3. Set SUPABASE_DRILL_LATENCY_MS=30000, test room join in browser")
    print("\nFull runbook: pitch-roulette/docs/MATCH_DAY.md")
    return 0


if __name__ == "__main__":
    sys.exit(main())
