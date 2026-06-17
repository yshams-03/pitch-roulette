"""Layered sports data: Football-Data.org → cache → stale; ESPN for live events."""
from __future__ import annotations

import asyncio
from datetime import datetime, timezone

from config import get_settings, reload_settings
from services import espn, football_data
from services.sports_cache import get_cache_stats, get_cached, record_miss, set_cached

SOURCE = "football-data.org"
_LEGACY_SOURCES = frozenset({"mock", "api-football"})


def _comp_key(competition: str) -> dict:
    settings = get_settings()
    if competition.upper() in ("WC", "WORLD_CUP"):
        return settings.competition
    return settings.competition


def _reject_legacy_cache(payload: dict | None) -> dict | None:
    if payload and payload.get("source") in _LEGACY_SOURCES:
        return None
    if payload and payload.get("matches"):
        for m in payload["matches"]:
            if m.get("home_team") is None or m.get("away_team") is None:
                return None
    return payload


def _empty_standings(competition: str, error: str | None = None) -> dict:
    return {
        "competition": competition,
        "source": SOURCE,
        "standings": [],
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "error": error,
    }


def _empty_schedule(competition: str, error: str | None = None) -> dict:
    return {
        "competition": competition,
        "source": SOURCE,
        "matches": [],
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "error": error,
    }


async def _refresh_standings(competition: str, key: str, code: str, season: int) -> None:
    settings = get_settings()
    rows, _ = await football_data.fetch_standings(code, season)
    if rows:
        set_cached(key, {
            "competition": competition,
            "source": SOURCE,
            "standings": rows,
            "season": season,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }, settings.CACHE_TTL_STANDINGS)


async def _refresh_matches(competition: str, key: str, code: str, season: int) -> None:
    settings = get_settings()
    matches, _ = await football_data.fetch_fixtures(code, season)
    if matches:
        matches.sort(key=lambda m: m.get("kickoff") or "")
        set_cached(key, {
            "competition": competition,
            "source": SOURCE,
            "matches": matches,
            "season": season,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }, settings.CACHE_TTL_SCHEDULE)


async def get_standings(competition: str = "WC") -> dict:
    comp = _comp_key(competition)
    code = comp["code"]
    season = comp["season"]
    key = f"standings:{code}:{season}"
    settings = get_settings()

    cached = _reject_legacy_cache(get_cached(key))
    if cached:
        return cached

    stale_allowed = _reject_legacy_cache(get_cached(key, allow_stale=True))
    if stale_allowed:
        asyncio.create_task(_refresh_standings(competition, key, code, season))
        return stale_allowed

    rows, api_error = await football_data.fetch_standings(code, season)
    if rows:
        payload = {
            "competition": competition,
            "source": SOURCE,
            "standings": rows,
            "season": season,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
        set_cached(key, payload, settings.CACHE_TTL_STANDINGS)
        return payload

    record_miss()
    if stale_allowed:
        return stale_allowed
    return _empty_standings(competition, api_error or "standings_unavailable")


async def get_matches(competition: str = "WC") -> dict:
    comp = _comp_key(competition)
    code = comp["code"]
    season = comp["season"]
    key = f"schedule:{code}:{season}"
    settings = get_settings()

    cached = _reject_legacy_cache(get_cached(key))
    if cached:
        return cached

    stale_allowed = _reject_legacy_cache(get_cached(key, allow_stale=True))
    if stale_allowed:
        asyncio.create_task(_refresh_matches(competition, key, code, season))
        return stale_allowed

    matches, api_error = await football_data.fetch_fixtures(code, season)
    if matches:
        matches.sort(key=lambda m: m.get("kickoff") or "")
        payload = {
            "competition": competition,
            "source": SOURCE,
            "matches": matches,
            "season": season,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
        set_cached(key, payload, settings.CACHE_TTL_SCHEDULE)
        return payload

    record_miss()
    if stale_allowed:
        return stale_allowed
    return _empty_schedule(competition, api_error or "schedule_unavailable")


async def get_live_match(match_id: str) -> dict:
    if match_id in ("demo-sandbox",) or str(match_id).startswith("demo-"):
        return {"id": match_id, "source": "demo", "error": "demo_match"}

    key = f"live:{match_id}"
    settings = get_settings()

    cached = _reject_legacy_cache(get_cached(key))
    if cached:
        return cached

    fixture, api_error = await football_data.fetch_fixture_by_id(match_id)
    if fixture:
        payload = {**fixture, "source": SOURCE}
        set_cached(key, payload, settings.CACHE_TTL_LIVE)
        return payload

    stale = _reject_legacy_cache(get_cached(key, allow_stale=True))
    if stale:
        return stale

    return {
        "id": match_id,
        "source": SOURCE,
        "error": api_error or "match_not_found",
    }


async def resolve_espn_event_id(
    home_team: str,
    away_team: str,
    kickoff: str | None = None,
) -> str | None:
    settings = get_settings()
    if not settings.ESPN_ENABLED:
        return None
    cache_key = f"espn:resolve:{_norm_resolve_key(home_team, away_team, kickoff)}"
    cached = get_cached(cache_key)
    if cached and cached.get("espn_event_id"):
        return cached["espn_event_id"]
    event_id = await espn.find_event_id(home_team, away_team, kickoff)
    if event_id:
        set_cached(cache_key, {"espn_event_id": event_id}, settings.CACHE_TTL_SCHEDULE)
    return event_id


def _norm_resolve_key(home: str, away: str, kickoff: str | None) -> str:
    k = (kickoff or "")[:10]
    return f"{home}|{away}|{k}".lower()


async def get_espn_live_snapshot(espn_event_id: str) -> dict:
    """Live match + details[] from ESPN (for LIVE rooms and flash bets)."""
    if str(espn_event_id).startswith("demo-"):
        return {"espn_event_id": espn_event_id, "error": "demo_match", "details": []}

    settings = get_settings()
    if not settings.ESPN_ENABLED:
        return {"error": "espn_disabled"}

    key = f"espn:live:{espn_event_id}"
    cached = get_cached(key)
    if cached:
        return cached

    snapshot, err = await espn.get_live_snapshot(espn_event_id)
    if snapshot:
        set_cached(key, snapshot, settings.CACHE_TTL_ESPN_LIVE)
        return snapshot

    stale = get_cached(key, allow_stale=True)
    if stale:
        return stale

    return {"espn_event_id": espn_event_id, "error": err or "espn_not_found", "details": []}


async def enrich_live_with_espn(live: dict) -> dict:
    """Attach espn_event_id to a Football-Data live snapshot when possible."""
    settings = get_settings()
    if not settings.ESPN_ENABLED:
        return live
    espn_id = await resolve_espn_event_id(
        live.get("home_team", ""),
        live.get("away_team", ""),
        live.get("kickoff"),
    )
    if espn_id:
        return {**live, "espn_event_id": espn_id}
    return live


async def bootstrap_espn_for_live_room(live: dict) -> tuple[dict, str | None, str | None]:
    """
    Football-Data + ESPN in parallel: refresh scoreline and resolve ESPN events.
    Returns (match_data, espn_event_id, last_seen_event_key).
    """
    settings = get_settings()
    if not settings.ESPN_ENABLED:
        return live, None, None

    home = live.get("home_team", "")
    away = live.get("away_team", "")
    kickoff = live.get("kickoff")
    match_id = live.get("id")

    async def _refresh_fd() -> dict:
        if not match_id:
            return live
        refreshed = await get_live_match(str(match_id))
        return refreshed if refreshed.get("id") else live

    fd_live, espn_id = await asyncio.gather(
        _refresh_fd(),
        resolve_espn_event_id(home, away, kickoff),
    )

    match_data = fd_live
    last_key = None

    if not espn_id:
        return match_data, None, None

    snapshot = await get_espn_live_snapshot(espn_id)
    if not snapshot.get("error"):
        espn_match = {
            k: snapshot[k]
            for k in (
                "id", "espn_event_id", "home_team", "away_team", "home_logo", "away_logo",
                "kickoff", "status", "status_label", "minute", "home_goals", "away_goals",
                "group_name", "venue", "is_live", "source",
            )
            if k in snapshot
        }
        espn_match["id"] = match_id or espn_match.get("id")
        # Merge: ESPN live events/scores when present, keep Football-Data id
        match_data = {**fd_live, **espn_match, "id": match_id or fd_live.get("id")}
        details = snapshot.get("details") or []
        if details:
            last_key = details[-1].get("event_key")

    return match_data, espn_id, last_key


def health_info() -> dict:
    settings = reload_settings()
    comp = settings.competition
    return {
        "status": "ok",
        "provider": SOURCE,
        "espn_enabled": settings.ESPN_ENABLED,
        "espn_league": settings.ESPN_LEAGUE_SLUG,
        "football_data_configured": bool(settings.FOOTBALL_DATA_API_KEY),
        "mock_mode": settings.MOCK_MODE,
        "competition": settings.SPORTS_COMPETITION,
        "competition_code": comp["code"],
        "season": comp["season"],
        "cache": get_cache_stats(),
    }
