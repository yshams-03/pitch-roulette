"""Host transfer and orphan-room recovery."""
from __future__ import annotations

import logging
from datetime import datetime, timezone

from database import get_supabase

logger = logging.getLogger(__name__)


def _human_players(room_id: str, exclude_user_id: str | None = None) -> list[dict]:
    db = get_supabase()
    rows = db.table("room_players").select(
        "id, user_id, is_host, profiles(is_bot)"
    ).eq("room_id", room_id).execute().data or []
    out = []
    for row in rows:
        uid = row.get("user_id")
        if exclude_user_id and uid == exclude_user_id:
            continue
        prof = row.get("profiles") or {}
        if prof.get("is_bot"):
            continue
        out.append(row)
    return out


def transfer_host(room: dict, from_user_id: str, to_user_id: str) -> dict:
    """Transfer host role to another player in the room."""
    if room.get("host_id") != from_user_id:
        raise PermissionError("not_host")
    if from_user_id == to_user_id:
        raise ValueError("cannot_transfer_to_self")

    db = get_supabase()
    room_id = room["id"]
    target = db.table("room_players").select("id").eq("room_id", room_id).eq(
        "user_id", to_user_id
    ).execute()
    if not target.data:
        raise ValueError("target_not_in_room")

    db.table("rooms").update({"host_id": to_user_id}).eq("id", room_id).execute()
    db.table("room_players").update({"is_host": False}).eq("room_id", room_id).execute()
    db.table("room_players").update({"is_host": True}).eq("room_id", room_id).eq(
        "user_id", to_user_id
    ).execute()

    return db.table("rooms").select("*").eq("id", room_id).execute().data[0]


def promote_next_host(room: dict) -> dict | None:
    """Promote the longest-waiting human player when host leaves or is missing."""
    room_id = room["id"]
    host_id = room.get("host_id")
    candidates = _human_players(room_id, exclude_user_id=host_id)
    if not candidates:
        return None
    next_host = candidates[0]["user_id"]
    return transfer_host(room, host_id, next_host)


def cleanup_orphan_host_rooms(max_lobby_minutes: int = 20) -> int:
    """
    - LIVE rooms whose host_id is not in room_players → promote next human
    - LOBBY rooms with only host for > max_lobby_minutes → delete
    """
    db = get_supabase()
    fixed = 0
    now = datetime.now(timezone.utc)

    active_states = ("LOBBY", "PREDICTING", "CLOSED", "DRAFTING", "LIVE")
    rooms = db.table("rooms").select("*").in_("state", list(active_states)).execute().data or []

    for room in rooms:
        room_id = room["id"]
        host_id = room.get("host_id")
        players = db.table("room_players").select("user_id").eq("room_id", room_id).execute().data or []
        player_ids = {p["user_id"] for p in players}

        if host_id and host_id not in player_ids:
            try:
                if promote_next_host(room):
                    fixed += 1
                    logger.info("Promoted new host for room %s", room.get("room_code"))
            except Exception as e:
                logger.warning("host promote failed %s: %s", room.get("room_code"), e)
            continue

        if room["state"] != "LOBBY" or len(players) != 1:
            continue

        created_raw = room.get("created_at")
        if not created_raw:
            continue
        try:
            created = datetime.fromisoformat(str(created_raw).replace("Z", "+00:00"))
            if created.tzinfo is None:
                created = created.replace(tzinfo=timezone.utc)
        except ValueError:
            continue
        if (now - created).total_seconds() < max_lobby_minutes * 60:
            continue

        db.table("rooms").delete().eq("id", room_id).execute()
        fixed += 1
        logger.info("Deleted abandoned lobby %s", room.get("room_code"))

    return fixed
