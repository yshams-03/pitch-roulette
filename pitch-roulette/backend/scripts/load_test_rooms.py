#!/usr/bin/env python3
"""Load test: create N concurrent demo rooms via the API.

Usage:
  python scripts/load_test_rooms.py --rooms 50 --base-url http://127.0.0.1:8000 --token YOUR_JWT

Requires a valid Supabase JWT (sign in via the app or Supabase auth).
"""
from __future__ import annotations

import argparse
import asyncio
import json
import sys
import time
from urllib import error, request


def _post(url: str, token: str, body: dict) -> tuple[int, dict]:
    data = json.dumps(body).encode()
    req = request.Request(
        url,
        data=data,
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        method="POST",
    )
    try:
        with request.urlopen(req, timeout=60) as resp:
            return resp.status, json.loads(resp.read().decode())
    except error.HTTPError as e:
        payload = e.read().decode()
        try:
            return e.code, json.loads(payload)
        except json.JSONDecodeError:
            return e.code, {"error": payload}


async def _create_one(base: str, token: str, idx: int) -> tuple[int, str | None]:
    url = f"{base.rstrip('/')}/api/rooms"
    body = {
        "match_source": "demo_simulation",
        "bot_config": {"enabled": True, "count": 2, "difficulty": "easy"},
        "phase": "LOBBY",
    }
    status, data = await asyncio.to_thread(_post, url, token, body)
    code = data.get("room_code") or (data.get("room") or {}).get("room_code")
    return status, code if status == 200 else None


async def run(base: str, token: str, n: int) -> int:
    started = time.perf_counter()
    results = await asyncio.gather(*[_create_one(base, token, i) for i in range(n)])
    elapsed = time.perf_counter() - started
    ok = sum(1 for s, _ in results if s == 200)
    print(f"Created {ok}/{n} rooms in {elapsed:.1f}s ({ok / elapsed:.1f} req/s)")
    failures = [(s, c) for s, c in results if s != 200]
    if failures:
        print(f"Failures: {len(failures)} (first status={failures[0][0]})")
    return 0 if ok == n else 1


def main() -> int:
    p = argparse.ArgumentParser(description="Load test room creation")
    p.add_argument("--rooms", type=int, default=50)
    p.add_argument("--base-url", default="http://127.0.0.1:8000")
    p.add_argument("--token", required=True, help="Supabase access JWT")
    args = p.parse_args()
    return asyncio.run(run(args.base_url, args.token, args.rooms))


if __name__ == "__main__":
    sys.exit(main())
