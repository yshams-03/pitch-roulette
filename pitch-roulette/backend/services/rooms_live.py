"""Room LIVE transition helpers (draft + underdog bonus)."""
from __future__ import annotations

import logging
from datetime import datetime, timezone

from database import get_supabase
from services.draft import auto_assign_remaining, bot_auto_pick
from services.match_engine import go_live_simulation, is_simulation_room
from services.room_snapshot import room_snapshot
from services.sides import apply_underdog_bonus
from services import sports_service

logger = logging.getLogger(__name__)


async def finalize_go_live(room: dict, user_id: str) -> dict:
    """CLOSED or DRAFTING → LIVE with auto-assign + underdog bonus."""
    if room.get("host_id") != user_id:
        raise PermissionError("not_host")
    state = room.get("state")
    if state not in ("CLOSED", "DRAFTING"):
        raise ValueError("invalid_state")

    db = get_supabase()
    room_id = room["id"]
    if state == "CLOSED":
        db.table("rooms").update({
            "state": "DRAFTING",
            "draft_started_at": datetime.now(timezone.utc).isoformat(),
        }).eq("id", room_id).execute()

    auto_assign_remaining(room_id)
    bot_auto_pick(room_id)

    fresh = db.table("rooms").select("*").eq("id", room_id).execute().data[0]
    if is_simulation_room(fresh):
        updated = go_live_simulation(fresh)
    else:
        live = await sports_service.get_live_match(fresh["match_id"])
        match_data, espn_event_id, last_seen = await sports_service.bootstrap_espn_for_live_room(live)
        update: dict = {
            "state": "LIVE",
            "match_data": match_data,
            "match_source": "live_api",
            "espn_event_id": espn_event_id or fresh.get("espn_event_id"),
        }
        if last_seen:
            update["last_seen_event_key"] = last_seen
        updated = db.table("rooms").update(update).eq("id", room_id).execute().data[0]

    apply_underdog_bonus(room_id)
    final = db.table("rooms").select("*").eq("id", room_id).execute().data[0]
    return room_snapshot(final)
