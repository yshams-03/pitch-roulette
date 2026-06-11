"""Big Balls Sports Data provider — https://bigballsdata.com/football-api"""
from __future__ import annotations

import logging
from typing import Any

import httpx

from config import get_settings

logger = logging.getLogger(__name__)

_BASE = "https://api.bigballsdata.com"
_SEARCH_LEAGUES = ("epl", "laliga", "bundesliga", "serie-a", "ligue-1", "mls")

_STATUS_MAP = {
    "scheduled": "NS",
    "not_started": "NS",
    "timed": "NS",
    "in_progress": "LIVE",
    "live": "LIVE",
    "1h": "1H",
    "2h": "2H",
    "halftime": "HT",
    "paused": "HT",
    "finished": "FT",
    "final": "FT",
    "ft": "FT",
}


def is_configured() -> bool:
    return bool(get_settings().BIG_BALLS_API_KEY)


def _headers() -> dict[str, str]:
    key = get_settings().BIG_BALLS_API_KEY
    return {
        "Authorization": f"Bearer {key}",
        "x-api-key": key,
    }


async def _get(path: str, params: dict | None = None) -> dict | None:
    if not is_configured():
        return None
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            r = await client.get(f"{_BASE}{path}", headers=_headers(), params=params or {})
            if r.status_code == 429:
                logger.warning("Big Balls API rate limit hit")
                return None
            if r.status_code != 200:
                logger.warning("Big Balls %s -> HTTP %s", path, r.status_code)
                return None
            body = r.json()
            if body.get("error"):
                logger.warning("Big Balls error: %s", body["error"])
                return None
            return body
    except httpx.HTTPError as e:
        logger.error("Big Balls API error: %s", e)
        return None


def _team_name(team: Any) -> str:
    if isinstance(team, str):
        return team
    if isinstance(team, dict):
        return team.get("name") or team.get("short_name") or ""
    return ""


def _extract_match_list(body: dict | None) -> list[dict]:
    """Normalize Big Balls list responses (stored feed vs live scores wrapper)."""
    if not body:
        return []
    data = body.get("data")
    if isinstance(data, list):
        return [m for m in data if isinstance(m, dict)]
    if not isinstance(data, dict):
        return []

    for key in ("matches", "items", "results"):
        nested = data.get(key)
        if isinstance(nested, list):
            return [m for m in nested if isinstance(m, dict)]

    scores = data.get("scores")
    if isinstance(scores, dict):
        value = scores.get("value")
        if isinstance(value, list):
            return [m for m in value if isinstance(m, dict)]
    return []


def _match_id(m: dict) -> str:
    return str(m.get("id") or m.get("match_id") or "")


def _team_logo(team: Any) -> str | None:
    if isinstance(team, dict):
        return team.get("logo_url") or team.get("logo")
    return None


def _team_id(team: Any) -> int | str | None:
    if isinstance(team, dict):
        return team.get("id")
    return None


def _normalize_match(m: dict) -> dict:
    home = m.get("home")
    away = m.get("away")
    status_raw = str(m.get("status", "scheduled")).lower().replace("-", "_")
    score = m.get("score") or m.get("scores", {}).get("value") or {}
    minute = m.get("minute") or m.get("elapsed")

    return {
        "fixture": {
            "id": m.get("id") or m.get("match_id"),
            "date": m.get("kickoff_utc") or m.get("kickoff") or m.get("date"),
            "venue": {"name": m.get("venue") or m.get("broadcast", "")},
            "status": {
                "short": _STATUS_MAP.get(status_raw, status_raw.upper()[:3]),
                "elapsed": minute,
            },
        },
        "teams": {
            "home": {
                "name": _team_name(home),
                "id": _team_id(home),
                "logo": _team_logo(home),
            },
            "away": {
                "name": _team_name(away),
                "id": _team_id(away),
                "logo": _team_logo(away),
            },
        },
        "goals": {
            "home": score.get("home"),
            "away": score.get("away"),
        },
        "_source": "bigballs",
    }


def _match_matches_query(m: dict, query: str) -> bool:
    q = query.lower()
    home = _team_name(m.get("home")).lower()
    away = _team_name(m.get("away")).lower()
    return q in home or q in away or q in home.replace(" fc", "") or q in away.replace(" fc", "")


def _team_id(team: Any) -> int | str | None:
    if isinstance(team, dict):
        return team.get("id")
    return None


def _is_searchable_status(status: str) -> bool:
    return status in {
        "scheduled", "not_started", "timed", "ns",
        "in_progress", "live", "1h", "2h", "halftime", "paused",
    }


async def search_fixtures(query: str) -> list[dict]:
    q = query.strip()
    if len(q) < 2:
        return []

    seen: set[str] = set()
    results: list[dict] = []

    async def _collect(params: dict) -> None:
        nonlocal results
        body = await _get("/v1/stored/matches", params)
        for m in _extract_match_list(body):
            mid = _match_id(m)
            if not mid or mid in seen:
                continue
            status = str(m.get("status", "")).lower()
            if not _is_searchable_status(status):
                continue
            if not _match_matches_query(m, q):
                continue
            seen.add(mid)
            results.append(_normalize_match(m))
            if len(results) >= 20:
                return

    await _collect({"sport": "football", "status": "scheduled", "limit": 200})
    if len(results) < 20:
        await _collect({"sport": "football", "status": "in_progress", "limit": 50})
    if len(results) < 20:
        for league in _SEARCH_LEAGUES:
            await _collect({"sport": "football", "league": league, "limit": 100})
            if len(results) >= 20:
                break

    return results[:20]


async def get_fixture(fixture_id: str | int) -> dict | None:
    fid = str(fixture_id)
    body = await _get(f"/v1/stored/matches/{fid}")
    matches = _extract_match_list(body)
    if not matches and isinstance(body, dict) and isinstance(body.get("data"), dict):
        matches = [body["data"]]
    if matches:
        return _normalize_match(matches[0])

    body = await _get(f"/v1/matches/{fid}")
    matches = _extract_match_list(body)
    if matches:
        return _normalize_match(matches[0])
    if body and isinstance(body.get("data"), dict) and body["data"].get("home"):
        return _normalize_match(body["data"])
    return None


def _map_players(players: list) -> list[dict]:
    mapped = []
    for p in players:
        if isinstance(p, dict) and "player" in p:
            mapped.append(p)
            continue
        if not isinstance(p, dict):
            continue
        mapped.append({
            "player": {
                "id": p.get("id") or p.get("player_id"),
                "name": p.get("name") or p.get("player_name"),
                "number": p.get("number") or p.get("shirt_number"),
                "pos": p.get("pos") or p.get("position") or "M",
            },
        })
    return mapped


async def get_lineups(fixture_id: str | int) -> dict:
    fid = str(fixture_id)
    body = await _get(f"/v1/stored/matches/{fid}/lineups")
    if not body:
        return {"available": False, "lineups": []}

    data = body.get("data")
    if not data:
        return {"available": False, "lineups": []}

    lineups: list[dict] = []

    if isinstance(data, list):
        for entry in data:
            team = entry.get("team")
            team_name = _team_name(team) if team else entry.get("team_name", "")
            players = entry.get("startXI") or entry.get("starting_xi") or entry.get("lineup") or []
            lineups.append({
                "team": team_name,
                "formation": entry.get("formation", ""),
                "startXI": _map_players(players),
            })
    elif isinstance(data, dict):
        for side in ("home", "away"):
            side_data = data.get(side)
            if not side_data:
                continue
            if isinstance(side_data, dict):
                players = side_data.get("starting_xi") or side_data.get("startXI") or side_data.get("lineup") or []
                lineups.append({
                    "team": _team_name(side_data.get("team")) or side_data.get("name", side.title()),
                    "formation": side_data.get("formation", ""),
                    "startXI": _map_players(players),
                })

    if not lineups or not any(l.get("startXI") for l in lineups):
        return {"available": False, "lineups": []}
    return {"available": True, "lineups": lineups}


async def get_live_events(fixture_id: str | int) -> list[dict]:
    fid = str(fixture_id)
    body = await _get(f"/v1/matches/{fid}/events")
    if not body:
        return []

    raw = body.get("data") or []
    if isinstance(raw, dict):
        raw = raw.get("events") or raw.get("items") or []

    events: list[dict] = []
    for i, ev in enumerate(raw):
        if not isinstance(ev, dict):
            continue
        ev_type = str(ev.get("type", "")).lower()
        if ev_type in ("goal", "penalty_goal"):
            mapped_type = "Goal"
            detail = ev.get("detail") or "Normal Goal"
        elif "card" in ev_type or ev_type in ("yellow", "red"):
            mapped_type = "Card"
            detail = ev.get("detail") or ("Yellow Card" if "yellow" in ev_type else "Red Card")
        elif ev_type in ("subst", "substitution"):
            mapped_type = "subst"
            detail = "Substitution"
        elif ev_type == "var":
            mapped_type = "Var"
            detail = ev.get("detail") or "VAR"
        else:
            mapped_type = ev.get("type", "Goal")
            detail = ev.get("detail") or mapped_type

        minute = ev.get("minute") or ev.get("time") or ev.get("elapsed") or 0
        player = ev.get("player") or {}
        team = ev.get("team") or {}

        events.append({
            "id": str(ev.get("id") or f"{fid}-ev-{i}-{minute}"),
            "type": mapped_type if isinstance(mapped_type, str) and mapped_type[0].isupper() else mapped_type.title(),
            "detail": detail,
            "team": {"name": _team_name(team)},
            "player": {"name": player.get("name") if isinstance(player, dict) else str(player)},
            "time": {"elapsed": minute},
        })
    return events


async def get_live_stats(fixture_id: str | int) -> dict:
    fid = str(fixture_id)
    body = await _get(f"/v1/stored/matches/{fid}/stats")
    if not body:
        return {"response": []}

    data = body.get("data")
    if not data:
        return {"response": []}

    response = []

    def _possession_entry(team_label: str, stats: dict) -> dict | None:
        poss = stats.get("possession") or stats.get("ball_possession")
        if poss is None:
            return None
        val = f"{poss}%" if isinstance(poss, (int, float)) and "%" not in str(poss) else str(poss)
        return {
            "team": {"name": team_label},
            "statistics": [{"type": "Ball Possession", "value": val}],
        }

    if isinstance(data, dict):
        home_stats = data.get("home") or {}
        away_stats = data.get("away") or {}
        if isinstance(home_stats, dict):
            entry = _possession_entry(_team_name(home_stats.get("team")) or "Home", home_stats)
            if entry:
                response.append(entry)
        if isinstance(away_stats, dict):
            entry = _possession_entry(_team_name(away_stats.get("team")) or "Away", away_stats)
            if entry:
                response.append(entry)
        poss = data.get("possession")
        if poss and isinstance(poss, dict) and len(response) < 2:
            for side, label in (("home", "Home"), ("away", "Away")):
                if side in poss:
                    response.append({
                        "team": {"name": label},
                        "statistics": [{"type": "Ball Possession", "value": f"{poss[side]}%"}],
                    })

    return {"response": response}


async def get_player_ratings(fixture_id: str | int) -> list[dict]:
    # Big Balls has season stats, not per-match ratings — fantasy sync stays empty on fallback
    return []
