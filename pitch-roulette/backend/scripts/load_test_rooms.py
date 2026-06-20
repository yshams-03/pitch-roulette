#!/usr/bin/env python3
"""Load test: ramp concurrent demo room creation and measure breaking point.

Usage:
  # Full ramp (needs valid Supabase JWT):
  python scripts/load_test_rooms.py --token YOUR_JWT --base-url http://127.0.0.1:8000

  # Single batch:
  python scripts/load_test_rooms.py --token YOUR_JWT --rooms 50 --no-ramp

  # Health-only smoke (no auth):
  python scripts/load_test_rooms.py --health-only --base-url http://127.0.0.1:8000

Writes JSON report to scripts/load_test_report.json when --report is set (default on ramp).
"""
from __future__ import annotations

import argparse
import asyncio
import json
import sys
import time
from dataclasses import asdict, dataclass, field
from pathlib import Path
from urllib import error, request


@dataclass
class BatchResult:
    requested: int
    ok: int
    failed: int
    elapsed_s: float
    req_per_s: float
    health_ms: float | None
    first_error_status: int | None = None


@dataclass
class LoadTestReport:
    base_url: str
    batches: list[BatchResult] = field(default_factory=list)
    breaking_point: int | None = None
    recommendation: str = ""

    def to_json(self) -> str:
        return json.dumps(asdict(self), indent=2)


def _get(url: str, timeout: float = 15) -> tuple[int, dict, float]:
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


def _post(url: str, token: str, body: dict, timeout: float = 90) -> tuple[int, dict]:
    data = json.dumps(body).encode()
    req = request.Request(
        url,
        data=data,
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        method="POST",
    )
    try:
        with request.urlopen(req, timeout=timeout) as resp:
            return resp.status, json.loads(resp.read().decode())
    except error.HTTPError as e:
        payload = e.read().decode()
        try:
            return e.code, json.loads(payload)
        except json.JSONDecodeError:
            return e.code, {"error": payload}


async def _create_one(base: str, token: str) -> tuple[int, str | None]:
    url = f"{base.rstrip('/')}/api/rooms"
    body = {
        "match_source": "demo_simulation",
        "bot_config": {"enabled": True, "count": 2, "difficulty": "easy"},
        "phase": "LOBBY",
    }
    status, data = await asyncio.to_thread(_post, url, token, body)
    code = data.get("room_code") or (data.get("room") or {}).get("room_code")
    return status, code if status == 200 else None


async def _batch(base: str, token: str, n: int) -> BatchResult:
    status, health_body, health_ms = await asyncio.to_thread(
        _get, f"{base.rstrip('/')}/api/health"
    )
    if status != 200:
        health_ms = None

    started = time.perf_counter()
    results = await asyncio.gather(*[_create_one(base, token) for _ in range(n)])
    elapsed = time.perf_counter() - started
    ok = sum(1 for s, _ in results if s == 200)
    failed_status = next((s for s, _ in results if s != 200), None)

    return BatchResult(
        requested=n,
        ok=ok,
        failed=n - ok,
        elapsed_s=round(elapsed, 2),
        req_per_s=round(ok / elapsed, 2) if elapsed > 0 else 0,
        health_ms=round(health_ms, 1) if health_ms is not None else None,
        first_error_status=failed_status,
    )


async def run_ramp(base: str, token: str, steps: list[int]) -> LoadTestReport:
    report = LoadTestReport(base_url=base)
    for n in steps:
        print(f"\n--- Batch: {n} concurrent room creates ---")
        batch = await _batch(base, token, n)
        report.batches.append(batch)
        print(
            f"  {batch.ok}/{batch.requested} OK in {batch.elapsed_s}s "
            f"({batch.req_per_s} req/s) · health {batch.health_ms}ms"
        )
        if batch.failed > 0:
            report.breaking_point = n
            report.recommendation = (
                f"Breaking point at {n} concurrent creates "
                f"(first HTTP {batch.first_error_status}). "
                f"Alert when live_rooms >= {max(10, n // 2)}."
            )
            break
        await asyncio.sleep(2)

    if report.breaking_point is None:
        last = report.batches[-1] if report.batches else None
        report.recommendation = (
            f"All batches passed through {steps[-1]} rooms. "
            f"Set alert at live_rooms >= {int(steps[-1] * 0.8)}."
        )
        if last and last.health_ms and last.health_ms > 2000:
            report.recommendation += f" Health latency high ({last.health_ms}ms) — watch Supabase."

    return report


async def run_health_only(base: str) -> int:
    status, body, ms = await asyncio.to_thread(_get, f"{base.rstrip('/')}/api/health")
    print(f"GET /api/health -> {status} in {ms:.0f}ms")
    if status != 200:
        print(json.dumps(body, indent=2))
        return 1
    print(json.dumps({k: body.get(k) for k in (
        "version", "supabase_connected", "active_rooms", "active_simulation_rooms",
        "alerts", "telemetry_24h",
    )}, indent=2))
    alerts = body.get("alerts") or []
    if alerts:
        print(f"ALERTS: {alerts}")
        return 1
    return 0


def main() -> int:
    p = argparse.ArgumentParser(description="Load test room creation")
    p.add_argument("--rooms", type=int, default=50, help="Rooms per batch when --no-ramp")
    p.add_argument("--base-url", default="http://127.0.0.1:8000")
    p.add_argument("--token", help="Supabase access JWT (required unless --health-only)")
    p.add_argument("--no-ramp", action="store_true", help="Single batch of --rooms")
    p.add_argument("--health-only", action="store_true", help="Ping /api/health only")
    p.add_argument("--ramp", default="10,25,50,75", help="Comma-separated batch sizes")
    p.add_argument("--report", default="scripts/load_test_report.json")
    p.add_argument("--no-report", action="store_true")
    args = p.parse_args()

    if args.health_only:
        return asyncio.run(run_health_only(args.base_url))

    if not args.token:
        print("error: --token required (or use --health-only)", file=sys.stderr)
        return 2

    if args.no_ramp:
        report = LoadTestReport(base_url=args.base_url)
        batch = asyncio.run(_batch(args.base_url, args.token, args.rooms))
        report.batches.append(batch)
        print(f"Created {batch.ok}/{batch.requested} in {batch.elapsed_s}s")
        if batch.failed:
            report.breaking_point = args.rooms
        if not args.no_report:
            Path(args.report).write_text(report.to_json(), encoding="utf-8")
        return 0 if batch.ok == batch.requested else 1

    steps = [int(x.strip()) for x in args.ramp.split(",") if x.strip()]
    report = asyncio.run(run_ramp(args.base_url, args.token, steps))
    print(f"\n{report.recommendation}")

    if not args.no_report:
        out = Path(args.report)
        out.write_text(report.to_json(), encoding="utf-8")
        print(f"Report written to {out}")

    return 0 if report.breaking_point is None else 1


if __name__ == "__main__":
    sys.exit(main())
