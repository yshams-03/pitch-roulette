"""Fantasy draft — pick 3 match players for PC rewards during LIVE."""
from __future__ import annotations

import asyncio
import logging
import random
from datetime import datetime, timezone
from typing import Any

from database import get_supabase
from services.match_engine import DEMO_MATCH_ID, is_simulation_room
from services.pitch_chips import adjust_pc

logger = logging.getLogger(__name__)

DRAFT_TIME_LIMIT_SECONDS = 60

PC_REWARDS = {
    "GOAL": 25.0,
    "ASSIST": 15.0,
    "CLEAN_SHEET": 20.0,
    "YELLOW_CARD": -5.0,
    "RED_CARD": -15.0,
    "MAN_OF_MATCH": 20.0,
    "PENALTY_SAVED": 30.0,
    "PENALTY_MISSED": -10.0,
}

DRAFT_PP_REWARDS = {
    "GOAL": 1.0,
    "ASSIST": 0.5,
    "MAN_OF_MATCH": 1.0,
    "RED_CARD": -0.5,
}

# Demo squads (France vs Netherlands)
DEMO_SQUAD: list[dict[str, Any]] = [
    {"player_id": "fr-gk-1", "name": "Maignan", "team": "HOME", "position": "GK", "shirt_number": 1},
    {"player_id": "fr-def-2", "name": "Koundé", "team": "HOME", "position": "DEF", "shirt_number": 2},
    {"player_id": "fr-def-3", "name": "Saliba", "team": "HOME", "position": "DEF", "shirt_number": 3},
    {"player_id": "fr-mid-6", "name": "Kanté", "team": "HOME", "position": "MID", "shirt_number": 6},
    {"player_id": "fr-mid-8", "name": "Tchouaméni", "team": "HOME", "position": "MID", "shirt_number": 8},
    {"player_id": "fr-fwd-10", "name": "Mbappé", "team": "HOME", "position": "FWD", "shirt_number": 10},
    {"player_id": "fr-fwd-9", "name": "Griezmann", "team": "HOME", "position": "FWD", "shirt_number": 9},
    {"player_id": "nl-gk-1", "name": "Verbruggen", "team": "AWAY", "position": "GK", "shirt_number": 1},
    {"player_id": "nl-def-3", "name": "van Dijk", "team": "AWAY", "position": "DEF", "shirt_number": 3},
    {"player_id": "nl-def-4", "name": "Aké", "team": "AWAY", "position": "DEF", "shirt_number": 4},
    {"player_id": "nl-mid-8", "name": "Gakpo", "team": "AWAY", "position": "MID", "shirt_number": 8},
    {"player_id": "nl-mid-14", "name": "Reijnders", "team": "AWAY", "position": "MID", "shirt_number": 14},
    {"player_id": "nl-fwd-7", "name": "Depay", "team": "AWAY", "position": "FWD", "shirt_number": 7},
    {"player_id": "nl-fwd-11", "name": "Bakhuizen", "team": "AWAY", "position": "FWD", "shirt_number": 11},
]

_draft_timers: dict[str, asyncio.Task] = {}


def demo_player_for_event(event_type: str) -> str | None:
    """Pick a demo-squad player for simulated match events (draft PC rewards)."""
    if event_type == "GOAL_HOME":
        pool = [p for p in DEMO_SQUAD if p["team"] == "HOME" and p["position"] in ("FWD", "MID")]
    elif event_type == "GOAL_AWAY":
        pool = [p for p in DEMO_SQUAD if p["team"] == "AWAY" and p["position"] in ("FWD", "MID")]
    elif event_type in ("YELLOW_CARD", "RED_CARD"):
        pool = list(DEMO_SQUAD)
    else:
        return None
    if not pool:
        return None
    return random.choice(pool)["player_id"]


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _get_room_by_code(code: str) -> dict:
    db = get_supabase()
    result = db.table("rooms").select("*").eq("room_code", code.upper()).execute()
    if not result.data:
        raise ValueError("room_not_found")
    return result.data[0]


def _lineup_from_football_data(match_raw: dict) -> list[dict]:
    players: list[dict] = []
    for side_key, team_label in (("homeTeam", "HOME"), ("awayTeam", "AWAY")):
        team = match_raw.get(side_key) or {}
        lineup = team.get("lineup") or []
        for entry in lineup:
            pid = str(entry.get("id", entry.get("name", "")))
            name = entry.get("name", "Unknown")
            pos = (entry.get("position") or "MID").upper()
            if pos not in ("GK", "DEF", "MID", "FWD"):
                pos = "MID"
            players.append({
                "player_id": pid,
                "name": name,
                "team": team_label,
                "position": pos,
                "shirt_number": entry.get("shirtNumber") or 0,
            })
    return players


async def fetch_squad_players(room: dict) -> list[dict]:
    if is_simulation_room(room) or room.get("match_id") == DEMO_MATCH_ID:
        return [dict(p) for p in DEMO_SQUAD]

    from services.football_data import fetch_fixture_by_id

    match_id = room.get("match_id")
    if not match_id:
        return [dict(p) for p in DEMO_SQUAD]
    raw, err = await fetch_fixture_by_id(str(match_id))
    if not raw or err:
        return [dict(p) for p in DEMO_SQUAD]
    # fetch_fixture_by_id returns normalized summary — need raw API for lineups
    from services.football_data import _api_get
    data, api_err = await _api_get(f"matches/{match_id}")
    if api_err or not data.get("id"):
        return [dict(p) for p in DEMO_SQUAD]
    lineup = _lineup_from_football_data(data)
    return lineup if lineup else [dict(p) for p in DEMO_SQUAD]


async def get_squads(code: str) -> dict:
    room = _get_room_by_code(code)
    db = get_supabase()
    picks = db.table("draft_picks").select("*, profiles(display_name)").eq(
        "room_id", room["id"]
    ).execute().data or []
    taken: dict[str, str] = {}
    for p in picks:
        prof = p.pop("profiles", None) or {}
        taken[p["player_id"]] = prof.get("display_name") or "Player"

    squad = await fetch_squad_players(room)
    out = []
    for pl in squad:
        out.append({
            **pl,
            "available": pl["player_id"] not in taken,
            "taken_by_nickname": taken.get(pl["player_id"]),
        })
    return {"players": out, "room_state": room.get("state")}


def list_picks(room_id: str) -> list[dict]:
    db = get_supabase()
    rows = db.table("draft_picks").select(
        "*, profiles(username, display_name, avatar_color)"
    ).eq("room_id", room_id).order("pick_order").execute().data or []
    enriched = []
    for r in rows:
        prof = r.pop("profiles", None) or {}
        enriched.append({**r, **prof})
    return enriched


def pick_count(room_id: str, user_id: str) -> int:
    db = get_supabase()
    rows = db.table("draft_picks").select("id").eq("room_id", room_id).eq(
        "user_id", user_id
    ).execute().data or []
    return len(rows)


def pick_player(code: str, user_id: str, player_id: str) -> dict:
    room = _get_room_by_code(code)
    if room.get("state") != "DRAFTING":
        raise ValueError("not_drafting")

    if pick_count(room["id"], user_id) >= 3:
        raise ValueError("pick_limit_reached")

    db = get_supabase()
    squad_row = None
    for pl in DEMO_SQUAD:
        if pl["player_id"] == player_id:
            squad_row = pl
            break
    if not squad_row:
        raise ValueError("player_not_found")

    order = pick_count(room["id"], user_id) + 1
    existing = db.table("draft_picks").select("id").eq("room_id", room["id"]).eq(
        "player_id", player_id
    ).execute()
    if existing.data:
        raise ValueError("player_already_taken")
    try:
        row = db.table("draft_picks").insert({
            "room_id": room["id"],
            "user_id": user_id,
            "player_id": player_id,
            "player_name": squad_row["name"],
            "player_team": squad_row["team"],
            "position": squad_row["position"],
            "pick_order": order,
        }).execute().data[0]
    except Exception as exc:
        msg = str(exc).lower()
        if "unique" in msg or "duplicate" in msg:
            raise ValueError("player_already_taken") from exc
        existing = db.table("draft_picks").select("id").eq(
            "room_id", room["id"]
        ).eq("player_id", player_id).execute()
        if existing.data:
            raise ValueError("player_already_taken")
        raise
    return row


def auto_assign_remaining(room_id: str) -> int:
    db = get_supabase()
    players = db.table("room_players").select("user_id").eq("room_id", room_id).execute().data or []
    taken_ids = {
        p["player_id"]
        for p in (db.table("draft_picks").select("player_id").eq("room_id", room_id).execute().data or [])
    }
    available = [p for p in DEMO_SQUAD if p["player_id"] not in taken_ids]
    random.shuffle(available)
    assigned = 0
    for pl_row in players:
        uid = pl_row["user_id"]
        while pick_count(room_id, uid) < 3 and available:
            pl = available.pop()
            order = pick_count(room_id, uid) + 1
            try:
                db.table("draft_picks").insert({
                    "room_id": room_id,
                    "user_id": uid,
                    "player_id": pl["player_id"],
                    "player_name": pl["name"],
                    "player_team": pl["team"],
                    "position": pl["position"],
                    "pick_order": order,
                }).execute()
                taken_ids.add(pl["player_id"])
                assigned += 1
            except Exception:
                pass
    return assigned


def bot_auto_pick(room_id: str) -> None:
    from services.bots import bots_for_room

    db = get_supabase()
    room_rows = db.table("rooms").select("*").eq("id", room_id).execute()
    if not room_rows.data:
        return
    room = room_rows.data[0]
    bots = bots_for_room(room, room.get("host_id") or "")
    weight_order = {"FWD": 0, "MID": 1, "DEF": 2, "GK": 3}
    taken = {
        p["player_id"]
        for p in (db.table("draft_picks").select("player_id").eq("room_id", room_id).execute().data or [])
    }
    pool = sorted(
        [p for p in DEMO_SQUAD if p["player_id"] not in taken],
        key=lambda x: weight_order.get(x["position"], 9),
    )
    for bot in bots:
        uid = bot["id"]
        while pick_count(room_id, uid) < 3 and pool:
            pl = pool.pop(0)
            order = pick_count(room_id, uid) + 1
            try:
                db.table("draft_picks").insert({
                    "room_id": room_id,
                    "user_id": uid,
                    "player_id": pl["player_id"],
                    "player_name": pl["name"],
                    "player_team": pl["team"],
                    "position": pl["position"],
                    "pick_order": order,
                }).execute()
                taken.add(pl["player_id"])
                pool = [p for p in pool if p["player_id"] not in taken]
            except Exception:
                break


def start_draft_room(code: str, host_id: str) -> dict:
    room = _get_room_by_code(code)
    if room.get("host_id") != host_id:
        raise PermissionError("not_host")
    if room.get("state") != "CLOSED":
        raise ValueError("invalid_state")

    db = get_supabase()
    now = _now().isoformat()
    updated = db.table("rooms").update({
        "state": "DRAFTING",
        "draft_started_at": now,
    }).eq("id", room["id"]).execute().data[0]

    bot_auto_pick(room["id"])
    _schedule_draft_timeout(room["id"], code)
    return updated


async def _draft_timeout(room_id: str, code: str) -> None:
    await asyncio.sleep(DRAFT_TIME_LIMIT_SECONDS)
    db = get_supabase()
    room = db.table("rooms").select("*").eq("id", room_id).execute()
    if not room.data or room.data[0].get("state") != "DRAFTING":
        return
    auto_assign_remaining(room_id)
    try:
        from services.rooms_live import finalize_go_live

        room_row = db.table("rooms").select("*").eq("id", room_id).execute().data[0]
        await finalize_go_live(room_row, room_row.get("host_id") or "")
    except Exception as exc:
        logger.warning("draft auto go-live failed %s: %s", code, exc)


def _schedule_draft_timeout(room_id: str, code: str) -> None:
    if room_id in _draft_timers:
        _draft_timers[room_id].cancel()
    _draft_timers[room_id] = asyncio.create_task(_draft_timeout(room_id, code))


def process_draft_event(room_id: str, event_type: str, player_id: str | None) -> None:
    if not player_id:
        return
    key = event_type.upper().replace(" ", "_")
    if key not in PC_REWARDS:
        if key == "GOAL_HOME" or key == "GOAL_AWAY":
            key = "GOAL"
        elif key == "YELLOW_CARD":
            key = "YELLOW_CARD"
        elif key == "RED_CARD":
            key = "RED_CARD"
        else:
            return
    delta = PC_REWARDS.get(key)
    if delta is None:
        return

    db = get_supabase()
    picks = db.table("draft_picks").select("*").eq("room_id", room_id).eq(
        "player_id", str(player_id)
    ).execute().data or []
    for pick in picks:
        adjust_pc(room_id, pick["user_id"], delta, "draft_reward", pick["id"])
        earned = float(pick.get("pc_earned") or 0) + delta
        db.table("draft_picks").update({"pc_earned": earned}).eq("id", pick["id"]).execute()
        pp_delta = DRAFT_PP_REWARDS.get(key)
        if pp_delta:
            _apply_draft_pp(room_id, pick["user_id"], pp_delta)


def _apply_draft_pp(room_id: str, user_id: str, pp_delta: float) -> None:
    if pp_delta == 0:
        return
    db = get_supabase()
    player = db.table("room_players").select("id, session_pp").eq("room_id", room_id).eq(
        "user_id", user_id
    ).execute()
    if player.data:
        p = player.data[0]
        new_session = float(p.get("session_pp") or 0) + pp_delta
        db.table("room_players").update({"session_pp": new_session}).eq("id", p["id"]).execute()
    profile = db.table("profiles").select("total_points").eq("id", user_id).execute()
    if profile.data:
        new_total = float(profile.data[0].get("total_points", 0)) + pp_delta
        db.table("profiles").update({"total_points": new_total}).eq("id", user_id).execute()
