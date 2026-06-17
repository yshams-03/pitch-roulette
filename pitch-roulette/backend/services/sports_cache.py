from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone

from database import get_supabase

_stats = {"hits": 0, "misses": 0, "api_calls": 0, "api_errors": 0}


def get_cache_stats() -> dict:
    total = _stats["hits"] + _stats["misses"]
    return {
        **_stats,
        "hit_rate": round(_stats["hits"] / total, 3) if total else 0,
    }


def record_hit() -> None:
    _stats["hits"] += 1


def record_miss() -> None:
    _stats["misses"] += 1


def record_api_call() -> None:
    _stats["api_calls"] += 1


def record_api_error() -> None:
    _stats["api_errors"] += 1


def _now() -> datetime:
    return datetime.now(timezone.utc)


def get_cached(key: str, allow_stale: bool = False) -> dict | None:
    try:
        db = get_supabase()
        result = db.table("api_cache").select("*").eq("cache_key", key).execute()
    except Exception:
        return None
    if not result.data:
        return None
    row = result.data[0]
    expires = datetime.fromisoformat(row["expires_at"].replace("Z", "+00:00"))
    fetched = datetime.fromisoformat(row["fetched_at"].replace("Z", "+00:00"))
    if expires > _now():
        record_hit()
        return row["data"]
    if allow_stale and (_now() - fetched).total_seconds() < 1800:
        record_hit()
        data = dict(row["data"])
        data["_stale"] = True
        return data
    return None


def set_cached(key: str, data: dict, ttl_seconds: int) -> None:
    try:
        db = get_supabase()
        now = _now()
        expires = now + timedelta(seconds=ttl_seconds)
        db.table("api_cache").upsert({
            "cache_key": key,
            "data": data,
            "fetched_at": now.isoformat(),
            "expires_at": expires.isoformat(),
        }).execute()
    except Exception:
        pass
