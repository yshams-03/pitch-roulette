"""Pitch Chips (PC) — per-room party currency."""
from __future__ import annotations

import logging
from typing import Any

from database import get_supabase

logger = logging.getLogger(__name__)

STARTING_PC = 100.0
PC_WAGER_AMOUNTS = {"LOW": 5.0, "MEDIUM": 10.0, "HIGH": 20.0}
FLASH_BET_PP_CORRECT = 0.5


def pc_wager_for_tier(wager_tier: str) -> float:
    return PC_WAGER_AMOUNTS.get(wager_tier, PC_WAGER_AMOUNTS["MEDIUM"])


def get_session_pc(room_id: str, user_id: str) -> float:
    db = get_supabase()
    row = db.table("room_players").select("session_pc").eq("room_id", room_id).eq(
        "user_id", user_id
    ).execute()
    if not row.data:
        return 0.0
    return float(row.data[0].get("session_pc") or 0)


def ensure_starting_pc(room_id: str, user_id: str, room_player_id: str | None = None) -> None:
    """Grant 100 PC once when a player joins a room (idempotent if already > 0)."""
    db = get_supabase()
    q = db.table("room_players").select("id, session_pc").eq("room_id", room_id).eq("user_id", user_id)
    rows = q.execute().data or []
    if not rows:
        return
    p = rows[0]
    current = float(p.get("session_pc") if p.get("session_pc") is not None else 0)
    if current >= STARTING_PC:
        return
    pid = room_player_id or p["id"]
    db.table("room_players").update({"session_pc": STARTING_PC}).eq("id", pid).execute()
    _record_transaction(room_id, user_id, STARTING_PC, "starting_allowance", None)


def adjust_pc(
    room_id: str,
    user_id: str,
    amount: float,
    reason: str,
    related_id: str | None = None,
) -> float:
    """Apply PC delta; returns new balance. Clamps at 0."""
    if amount == 0:
        return get_session_pc(room_id, user_id)
    db = get_supabase()
    player = db.table("room_players").select("*").eq("room_id", room_id).eq(
        "user_id", user_id
    ).execute()
    if not player.data:
        raise ValueError("not_in_room")
    p = player.data[0]
    current = float(p.get("session_pc") if p.get("session_pc") is not None else STARTING_PC)
    new_balance = max(0.0, current + amount)
    if amount < 0 and current + amount < 0:
        raise ValueError("insufficient_pc")
    db.table("room_players").update({"session_pc": new_balance}).eq("id", p["id"]).execute()
    _record_transaction(room_id, user_id, amount, reason, related_id)
    return new_balance


def can_afford_wager(room_id: str, user_id: str, wager: float) -> bool:
    return get_session_pc(room_id, user_id) >= wager


def apply_flash_bet_pc(room_id: str, user_id: str, wager: float, correct: bool, bet_id: str) -> float:
    if correct:
        return adjust_pc(room_id, user_id, wager, "flash_bet_win", bet_id)
    return adjust_pc(room_id, user_id, -wager, "flash_bet_loss", bet_id)


def _record_transaction(
    room_id: str,
    user_id: str,
    amount: float,
    reason: str,
    related_id: str | None,
) -> None:
    db = get_supabase()
    try:
        db.table("pc_transactions").insert({
            "room_id": room_id,
            "user_id": user_id,
            "amount": amount,
            "reason": reason,
            "related_id": related_id,
        }).execute()
    except Exception as exc:
        logger.warning("pc_transactions insert failed (run migration 003): %s", exc)


def list_recent_transactions(room_id: str, user_id: str, limit: int = 20) -> list[dict[str, Any]]:
    db = get_supabase()
    try:
        return (
            db.table("pc_transactions")
            .select("*")
            .eq("room_id", room_id)
            .eq("user_id", user_id)
            .order("created_at", desc=True)
            .limit(limit)
            .execute()
            .data
            or []
        )
    except Exception:
        return []
