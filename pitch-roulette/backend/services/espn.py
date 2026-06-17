"""ESPN public site API — live scores and match events (undocumented, no auth)."""
from __future__ import annotations

import logging
import re
from datetime import datetime

import httpx

from config import get_settings

logger = logging.getLogger(__name__)

_LIVE_STATES = frozenset({"in", "pre"})  # pre = about to start, in = live
_LIVE_NAMES = frozenset({
    "STATUS_IN_PROGRESS",
    "STATUS_FIRST_HALF",
    "STATUS_HALFTIME",
    "STATUS_SECOND_HALF",
    "STATUS_EXTRA_TIME",
    "STATUS_PENALTIES",
    "STATUS_PAUSE",
})

_STATUS_MAP = {
    "STATUS_SCHEDULED": ("SCHEDULED", "Scheduled"),
    "STATUS_IN_PROGRESS": ("IN_PLAY", "Live"),
    "STATUS_FIRST_HALF": ("1H", "Live"),
    "STATUS_HALFTIME": ("HT", "Half time"),
    "STATUS_SECOND_HALF": ("2H", "Live"),
    "STATUS_EXTRA_TIME": ("ET", "Extra time"),
    "STATUS_PENALTIES": ("P", "Penalties"),
    "STATUS_FULL_TIME": ("FINISHED", "Full time"),
    "STATUS_FINAL": ("FINISHED", "Full time"),
    "STATUS_PAUSE": ("PAUSED", "Paused"),
    "STATUS_POSTPONED": ("POSTPONED", "Postponed"),
    "STATUS_CANCELED": ("CANCELLED", "Cancelled"),
}


def _norm_team(name: str) -> str:
    return re.sub(r"[^a-z0-9]", "", (name or "").lower())


def _teams_match(a: str, b: str) -> bool:
    na, nb = _norm_team(a), _norm_team(b)
    if not na or not nb:
        return False
    return na == nb or na in nb or nb in na


def _kickoff_date(iso: str | None) -> str | None:
    if not iso:
        return None
    try:
        dt = datetime.fromisoformat(iso.replace("Z", "+00:00"))
        return dt.strftime("%Y%m%d")
    except ValueError:
        return None


def _parse_group(alt_note: str | None) -> str | None:
    if not alt_note:
        return None
    m = re.search(r"Group\s+([A-L])\b", alt_note, re.I)
    return m.group(1).upper() if m else None


def _competitors(competition: dict) -> tuple[dict, dict]:
    comps = competition.get("competitors") or []
    home = next((c for c in comps if c.get("homeAway") == "home"), comps[0] if comps else {})
    away = next((c for c in comps if c.get("homeAway") == "away"), comps[1] if len(comps) > 1 else {})
    return home, away


def _status_tuple(status: dict | None) -> tuple[str, str, bool, int | None]:
    status = status or {}
    stype = status.get("type") or {}
    name = stype.get("name", "STATUS_SCHEDULED")
    code, label = _STATUS_MAP.get(name, ("SCHEDULED", stype.get("description", "Scheduled")))
    state = stype.get("state", "")
    is_live = state == "in" or name in _LIVE_NAMES
    minute = None
    clock = status.get("displayClock") or ""
    if is_live and clock:
        m = re.match(r"(\d+)", clock)
        if m:
            minute = int(m.group(1))
    return code, label, is_live, minute


def _detail_event_key(event_id: str, detail: dict, index: int) -> str:
    clock = (detail.get("clock") or {}).get("value", 0)
    type_id = (detail.get("type") or {}).get("id", "0")
    athletes = detail.get("athletesInvolved") or []
    player_id = athletes[0].get("id", "0") if athletes else "0"
    return f"espn-{event_id}-{index}-{type_id}-{clock}-{player_id}"


def _classify_detail(detail: dict) -> str | None:
    text = ((detail.get("type") or {}).get("text") or "").lower()
    if detail.get("scoringPlay") or "goal" in text:
        return "GOAL"
    if detail.get("redCard") or "red card" in text:
        return "RED_CARD"
    if detail.get("yellowCard") or "yellow card" in text:
        return "YELLOW_CARD"
    if detail.get("penaltyKick") or "penalty" in text:
        return "PENALTY"
    return None


def normalize_detail(detail: dict, index: int, event_id: str) -> dict:
    dtype = _classify_detail(detail)
    athletes = detail.get("athletesInvolved") or []
    player = athletes[0].get("displayName") if athletes else None
    return {
        "event_key": _detail_event_key(event_id, detail, index),
        "type": dtype,
        "type_text": (detail.get("type") or {}).get("text"),
        "minute": (detail.get("clock") or {}).get("displayValue"),
        "player": player,
        "team_id": (detail.get("team") or {}).get("id"),
        "scoring_play": bool(detail.get("scoringPlay")),
        "yellow_card": bool(detail.get("yellowCard")),
        "red_card": bool(detail.get("redCard")),
        "penalty": bool(detail.get("penaltyKick")),
    }


def normalize_event(event: dict) -> dict:
    event_id = str(event.get("id", ""))
    competition = (event.get("competitions") or [{}])[0]
    home_c, away_c = _competitors(competition)
    home_team = (home_c.get("team") or {}).get("displayName", "TBD")
    away_team = (away_c.get("team") or {}).get("displayName", "TBD")
    status = competition.get("status") or event.get("status")
    code, label, is_live, minute = _status_tuple(status)
    group = _parse_group(competition.get("altGameNote"))
    venue = (competition.get("venue") or {}).get("fullName") or (event.get("venue") or {}).get("displayName")
    raw_details = competition.get("details") or []
    if not isinstance(raw_details, list):
        raw_details = []

    return {
        "espn_event_id": event_id,
        "id": event_id,
        "home_team": home_team,
        "away_team": away_team,
        "home_logo": (home_c.get("team") or {}).get("logo"),
        "away_logo": (away_c.get("team") or {}).get("logo"),
        "kickoff": competition.get("date") or event.get("date"),
        "status": code,
        "status_label": label,
        "minute": minute,
        "home_goals": int(home_c.get("score") or 0),
        "away_goals": int(away_c.get("score") or 0),
        "group_name": f"Group {group}" if group else competition.get("altGameNote"),
        "group": group,
        "venue": venue,
        "is_live": is_live,
        "source": "espn",
        "details": [normalize_detail(d, i, event_id) for i, d in enumerate(raw_details)],
    }


async def _get(path: str, params: dict | None = None) -> tuple[dict, str | None]:
    settings = get_settings()
    url = f"{settings.ESPN_BASE_URL.rstrip('/')}/{path.lstrip('/')}"
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(12.0, connect=5.0)) as client:
            r = await client.get(url, params=params or {})
            if r.status_code != 200:
                return {}, f"ESPN HTTP {r.status_code}"
            return r.json(), None
    except httpx.HTTPError as e:
        logger.error("ESPN request failed: %s", e)
        return {}, f"ESPN network error: {e}"


async def fetch_scoreboard(dates: str | None = None) -> tuple[list[dict], str | None]:
    settings = get_settings()
    params = {"dates": dates} if dates else None
    data, err = await _get(f"apis/site/v2/sports/soccer/{settings.ESPN_LEAGUE_SLUG}/scoreboard", params)
    if err:
        return [], err
    events = [normalize_event(e) for e in data.get("events") or []]
    return events, None


async def fetch_summary(event_id: str) -> tuple[dict | None, str | None]:
    settings = get_settings()
    data, err = await _get(
        f"apis/site/v2/sports/soccer/{settings.ESPN_LEAGUE_SLUG}/summary",
        {"event": event_id},
    )
    if err:
        return None, err
    header = data.get("header") or {}
    competitions = header.get("competitions") or data.get("competitions") or []
    if competitions:
        fake_event = {
            "id": event_id,
            "competitions": competitions,
            "date": competitions[0].get("date"),
            "status": competitions[0].get("status"),
        }
        return normalize_event(fake_event), None
    if data.get("events"):
        return normalize_event(data["events"][0]), None
    return None, "ESPN summary not found"


async def find_event_id(home_team: str, away_team: str, kickoff: str | None = None) -> str | None:
    dates = _kickoff_date(kickoff)
    events, err = await fetch_scoreboard(dates)
    if err and dates:
        events, _ = await fetch_scoreboard(None)
    for ev in events:
        if _teams_match(ev["home_team"], home_team) and _teams_match(ev["away_team"], away_team):
            return ev["espn_event_id"]
    if dates:
        events, _ = await fetch_scoreboard(None)
        for ev in events:
            if _teams_match(ev["home_team"], home_team) and _teams_match(ev["away_team"], away_team):
                return ev["espn_event_id"]
    return None


async def get_live_snapshot(event_id: str) -> tuple[dict | None, str | None]:
    """Full match snapshot with normalized details[] for flash bets."""
    summary, err = await fetch_summary(event_id)
    if summary:
        return summary, None
    events, err = await fetch_scoreboard(None)
    if err:
        return None, err
    for ev in events:
        if ev["espn_event_id"] == str(event_id):
            return ev, None
    return None, "ESPN event not found"
