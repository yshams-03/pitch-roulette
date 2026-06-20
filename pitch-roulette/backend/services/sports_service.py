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
    if settings.MOCK_MODE:
        if stale_allowed:
            return stale_allowed
        return _empty_standings(competition, "mock_mode")

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
    if settings.MOCK_MODE:
        if stale_allowed:
            return stale_allowed
        return _empty_schedule(competition, "mock_mode")

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


FACTS_CACHE_TTL = 30

_STATUS_TO_FACTS = {
    "IN_PLAY": "1H",
    "PAUSED": "HT",
    "HT": "HT",
    "1H": "1H",
    "2H": "2H",
    "ET": "ET",
    "PEN": "PEN",
    "FINISHED": "FT",
    "FT": "FT",
    "SCHEDULED": "NS",
    "TIMED": "NS",
}


def _facts_status(code: str, minute: int | None = None) -> str:
    if code in _STATUS_TO_FACTS:
        mapped = _STATUS_TO_FACTS[code]
        if mapped == "1H" and minute is not None and minute > 45:
            return "2H"
        return mapped
    return code if code in ("NS", "1H", "HT", "2H", "ET", "PEN", "FT") else "NS"


def _empty_stats() -> dict:
    return {
        "possession": {"home": 50, "away": 50},
        "shots": {"home": 0, "away": 0},
        "shots_on_target": {"home": 0, "away": 0},
        "xg": {"home": 0.0, "away": 0.0},
        "corners": {"home": 0, "away": 0},
        "fouls": {"home": 0, "away": 0},
        "offsides": {"home": 0, "away": 0},
    }


def _has_meaningful_stats(stats: dict | None) -> bool:
    if not stats:
        return False
    for key in ("shots", "possession", "xg"):
        block = stats.get(key) or {}
        if (block.get("home") or 0) > 0 or (block.get("away") or 0) > 0:
            return True
        if key == "possession" and (
            block.get("home") != 50 or block.get("away") != 50
        ):
            return True
    return False


def _demo_player_name(player_id: str | None) -> str | None:
    if not player_id:
        return None
    try:
        from services.draft import DEMO_SQUAD
        for p in DEMO_SQUAD:
            if p["player_id"] == player_id:
                return p["name"]
    except Exception:
        pass
    return None


def _sim_event_to_fact(evt: dict, idx: int) -> dict | None:
    raw_type = str(evt.get("type") or "")
    team = "home"
    etype = "GOAL"
    if raw_type == "GOAL_HOME":
        team, etype = "home", "GOAL"
    elif raw_type == "GOAL_AWAY":
        team, etype = "away", "GOAL"
    elif raw_type == "YELLOW_CARD":
        etype = "YELLOW"
    elif raw_type == "RED_CARD":
        etype = "RED"
    elif raw_type == "PENALTY_SCORED":
        etype = "PENALTY_SCORED"
    elif raw_type == "PENALTY_MISSED":
        etype = "PENALTY_MISSED"
    else:
        return None

    hg = int(evt.get("home_goals") or 0)
    ag = int(evt.get("away_goals") or 0)
    player = _demo_player_name(evt.get("player_id")) or (
        "Goal scorer" if etype in ("GOAL", "PENALTY_SCORED") else "Player"
    )
    return {
        "id": evt.get("event_key") or f"sim-{idx}",
        "minute": int(evt.get("minute") or 0),
        "added_minute": None,
        "type": etype,
        "team": team,
        "player": player,
        "assist": None,
        "detail": f"{hg}-{ag}" if etype in ("GOAL", "PENALTY_SCORED") else None,
        "description": None,
    }


def _facts_from_simulation(sim: dict, match_data: dict | None) -> dict:
    md = match_data or {}
    home_team = sim.get("home_team") or md.get("home_team") or "Home"
    away_team = sim.get("away_team") or md.get("away_team") or "Away"
    home_score = int(sim.get("home_goals") or md.get("home_goals") or 0)
    away_score = int(sim.get("away_goals") or md.get("away_goals") or 0)
    minute = int(sim.get("minute") or md.get("minute") or 0)
    status_raw = str(sim.get("status") or md.get("status") or "IN_PLAY")
    events = []
    for i, evt in enumerate(sim.get("events_log") or []):
        mapped = _sim_event_to_fact(evt, i)
        if mapped:
            events.append(mapped)
    events.sort(key=lambda e: e["minute"], reverse=True)
    return {
        "match": {
            "home_team": home_team,
            "away_team": away_team,
            "home_score": home_score,
            "away_score": away_score,
            "minute": minute,
            "status": _facts_status(status_raw, minute),
            "added_time": None,
            "venue": md.get("venue"),
            "referee": None,
            "competition": md.get("group_name") or md.get("stage"),
        },
        "events": events,
        "stats": _empty_stats(),
        "_stats_available": False,
    }


def _match_block_from_sources(
    snapshot: dict | None,
    fd: dict | None,
    match_data: dict | None,
) -> dict:
    base = match_data or {}
    src = snapshot or fd or base
    minute = int(src.get("minute") or base.get("minute") or 0)
    status_raw = str(src.get("status") or base.get("status") or "NS")
    return {
        "home_team": src.get("home_team") or base.get("home_team") or "Home",
        "away_team": src.get("away_team") or base.get("away_team") or "Away",
        "home_score": int(src.get("home_goals") or base.get("home_goals") or 0),
        "away_score": int(src.get("away_goals") or base.get("away_goals") or 0),
        "minute": minute,
        "status": _facts_status(status_raw, minute),
        "added_time": src.get("added_time") or base.get("added_time"),
        "venue": src.get("venue") or base.get("venue"),
        "referee": src.get("referee") or base.get("referee"),
        "competition": src.get("group_name") or base.get("group_name") or base.get("stage"),
    }


def _room_events_fallback(room_id: str) -> list[dict]:
    try:
        from database import get_supabase
        db = get_supabase()
        rows = (
            db.table("room_events")
            .select("*")
            .eq("room_id", room_id)
            .order("minute")
            .execute()
            .data
            or []
        )
    except Exception:
        return []

    events: list[dict] = []
    for i, row in enumerate(rows):
        payload = row.get("payload") or {}
        if isinstance(payload, dict) and payload.get("type"):
            mapped = _sim_event_to_fact(payload, i)
            if not mapped:
                etype = str(payload.get("type") or "GOAL")
                if etype == "GOAL":
                    team = "home"
                elif etype in ("YELLOW_CARD", "RED_CARD", "PENALTY"):
                    team = "home"
                else:
                    team = "home"
                mapped = {
                    "id": row.get("event_key") or f"room-{i}",
                    "minute": int(row.get("minute") or payload.get("minute") or 0),
                    "type": etype.replace("_CARD", "") if "CARD" in etype else etype,
                    "team": team,
                    "player": payload.get("player") or "Player",
                    "description": payload.get("type_text"),
                }
            events.append(mapped)
    return sorted(events, key=lambda e: e.get("minute", 0), reverse=True)


async def get_live_match_facts(
    match_id: str,
    *,
    room: dict | None = None,
) -> dict:
    """Enriched live match facts — ESPN → Football-Data → room_events / simulation."""
    from services.match_engine import DEMO_MATCH_ID, infer_match_source

    settings = get_settings()
    room_code = (room or {}).get("room_code") or ""
    cache_key = f"facts:{room_code or match_id}"
    cached = get_cached(cache_key)
    if cached:
        return cached

    match_data = (room or {}).get("match_data") or {}
    src = infer_match_source(room) if room else "live_api"

    def _simulation_payload(r: dict) -> dict:
        sim = r.get("match_simulation_json")
        if isinstance(sim, dict) and sim:
            return dict(sim)
        return dict(r.get("match_data") or {})

    if room and (
        src in ("demo_simulation", "manual")
        or match_id in (DEMO_MATCH_ID,)
        or str(match_id).startswith("demo-")
    ):
        sim = _simulation_payload(room)
        payload = _facts_from_simulation(sim, match_data)
        payload["fetched_at"] = datetime.now(timezone.utc).isoformat()
        set_cached(cache_key, payload, FACTS_CACHE_TTL)
        return payload

    events: list[dict] = []
    stats: dict | None = None
    espn_event_id = (room or {}).get("espn_event_id")
    snapshot: dict | None = None
    fd_live: dict | None = None

    if espn_event_id and not str(espn_event_id).startswith("demo-"):
        raw_data, snapshot, err = await espn.fetch_summary_raw(str(espn_event_id))
        if snapshot and not err:
            events = espn.facts_events_from_snapshot(snapshot, raw_data)
            stats = espn.extract_stats_from_summary(raw_data, snapshot)
            events.sort(key=lambda e: e["minute"], reverse=True)

    if not events and match_id and not str(match_id).startswith("demo-"):
        fd_raw, fd_err = await football_data.fetch_match_raw(str(match_id))
        if fd_raw and not fd_err:
            events = football_data.parse_fd_match_events(fd_raw)
            fd_live = _normalize_match_from_raw(fd_raw)
            events.sort(key=lambda e: e["minute"], reverse=True)

    if not events and room:
        events = _room_events_fallback(room["id"])

    if not fd_live and match_id:
        fd_live, _ = await football_data.fetch_fixture_by_id(str(match_id))

    if not snapshot and espn_event_id and not str(espn_event_id).startswith("demo-"):
        snapshot, _ = await espn.fetch_summary(str(espn_event_id))

    match_block = _match_block_from_sources(snapshot, fd_live, match_data)
    if not espn_event_id and room and not events:
        home = match_block["home_team"]
        away = match_block["away_team"]
        kickoff = match_data.get("kickoff")
        resolved = await resolve_espn_event_id(home, away, kickoff)
        if resolved:
            raw_data, snapshot, err = await espn.fetch_summary_raw(resolved)
            if snapshot and not err:
                events = espn.facts_events_from_snapshot(snapshot, raw_data)
                if not stats:
                    stats = espn.extract_stats_from_summary(raw_data, snapshot)
                match_block = _match_block_from_sources(snapshot, fd_live, match_data)
                events.sort(key=lambda e: e["minute"], reverse=True)

    payload = {
        "match": match_block,
        "events": events,
        "stats": stats if _has_meaningful_stats(stats) else _empty_stats(),
        "_stats_available": _has_meaningful_stats(stats),
        "fetched_at": datetime.now(timezone.utc).isoformat(),
    }
    set_cached(cache_key, payload, FACTS_CACHE_TTL)
    return payload


def _normalize_match_from_raw(raw: dict) -> dict:
    from services.football_data import _normalize_match
    return _normalize_match(raw)


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
