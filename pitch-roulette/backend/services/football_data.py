"""Football-Data.org v4 client + normalized responses."""
from __future__ import annotations

import asyncio
import logging
from collections import defaultdict

import httpx

from config import get_settings
from services.sports_cache import record_api_call, record_api_error

logger = logging.getLogger(__name__)

_LIVE = frozenset({"IN_PLAY", "PAUSED", "LIVE"})
_STATUS_LABELS = {
    "SCHEDULED": "Scheduled",
    "TIMED": "Scheduled",
    "IN_PLAY": "Live",
    "PAUSED": "Half time",
    "FINISHED": "Full time",
    "SUSPENDED": "Suspended",
    "POSTPONED": "Postponed",
    "CANCELLED": "Cancelled",
    "AWARDED": "Awarded",
}


def _parse_group(group: str | None) -> str | None:
    if not group:
        return None
    if group.upper().startswith("GROUP_"):
        return group.upper().replace("GROUP_", "")
    return group.upper()


def _api_error_message(data: dict, status_code: int) -> str | None:
    if data.get("message"):
        return str(data["message"])
    if status_code == 429:
        return "Football-Data.org rate limit reached — try again shortly"
    if status_code == 403:
        return "Football-Data.org access denied — check your API token and plan"
    if status_code == 404:
        return "Resource not found on Football-Data.org"
    if status_code >= 400:
        return f"Football-Data.org HTTP {status_code}"
    return None


async def _api_get(path: str, params: dict | None = None) -> tuple[dict, str | None]:
    settings = get_settings()
    if not settings.FOOTBALL_DATA_API_KEY:
        return {}, "Football-Data.org API key not configured (FOOTBALL_DATA_API_KEY)"

    record_api_call()
    url = f"{settings.FOOTBALL_DATA_BASE_URL.rstrip('/')}/{path.lstrip('/')}"
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(6.0, connect=3.0)) as client:
            r = await client.get(
                url,
                headers={"X-Auth-Token": settings.FOOTBALL_DATA_API_KEY},
                params=params or {},
            )
            data = r.json() if r.content else {}
            err = _api_error_message(data if isinstance(data, dict) else {}, r.status_code)
            if r.status_code != 200:
                record_api_error()
                return data if isinstance(data, dict) else {}, err
            if err:
                record_api_error()
            return data, err
    except httpx.HTTPError as e:
        detail = str(e) or type(e).__name__
        logger.warning("Football-Data.org request failed (%s): %s", path, detail)
        record_api_error()
        return {}, f"Network error: {detail}"


def _score_side(score: dict | None, side: str) -> int:
    if not score:
        return 0
    for key in ("fullTime", "regularTime", "halfTime"):
        block = score.get(key) or {}
        val = block.get(side)
        if val is not None:
            return int(val)
    return 0


def _team_name(team: dict | None, fallback: str) -> str:
    if not team:
        return fallback
    name = team.get("name")
    if isinstance(name, str) and name.strip():
        return name.strip()
    short = team.get("shortName")
    if isinstance(short, str) and short.strip():
        return short.strip()
    return fallback


def _normalize_match(item: dict) -> dict:
    status = item.get("status", "SCHEDULED")
    home = item.get("homeTeam") or {}
    away = item.get("awayTeam") or {}
    score = item.get("score") or {}
    group = _parse_group(item.get("group"))
    stage = item.get("stage")
    placeholder = "TBD"
    return {
        "id": str(item.get("id", "")),
        "home_team": _team_name(home, placeholder),
        "away_team": _team_name(away, placeholder),
        "home_logo": home.get("crest"),
        "away_logo": away.get("crest"),
        "kickoff": item.get("utcDate"),
        "status": status,
        "status_label": _STATUS_LABELS.get(status, status),
        "minute": item.get("minute"),
        "home_goals": _score_side(score, "home"),
        "away_goals": _score_side(score, "away"),
        "group_name": f"Group {group}" if group else item.get("stage"),
        "venue": item.get("venue"),
        "is_live": status in _LIVE,
        "stage": stage,
        "group": group,
    }


def _standings_from_api(data: dict) -> list[dict]:
    rows: list[dict] = []
    for block in data.get("standings") or []:
        if block.get("type") not in (None, "TOTAL"):
            continue
        group = _parse_group(block.get("group"))
        for entry in block.get("table") or []:
            team = entry.get("team") or {}
            rows.append({
                "rank": entry.get("position", 0),
                "team": team.get("name", ""),
                "team_logo": team.get("crest"),
                "played": entry.get("playedGames", 0),
                "won": entry.get("won", 0),
                "draw": entry.get("draw", 0),
                "lost": entry.get("lost", 0),
                "goals_for": entry.get("goalsFor", 0),
                "goals_against": entry.get("goalsAgainst", 0),
                "goal_diff": entry.get("goalDifference", 0),
                "points": entry.get("points", 0),
                "group": group,
            })
    return rows


def _standings_from_matches(matches: list[dict]) -> list[dict]:
    """Build group tables when standings endpoint is unavailable (CUP competitions)."""
    tables: dict[str, dict[str, dict]] = defaultdict(
        lambda: defaultdict(lambda: {
            "team": "",
            "team_logo": None,
            "played": 0,
            "won": 0,
            "draw": 0,
            "lost": 0,
            "goals_for": 0,
            "goals_against": 0,
            "goal_diff": 0,
            "points": 0,
        })
    )

    for m in matches:
        if m.get("stage") != "GROUP_STAGE":
            continue
        group = m.get("group")
        if not group:
            continue
        home = m.get("home_team", "")
        away = m.get("away_team", "")
        tables[group][home]["team"] = home
        tables[group][home]["team_logo"] = m.get("home_logo")
        tables[group][away]["team"] = away
        tables[group][away]["team_logo"] = m.get("away_logo")

        if m.get("status") != "FINISHED":
            continue

        hg = int(m.get("home_goals", 0))
        ag = int(m.get("away_goals", 0))
        for team, gf, ga in ((home, hg, ag), (away, ag, hg)):
            row = tables[group][team]
            row["played"] += 1
            row["goals_for"] += gf
            row["goals_against"] += ga
            if gf > ga:
                row["won"] += 1
                row["points"] += 3
            elif gf < ga:
                row["lost"] += 1
            else:
                row["draw"] += 1
                row["points"] += 1
            row["goal_diff"] = row["goals_for"] - row["goals_against"]

    rows: list[dict] = []
    for group in sorted(tables.keys()):
        group_rows = list(tables[group].values())
        group_rows.sort(key=lambda r: (-r["points"], -r["goal_diff"], -r["goals_for"], r["team"]))
        for rank, row in enumerate(group_rows, 1):
            rows.append({
                "rank": rank,
                "team": row["team"],
                "team_logo": row["team_logo"],
                "played": row["played"],
                "won": row["won"],
                "draw": row["draw"],
                "lost": row["lost"],
                "goals_for": row["goals_for"],
                "goals_against": row["goals_against"],
                "goal_diff": row["goal_diff"],
                "points": row["points"],
                "group": group,
            })
    return rows


async def fetch_standings(competition_code: str, season: int) -> tuple[list[dict], str | None]:
    (data, err), (matches, match_err) = await asyncio.gather(
        _api_get(f"competitions/{competition_code}/standings", {"season": season}),
        fetch_fixtures(competition_code, season),
    )
    rows = _standings_from_api(data)
    has_groups = any(r.get("group") for r in rows)

    computed = _standings_from_matches(matches)
    if computed and (not rows or not has_groups):
        return computed, None
    if rows:
        return rows, None
    if computed:
        return computed, None

    return [], err or match_err


async def fetch_fixtures(competition_code: str, season: int) -> tuple[list[dict], str | None]:
    data, err = await _api_get(
        f"competitions/{competition_code}/matches",
        {"season": season},
    )
    items = [_normalize_match(m) for m in data.get("matches") or []]
    if items:
        return items, None
    return [], err


async def fetch_fixture_by_id(match_id: str) -> tuple[dict | None, str | None]:
    data, err = await _api_get(f"matches/{match_id}")
    if data.get("id"):
        return _normalize_match(data), None
    return None, err or "Match not found"


async def fetch_match_raw(match_id: str) -> tuple[dict | None, str | None]:
    data, err = await _api_get(f"matches/{match_id}")
    if data.get("id"):
        return data, None
    return None, err or "Match not found"


def _fd_team_side(team: dict | None, home: dict, away: dict) -> str:
    tid = str((team or {}).get("id", ""))
    if tid and tid == str(home.get("id", "")):
        return "home"
    if tid and tid == str(away.get("id", "")):
        return "away"
    name = _team_name(team, "")
    if name and name == _team_name(home, ""):
        return "home"
    return "away"


def parse_fd_match_events(raw: dict) -> list[dict]:
    """Goals, bookings, substitutions from Football-Data.org match payload."""
    home = raw.get("homeTeam") or {}
    away = raw.get("awayTeam") or {}
    events: list[dict] = []
    idx = 0

    for goal in raw.get("goals") or []:
        team = _fd_team_side(goal.get("team"), home, away)
        scorer = (goal.get("scorer") or {}).get("name") or "Unknown"
        assist_name = (goal.get("assist") or {}).get("name")
        minute = int(goal.get("minute") or 0)
        gtype = (goal.get("type") or "REGULAR").upper()
        etype = "OWN_GOAL" if gtype == "OWN" else "GOAL"
        hg = _score_side(raw.get("score"), "home")
        ag = _score_side(raw.get("score"), "away")
        events.append({
            "id": f"fd-goal-{idx}",
            "minute": minute,
            "added_minute": goal.get("injuryTime"),
            "type": etype,
            "team": team,
            "player": scorer,
            "assist": assist_name,
            "detail": f"{hg}-{ag}",
            "description": None,
        })
        idx += 1

    for card in raw.get("bookings") or []:
        team = _fd_team_side(card.get("team"), home, away)
        player = (card.get("player") or {}).get("name") or "Unknown"
        minute = int(card.get("minute") or 0)
        card_type = (card.get("card") or "YELLOW").upper()
        etype = "RED" if card_type == "RED" else "YELLOW"
        events.append({
            "id": f"fd-card-{idx}",
            "minute": minute,
            "type": etype,
            "team": team,
            "player": player,
            "description": None,
        })
        idx += 1

    for sub in raw.get("substitutions") or []:
        team = _fd_team_side(sub.get("team"), home, away)
        minute = int(sub.get("minute") or 0)
        player_out = (sub.get("playerOut") or {}).get("name") or "Out"
        player_in = (sub.get("playerIn") or {}).get("name") or "In"
        events.append({
            "id": f"fd-sub-{idx}",
            "minute": minute,
            "type": "SUBSTITUTION",
            "team": team,
            "player": player_in,
            "assist": player_out,
            "description": None,
        })
        idx += 1

    return sorted(events, key=lambda e: (e.get("minute") or 0))
