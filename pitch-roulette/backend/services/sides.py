"""Side assignment — HOME/AWAY rooting + underdog bonus + swap."""
from __future__ import annotations

import random
from typing import Literal

from database import get_supabase
from services.pitch_chips import adjust_pc

Side = Literal["HOME", "AWAY"]
UNDERDOG_BONUS_PC = 20.0
SIDE_SWAP_COST = 20.0


def assign_sides(player_ids: list[str]) -> dict[str, Side]:
    """Shuffle and alternate HOME/AWAY; odd count gives HOME the extra player."""
    shuffled = list(player_ids)
    random.shuffle(shuffled)
    home_count = (len(shuffled) + 1) // 2
    out: dict[str, Side] = {}
    for i, uid in enumerate(shuffled):
        out[uid] = "HOME" if i < home_count else "AWAY"
    return out


def assign_room_sides(room_id: str) -> dict[str, Side]:
    db = get_supabase()
    players = db.table("room_players").select("user_id").eq("room_id", room_id).execute().data or []
    ids = [p["user_id"] for p in players]
    mapping = assign_sides(ids)
    for uid, side in mapping.items():
        db.table("room_players").update({"assigned_side": side}).eq(
            "room_id", room_id
        ).eq("user_id", uid).execute()
    return mapping


def count_sides(room_id: str) -> tuple[int, int]:
    db = get_supabase()
    players = db.table("room_players").select("assigned_side").eq("room_id", room_id).execute().data or []
    home = sum(1 for p in players if p.get("assigned_side") == "HOME")
    away = sum(1 for p in players if p.get("assigned_side") == "AWAY")
    return home, away


def _imbalance_after_swap(room_id: str, user_id: str) -> int:
    """Absolute side difference if user swaps. Lower is better."""
    db = get_supabase()
    row = db.table("room_players").select("assigned_side").eq("room_id", room_id).eq(
        "user_id", user_id
    ).execute()
    if not row.data or not row.data[0].get("assigned_side"):
        return 999
    current = row.data[0]["assigned_side"]
    new_side: Side = "AWAY" if current == "HOME" else "HOME"
    players = db.table("room_players").select("user_id, assigned_side").eq(
        "room_id", room_id
    ).execute().data or []
    home = away = 0
    for p in players:
        side = p.get("assigned_side")
        if p["user_id"] == user_id:
            side = new_side
        if side == "HOME":
            home += 1
        elif side == "AWAY":
            away += 1
    return abs(home - away)


def can_swap(room_id: str, user_id: str) -> tuple[bool, str]:
    db = get_supabase()
    row = db.table("room_players").select("*").eq("room_id", room_id).eq(
        "user_id", user_id
    ).execute()
    if not row.data:
        return False, "not_in_room"
    p = row.data[0]
    if p.get("side_swap_used"):
        return False, "swap_already_used"
    if not p.get("assigned_side"):
        return False, "no_side_assigned"
    current_imbalance = abs(count_sides(room_id)[0] - count_sides(room_id)[1])
    new_imbalance = _imbalance_after_swap(room_id, user_id)
    if new_imbalance > current_imbalance:
        return False, "swap_would_unbalance"
    return True, "ok"


def swap_side(room_id: str, user_id: str) -> dict:
    """Deduct 20 PC; flip side if balance allows."""
    from services.pitch_chips import get_session_pc

    allowed, reason = can_swap(room_id, user_id)
    if get_session_pc(room_id, user_id) < SIDE_SWAP_COST:
        raise ValueError("insufficient_pc")

    adjust_pc(room_id, user_id, -SIDE_SWAP_COST, "side_swap", None)

    if not allowed:
        db = get_supabase()
        db.table("room_players").update({"side_swap_used": True}).eq(
            "room_id", room_id
        ).eq("user_id", user_id).execute()
        raise ValueError(reason)

    db = get_supabase()
    row = db.table("room_players").select("assigned_side").eq("room_id", room_id).eq(
        "user_id", user_id
    ).execute().data[0]
    new_side: Side = "AWAY" if row["assigned_side"] == "HOME" else "HOME"
    updated = db.table("room_players").update({
        "assigned_side": new_side,
        "side_swap_used": True,
    }).eq("room_id", room_id).eq("user_id", user_id).execute().data[0]
    return updated


def apply_underdog_bonus(room_id: str) -> int:
    """Award +20 PC to minority side when counts differ."""
    home, away = count_sides(room_id)
    if home == away or home + away == 0:
        return 0
    minority: Side = "HOME" if home < away else "AWAY"
    db = get_supabase()
    players = db.table("room_players").select("user_id").eq(
        "room_id", room_id
    ).eq("assigned_side", minority).execute().data or []
    for p in players:
        adjust_pc(room_id, p["user_id"], UNDERDOG_BONUS_PC, "underdog_bonus", None)
    return len(players)
