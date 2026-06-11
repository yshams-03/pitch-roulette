"""API-Football (api-sports.io) primary provider."""
from __future__ import annotations

import logging
from typing import Any
from urllib.parse import urlencode

import httpx

from config import get_settings

logger = logging.getLogger(__name__)

_cache: dict[str, Any] = {}


def is_configured() -> bool:
    return bool(get_settings().SPORTS_API_KEY)


def _headers() -> dict[str, str]:
    return {"x-apisports-key": get_settings().SPORTS_API_KEY}


def _cache_key(endpoint: str, params: dict | None) -> str:
    normalized = params or {}
    if not normalized:
        return endpoint
    query = urlencode(sorted((str(k), str(v)) for k, v in normalized.items()))
    return f"{endpoint}?{query}"


def is_rate_limited(data: dict) -> bool:
    errors = data.get("errors") or {}
    if not errors:
        return False
    if errors.get("rate_limit") or errors.get("requests"):
        return True
    msg = str(errors).lower()
    return "limit" in msg or "rate" in msg


async def api_get(endpoint: str, params: dict | None = None) -> dict:
    settings = get_settings()
    key = _cache_key(endpoint, params)

    if not settings.SPORTS_API_KEY:
        return {"response": [], "errors": {"message": "API key not configured"}}

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            response = await client.get(
                f"{settings.SPORTS_API_BASE}/{endpoint}",
                headers=_headers(),
                params=params or {},
            )
            if response.status_code == 429:
                logger.warning("API-Football rate limit (HTTP 429)")
                return _cache.get(key, {"response": [], "errors": {"rate_limit": True}})

            data = response.json()
            if response.status_code == 200 and not is_rate_limited(data):
                _cache[key] = data
            return data
    except httpx.HTTPError as e:
        logger.error("API-Football error: %s", e)
        return _cache.get(key, {"response": [], "errors": {"network": str(e)}})


async def search_fixtures(query: str) -> list[dict]:
    data = await api_get("fixtures", {"search": query, "status": "NS"})
    if is_rate_limited(data):
        return []
    return data.get("response", [])


async def get_lineups(fixture_id: str | int) -> dict:
    data = await api_get("fixtures/lineups", {"fixture": fixture_id})
    if is_rate_limited(data):
        return {"available": False, "lineups": [], "_rate_limited": True}
    response = data.get("response", [])
    if not response:
        return {"available": False, "lineups": []}
    return {"available": True, "lineups": response}


async def get_live_events(fixture_id: str | int) -> list[dict]:
    data = await api_get("fixtures/events", {"fixture": fixture_id})
    if is_rate_limited(data):
        return []
    events = data.get("response", [])
    for i, event in enumerate(events):
        if "id" not in event:
            event["id"] = f"{fixture_id}-{i}-{event.get('type')}-{event.get('time', {}).get('elapsed', 0)}"
    return events


async def get_live_stats(fixture_id: str | int) -> dict:
    data = await api_get("fixtures/statistics", {"fixture": fixture_id})
    if is_rate_limited(data):
        return {"response": []}
    return data


async def get_player_ratings(fixture_id: str | int) -> list[dict]:
    data = await api_get("fixtures/players", {"fixture": fixture_id})
    if is_rate_limited(data):
        return []
    return data.get("response", [])


async def get_fixture(fixture_id: str | int) -> dict | None:
    data = await api_get("fixtures", {"id": fixture_id})
    if is_rate_limited(data):
        return None
    response = data.get("response", [])
    return response[0] if response else None
