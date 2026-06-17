"""API-Football client + normalized responses."""
from __future__ import annotations

import logging
import re

import httpx

from config import get_settings
from services.sports_cache import record_api_call, record_api_error

logger = logging.getLogger(__name__)

_LIVE = frozenset({"1H", "HT", "2H", "ET", "BT", "P", "LIVE", "INT", "IN_PLAY"})
_STATUS_LABELS = {
    "NS": "Scheduled", "TBD": "TBD", "1H": "Live", "HT": "Half time",
    "2H": "Live", "ET": "Extra time", "BT": "Break", "P": "Penalties",
    "FT": "Full time", "AET": "After ET", "PEN": "Penalties", "LIVE": "Live",
}


def _parse_group_name(raw: str | None) -> str | None:
    if not raw:
        return None
    match = re.search(r"Group\s+([A-Z])", raw, re.IGNORECASE)
    if match:
        return match.group(1).upper()
    return raw


def _api_error_message(data: dict) -> str | None:
    errors = data.get("errors")
    if not errors:
        return None
    if isinstance(errors, dict):
        if errors.get("rate_limit"):
            return "API rate limit reached — try again shortly"
        if errors.get("no_key"):
            return "API key not configured"
        if errors.get("network"):
            return f"Network error: {errors['network']}"
        for value in errors.values():
            if isinstance(value, str) and value.strip():
                return value.strip()
    return "API request failed"


async def _api_get(endpoint: str, params: dict) -> tuple[dict, str | None]:
    settings = get_settings()
    if not settings.API_FOOTBALL_KEY:
        return {"response": [], "errors": {"message": "no_key"}}, "API key not configured"

    record_api_call()
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(12.0, connect=5.0)) as client:
            r = await client.get(
                f"{settings.API_FOOTBALL_BASE_URL}/{endpoint}",
                headers={"x-apisports-key": settings.API_FOOTBALL_KEY},
                params=params,
            )
            if r.status_code == 429:
                record_api_error()
                return {"response": [], "errors": {"rate_limit": True}}, "API rate limit reached"
            data = r.json()
            err = _api_error_message(data)
            if r.status_code != 200 or err:
                record_api_error()
                if not err:
                    err = f"HTTP {r.status_code}"
            return data, err
    except httpx.HTTPError as e:
        logger.error("API-Football error: %s", e)
        record_api_error()
        return {"response": [], "errors": {"network": str(e)}}, f"Network error: {e}"


def _normalize_fixture(item: dict) -> dict:
    fixture = item.get("fixture", {})
    teams = item.get("teams", {})
    goals = item.get("goals", {}) or {}
    league = item.get("league", {})
    status = fixture.get("status", {})
    short = status.get("short", "NS")
    home = teams.get("home", {})
    away = teams.get("away", {})
    round_name = league.get("round")
    return {
        "id": str(fixture.get("id", "")),
        "home_team": home.get("name", "Home"),
        "away_team": away.get("name", "Away"),
        "home_logo": home.get("logo"),
        "away_logo": away.get("logo"),
        "kickoff": fixture.get("date"),
        "status": short,
        "status_label": _STATUS_LABELS.get(short, short),
        "minute": status.get("elapsed"),
        "home_goals": goals.get("home") if goals.get("home") is not None else 0,
        "away_goals": goals.get("away") if goals.get("away") is not None else 0,
        "group_name": _parse_group_name(round_name) or round_name,
        "venue": fixture.get("venue", {}).get("name"),
        "is_live": short in _LIVE,
    }


async def fetch_standings(league_id: int, season: int) -> tuple[list[dict], str | None]:
    data, err = await _api_get("standings", {"league": league_id, "season": season})
    rows = []
    for block in data.get("response", []):
        for group in block.get("league", {}).get("standings", []):
            group_name = None
            if isinstance(group, list) and group:
                group_name = _parse_group_name(group[0].get("group"))
            for entry in group if isinstance(group, list) else []:
                team = entry.get("team", {})
                all_stats = entry.get("all", {})
                rows.append({
                    "rank": entry.get("rank", 0),
                    "team": team.get("name", ""),
                    "team_logo": team.get("logo"),
                    "played": all_stats.get("played", 0),
                    "won": all_stats.get("win", 0),
                    "draw": all_stats.get("draw", 0),
                    "lost": all_stats.get("lose", 0),
                    "goals_for": all_stats.get("goals", {}).get("for", 0),
                    "goals_against": all_stats.get("goals", {}).get("against", 0),
                    "goal_diff": entry.get("goalsDiff", 0),
                    "points": entry.get("points", 0),
                    "group": group_name or _parse_group_name(entry.get("group")),
                })
    if rows:
        return rows, None
    return [], err


async def fetch_fixtures(league_id: int, season: int) -> tuple[list[dict], str | None]:
    data, err = await _api_get("fixtures", {"league": league_id, "season": season})
    items = [_normalize_fixture(item) for item in data.get("response", [])]
    if items:
        return items, None
    return [], err


async def fetch_fixture_by_id(match_id: str) -> tuple[dict | None, str | None]:
    data, err = await _api_get("fixtures", {"id": match_id})
    items = data.get("response", [])
    if items:
        return _normalize_fixture(items[0]), None
    return None, err or "Match not found"
