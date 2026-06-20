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
        async with httpx.AsyncClient(
            timeout=httpx.Timeout(12.0, connect=5.0),
            verify=settings.ESPN_SSL_VERIFY,
        ) as client:
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


async def fetch_summary_raw(event_id: str) -> tuple[dict, dict | None, str | None]:
    """Raw ESPN summary JSON plus normalized event snapshot."""
    settings = get_settings()
    data, err = await _get(
        f"apis/site/v2/sports/soccer/{settings.ESPN_LEAGUE_SLUG}/summary",
        {"event": event_id},
    )
    if err:
        return {}, None, err
    header = data.get("header") or {}
    competitions = header.get("competitions") or data.get("competitions") or []
    if competitions:
        fake_event = {
            "id": event_id,
            "competitions": competitions,
            "date": competitions[0].get("date"),
            "status": competitions[0].get("status"),
        }
        return data, normalize_event(fake_event), None
    if data.get("events"):
        return data, normalize_event(data["events"][0]), None
    return data, None, "ESPN summary not found"


async def fetch_summary(event_id: str) -> tuple[dict | None, str | None]:
    _, summary, err = await fetch_summary_raw(event_id)
    return summary, err


def _stat_value(team_stats: list, *names: str) -> float | int | None:
    for block in team_stats or []:
        label = (block.get("name") or block.get("label") or "").lower()
        for name in names:
            if name.lower() in label:
                raw = block.get("displayValue") or block.get("value")
                if raw is None:
                    return None
                try:
                    return float(str(raw).replace("%", "").strip())
                except ValueError:
                    return None
    return None


def extract_stats_from_summary(data: dict, snapshot: dict) -> dict | None:
    """Parse possession / shots / xG from ESPN summary boxscore."""
    boxscore = data.get("boxscore") or {}
    teams = boxscore.get("teams") or []
    if len(teams) < 2:
        return None

    home_id = None
    comps = (data.get("header") or {}).get("competitions") or data.get("competitions") or []
    if comps:
        home_c, _ = _competitors(comps[0])
        home_id = (home_c.get("team") or {}).get("id")

    home_stats = teams[0].get("statistics") or []
    away_stats = teams[1].get("statistics") or []
    if home_id and str(teams[1].get("team", {}).get("id")) == str(home_id):
        home_stats, away_stats = away_stats, home_stats

    possession_home = _stat_value(home_stats, "possession", "ball possession")
    possession_away = _stat_value(away_stats, "possession", "ball possession")
    shots_home = _stat_value(home_stats, "total shots", "shots")
    shots_away = _stat_value(away_stats, "total shots", "shots")
    sot_home = _stat_value(home_stats, "shots on target", "on target")
    sot_away = _stat_value(away_stats, "shots on target", "on target")
    xg_home = _stat_value(home_stats, "expected goals", "xg")
    xg_away = _stat_value(away_stats, "expected goals", "xg")
    corners_home = _stat_value(home_stats, "corner", "corners")
    corners_away = _stat_value(away_stats, "corner", "corners")
    fouls_home = _stat_value(home_stats, "foul", "fouls")
    fouls_away = _stat_value(away_stats, "foul", "fouls")
    off_home = _stat_value(home_stats, "offside", "offsides")
    off_away = _stat_value(away_stats, "offside", "offsides")

    if all(
        v is None
        for v in (
            possession_home, possession_away, shots_home, shots_away,
            sot_home, sot_away, xg_home, xg_away,
        )
    ):
        return None

    def _pair(h, a, default=0):
        return {"home": int(h) if h is not None and h == int(h) else (h or default),
                "away": int(a) if a is not None and a == int(a) else (a or default)}

    return {
        "possession": _pair(possession_home or 50, possession_away or 50),
        "shots": _pair(shots_home, shots_away),
        "shots_on_target": _pair(sot_home, sot_away),
        "xg": {"home": float(xg_home or 0), "away": float(xg_away or 0)},
        "corners": _pair(corners_home, corners_away),
        "fouls": _pair(fouls_home, fouls_away),
        "offsides": _pair(off_home, off_away),
    }


def _parse_detail_minute(detail: dict) -> int:
    clock = detail.get("clock") or {}
    raw = clock.get("displayValue") or clock.get("value") or "0"
    m = re.match(r"(\d+)", str(raw))
    return int(m.group(1)) if m else 0


def _detail_team_side(detail: dict, home_team_id: str | None) -> str:
    tid = str((detail.get("team") or {}).get("id", ""))
    if home_team_id and tid:
        return "home" if tid == str(home_team_id) else "away"
    home_away = (detail.get("team") or {}).get("homeAway")
    if home_away == "home":
        return "home"
    if home_away == "away":
        return "away"
    return "home"


def _map_espn_detail_type(detail: dict) -> str | None:
    text = ((detail.get("type") or {}).get("text") or "").lower()
    if detail.get("scoringPlay"):
        if detail.get("ownGoal") or "own goal" in text:
            return "OWN_GOAL"
        if detail.get("penaltyKick") or "penalty" in text:
            return "PENALTY_SCORED" if "miss" not in text else "PENALTY_MISSED"
        return "GOAL"
    if "var" in text:
        return "VAR"
    if detail.get("redCard") or "second yellow" in text:
        return "SECOND_YELLOW" if "second" in text else "RED"
    if detail.get("yellowCard") or "yellow" in text:
        return "YELLOW"
    if "substitution" in text or "sub" in text:
        return "SUBSTITUTION"
    if detail.get("penaltyKick") or "penalty" in text:
        return "PENALTY_MISSED" if "miss" in text else "PENALTY_SCORED"
    if "goal" in text:
        return "GOAL"
    return None


def facts_events_from_snapshot(snapshot: dict, raw_data: dict | None = None) -> list[dict]:
    """Convert ESPN details[] to normalized match-facts events."""
    details = snapshot.get("details") or []
    home_id = None
    if raw_data:
        comps = (raw_data.get("header") or {}).get("competitions") or raw_data.get("competitions") or []
        if comps:
            home_c, _ = _competitors(comps[0])
            home_id = (home_c.get("team") or {}).get("id")

    events: list[dict] = []
    running_home = 0
    running_away = 0
    for i, detail in enumerate(details):
        etype = _map_espn_detail_type(detail)
        if not etype:
            continue
        team = _detail_team_side(detail, str(home_id) if home_id else None)
        athletes = detail.get("athletesInvolved") or []
        player = athletes[0].get("displayName") if athletes else "Unknown"
        assist = athletes[1].get("displayName") if len(athletes) > 1 else None
        minute = _parse_detail_minute(detail)

        if etype in ("GOAL", "OWN_GOAL", "PENALTY_SCORED"):
            if etype == "OWN_GOAL":
                if team == "home":
                    running_away += 1
                else:
                    running_home += 1
            elif team == "home":
                running_home += 1
            else:
                running_away += 1
            detail_score = f"{running_home}-{running_away}"
        else:
            detail_score = None

        desc = None
        if etype == "VAR":
            desc = (detail.get("type") or {}).get("text") or "VAR Review"

        evt = {
            "id": detail.get("event_key") or f"espn-{snapshot.get('espn_event_id')}-{i}",
            "minute": minute,
            "added_minute": None,
            "type": etype,
            "team": team,
            "player": player,
            "assist": assist,
            "detail": detail_score,
            "description": desc,
        }
        if etype == "SUBSTITUTION" and len(athletes) >= 2:
            evt["player"] = athletes[0].get("displayName", "In")
            evt["assist"] = athletes[1].get("displayName", "Out")
        events.append(evt)
    return events


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
