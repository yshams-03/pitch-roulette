"""Sabotage shop — spend PC to target opponents during LIVE rooms."""
from __future__ import annotations

import logging
import random
from datetime import datetime, timedelta, timezone
from typing import Any

from database import get_supabase
from services.pitch_chips import adjust_pc, get_session_pc

logger = logging.getLogger(__name__)

SabotageType = str

FLASH_SABOTAGE_TYPES = frozenset({
    "BLINDFOLD", "JINX", "MIRROR", "DOUBLE_OR_NOTHING",
})

SABOTAGE_CATALOG: dict[SabotageType, dict[str, Any]] = {
    "BLINDFOLD": {
        "type": "BLINDFOLD",
        "label": "Blindfold",
        "emoji": "🙈",
        "pc_cost": 15.0,
        "description": "Hide their next flash bet options — they answer blind.",
    },
    "TAX": {
        "type": "TAX",
        "label": "Tax",
        "emoji": "💸",
        "pc_cost": 20.0,
        "description": "Steal 10 PC from them immediately.",
    },
    "SILENCE": {
        "type": "SILENCE",
        "label": "Silence",
        "emoji": "🔇",
        "pc_cost": 25.0,
        "description": "Block their chat for 2 minutes.",
    },
    "JINX": {
        "type": "JINX",
        "label": "Jinx",
        "emoji": "⚡",
        "pc_cost": 30.0,
        "description": "If their next flash bet is wrong, they lose double PC.",
    },
    "MIRROR": {
        "type": "MIRROR",
        "label": "Mirror",
        "emoji": "🪞",
        "pc_cost": 35.0,
        "description": "Secretly flip their next Yes/No pick.",
    },
    "DOUBLE_OR_NOTHING": {
        "type": "DOUBLE_OR_NOTHING",
        "label": "Double or Nothing",
        "emoji": "🎲",
        "pc_cost": 40.0,
        "description": "Their next flash bet: win 3× wager or lose it all.",
    },
}

TAX_STEAL_PC = 10.0
SILENCE_MINUTES = 2


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _parse_dt(iso: str | None) -> datetime | None:
    if not iso:
        return None
    try:
        dt = datetime.fromisoformat(iso.replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc)
    except ValueError:
        return None


def _get_room_by_code(code: str) -> dict:
    db = get_supabase()
    result = db.table("rooms").select("*").eq("room_code", code.upper()).execute()
    if not result.data:
        raise ValueError("room_not_found")
    return result.data[0]


def _require_live(room: dict) -> None:
    if room.get("state") != "LIVE":
        raise ValueError("room_not_live")


def _enrich_sabotage(row: dict) -> dict:
    meta = SABOTAGE_CATALOG.get(row.get("sabotage_type", ""), {})
    out = {**row}
    out["label"] = meta.get("label", row.get("sabotage_type"))
    out["emoji"] = meta.get("emoji", "💣")
    return out


def shop_catalog() -> list[dict]:
    return list(SABOTAGE_CATALOG.values())


def list_active_in_room(room_id: str) -> list[dict]:
    db = get_supabase()
    _expire_silence(room_id)
    try:
        rows = (
            db.table("sabotages")
            .select("*")
            .eq("room_id", room_id)
            .eq("state", "ACTIVE")
            .order("purchased_at", desc=True)
            .execute()
            .data
            or []
        )
    except Exception:
        return []
    return [_enrich_sabotage(r) for r in rows]


def list_for_user(room_id: str, user_id: str, *, include_mirror: bool = False) -> list[dict]:
    """Active sabotages targeting user_id. MIRROR hidden from target unless include_mirror."""
    active = [s for s in list_active_in_room(room_id) if s.get("target_id") == user_id]
    if not include_mirror:
        active = [s for s in active if s.get("sabotage_type") != "MIRROR"]
    return active


def get_shop(code: str, user_id: str) -> dict:
    room = _get_room_by_code(code)
    return {
        "catalog": shop_catalog(),
        "session_pc": get_session_pc(room["id"], user_id),
        "room_state": room.get("state"),
    }


def list_sabotages(code: str, user_id: str) -> dict:
    room = _get_room_by_code(code)
    is_host = room.get("host_id") == user_id
    targeting_me = list_for_user(room["id"], user_id, include_mirror=False)
    room_active = list_active_in_room(room["id"]) if is_host else []
    return {
        "targeting_me": targeting_me,
        "room_active": room_active if is_host else [],
        "is_host": is_host,
    }


def _expire_active_buyer_target(room_id: str, buyer_id: str, target_id: str) -> None:
    """Expire prior ACTIVE sabotage from same buyer on same target."""
    db = get_supabase()
    rows = (
        db.table("sabotages")
        .select("id")
        .eq("room_id", room_id)
        .eq("buyer_id", buyer_id)
        .eq("target_id", target_id)
        .eq("state", "ACTIVE")
        .execute()
        .data
        or []
    )
    now = _now().isoformat()
    for row in rows:
        db.table("sabotages").update({
            "state": "EXPIRED",
            "triggered_at": now,
        }).eq("id", row["id"]).execute()


def has_active_sabotage(room_id: str, buyer_id: str, target_id: str, sabotage_type: str) -> bool:
    db = get_supabase()
    rows = (
        db.table("sabotages")
        .select("id")
        .eq("room_id", room_id)
        .eq("buyer_id", buyer_id)
        .eq("target_id", target_id)
        .eq("sabotage_type", sabotage_type)
        .eq("state", "ACTIVE")
        .execute()
        .data
        or []
    )
    return bool(rows)


def purchase_sabotage(
    code: str,
    buyer_id: str,
    sabotage_type: str,
    target_user_id: str,
) -> dict:
    if sabotage_type not in SABOTAGE_CATALOG:
        raise ValueError("invalid_sabotage_type")

    room = _get_room_by_code(code)
    _require_live(room)

    if buyer_id == target_user_id:
        raise ValueError("cannot_target_self")

    db = get_supabase()
    buyer_member = db.table("room_players").select("id").eq(
        "room_id", room["id"]
    ).eq("user_id", buyer_id).execute()
    target_member = db.table("room_players").select("id").eq(
        "room_id", room["id"]
    ).eq("user_id", target_user_id).execute()
    if not buyer_member.data or not target_member.data:
        raise ValueError("not_in_room")

    meta = SABOTAGE_CATALOG[sabotage_type]
    cost = float(meta["pc_cost"])
    if get_session_pc(room["id"], buyer_id) < cost:
        raise ValueError("insufficient_pc")

    _expire_active_buyer_target(room["id"], buyer_id, target_user_id)

    adjust_pc(room["id"], buyer_id, -cost, "sabotage_purchase", None)

    now = _now()
    row: dict[str, Any] = {
        "room_id": room["id"],
        "buyer_id": buyer_id,
        "target_id": target_user_id,
        "sabotage_type": sabotage_type,
        "pc_cost": cost,
        "state": "ACTIVE",
        "purchased_at": now.isoformat(),
    }
    if sabotage_type == "SILENCE":
        row["expires_at"] = (now + timedelta(minutes=SILENCE_MINUTES)).isoformat()

    created = db.table("sabotages").insert(row).execute().data[0]

    if sabotage_type == "TAX":
        steal = min(TAX_STEAL_PC, get_session_pc(room["id"], target_user_id))
        if steal > 0:
            adjust_pc(room["id"], target_user_id, -steal, "sabotage_received", created["id"])
        db.table("sabotages").update({
            "state": "TRIGGERED",
            "triggered_at": now.isoformat(),
        }).eq("id", created["id"]).execute()
        created["state"] = "TRIGGERED"
        created["triggered_at"] = now.isoformat()

    return _enrich_sabotage(created)


def apply_mirror_to_choice(chosen: str, options: list[str]) -> str:
    """Flip Yes↔No when MIRROR active (binary options only)."""
    if len(options) != 2:
        return chosen
    a, b = options[0], options[1]
    if chosen == a:
        return b
    if chosen == b:
        return a
    low = chosen.lower()
    if low == a.lower():
        return b
    if low == b.lower():
        return a
    return chosen


def get_active_flash_sabotages(room_id: str, target_id: str) -> list[dict]:
    db = get_supabase()
    try:
        rows = (
            db.table("sabotages")
            .select("*")
            .eq("room_id", room_id)
            .eq("target_id", target_id)
            .eq("state", "ACTIVE")
            .execute()
            .data
            or []
        )
    except Exception:
        return []
    return [r for r in rows if r.get("sabotage_type") in FLASH_SABOTAGE_TYPES]


def consume_flash_sabotages_on_answer(room_id: str, target_id: str, bet_id: str) -> dict[str, bool]:
    """Mark flash sabotages triggered for this answer. Returns effect flags for resolve."""
    active = get_active_flash_sabotages(room_id, target_id)
    flags = {
        "jinx": False,
        "mirror": False,
        "double_or_nothing": False,
        "blindfold": False,
    }
    if not active:
        return flags

    db = get_supabase()
    now = _now().isoformat()
    for s in active:
        st = s.get("sabotage_type")
        if st == "JINX":
            flags["jinx"] = True
        elif st == "MIRROR":
            flags["mirror"] = True
        elif st == "DOUBLE_OR_NOTHING":
            flags["double_or_nothing"] = True
        elif st == "BLINDFOLD":
            flags["blindfold"] = True
        db.table("sabotages").update({
            "state": "TRIGGERED",
            "triggered_at": now,
            "flash_bet_id": bet_id,
        }).eq("id", s["id"]).execute()
    return flags


def waste_flash_sabotages_on_resolve(room_id: str, bet_id: str, answered_user_ids: set[str]) -> None:
    """Consume active flash sabotages for players who did not answer this bet."""
    db = get_supabase()
    try:
        rows = (
            db.table("sabotages")
            .select("*")
            .eq("room_id", room_id)
            .eq("state", "ACTIVE")
            .execute()
            .data
            or []
        )
    except Exception:
        return
    now = _now().isoformat()
    for s in rows:
        if s.get("sabotage_type") not in FLASH_SABOTAGE_TYPES:
            continue
        if s.get("target_id") in answered_user_ids:
            continue
        db.table("sabotages").update({
            "state": "TRIGGERED",
            "triggered_at": now,
            "flash_bet_id": bet_id,
        }).eq("id", s["id"]).execute()


def get_sabotage_flags_for_answer(room_id: str, user_id: str, bet_id: str) -> dict[str, bool]:
    """Load triggered sabotage effects linked to this flash bet answer."""
    db = get_supabase()
    try:
        rows = (
            db.table("sabotages")
            .select("sabotage_type")
            .eq("room_id", room_id)
            .eq("target_id", user_id)
            .eq("flash_bet_id", bet_id)
            .eq("state", "TRIGGERED")
            .execute()
            .data
            or []
        )
    except Exception:
        return {"jinx": False, "mirror": False, "double_or_nothing": False, "blindfold": False}
    types = {r.get("sabotage_type") for r in rows}
    return {
        "jinx": "JINX" in types,
        "mirror": "MIRROR" in types,
        "double_or_nothing": "DOUBLE_OR_NOTHING" in types,
        "blindfold": "BLINDFOLD" in types,
    }


def apply_flash_bet_pc_with_sabotage(
    room_id: str,
    user_id: str,
    wager: float,
    correct: bool,
    bet_id: str,
    flags: dict[str, bool],
) -> float:
    """Apply PC delta for flash bet resolve, accounting for JINX / DOUBLE_OR_NOTHING."""
    if correct:
        if flags.get("double_or_nothing"):
            return adjust_pc(room_id, user_id, wager * 3, "flash_bet_win", bet_id)
        return adjust_pc(room_id, user_id, wager, "flash_bet_win", bet_id)

    loss = wager * 2 if flags.get("jinx") else wager
    return adjust_pc(room_id, user_id, -loss, "flash_bet_loss", bet_id)


def _expire_silence(room_id: str) -> None:
    db = get_supabase()
    try:
        rows = (
            db.table("sabotages")
            .select("id, expires_at")
            .eq("room_id", room_id)
            .eq("sabotage_type", "SILENCE")
            .eq("state", "ACTIVE")
            .execute()
            .data
            or []
        )
    except Exception:
        return
    now = _now()
    for row in rows:
        exp = _parse_dt(row.get("expires_at"))
        if exp and now >= exp:
            db.table("sabotages").update({
                "state": "EXPIRED",
                "triggered_at": now.isoformat(),
            }).eq("id", row["id"]).execute()


def silence_seconds_remaining(room_id: str, user_id: str) -> int:
    _expire_silence(room_id)
    db = get_supabase()
    try:
        rows = (
            db.table("sabotages")
            .select("expires_at")
            .eq("room_id", room_id)
            .eq("target_id", user_id)
            .eq("sabotage_type", "SILENCE")
            .eq("state", "ACTIVE")
            .execute()
            .data
            or []
        )
    except Exception:
        return 0
    if not rows:
        return 0
    exp = _parse_dt(rows[0].get("expires_at"))
    if not exp:
        return 0
    remaining = int((exp - _now()).total_seconds())
    return max(0, remaining)


def assert_not_silenced(room_id: str, user_id: str) -> None:
    if silence_seconds_remaining(room_id, user_id) > 0:
        raise ValueError("silenced")


def maybe_bot_purchase_sabotage(room: dict) -> dict | None:
    """Demo bots randomly buy sabotages during LIVE (weighted toward PC leaders)."""
    if room.get("state") != "LIVE":
        return None
    cfg = room.get("bot_config_json") or {}
    if not cfg.get("enabled"):
        return None
    if random.random() > 0.15:
        return None

    from services.bots import bots_for_room

    host_id = room.get("host_id") or ""
    bots = bots_for_room(room, host_id)
    if not bots:
        return None

    db = get_supabase()
    players = db.table("room_players").select("user_id, session_pc").eq(
        "room_id", room["id"]
    ).execute().data or []
    if len(players) < 2:
        return None

    bot = random.choice(bots)
    buyer_id = bot["id"]
    if get_session_pc(room["id"], buyer_id) < 15:
        return None

    leaders = sorted(players, key=lambda p: -float(p.get("session_pc") or 0))
    weights = []
    candidates = []
    for p in leaders:
        uid = p["user_id"]
        if uid == buyer_id:
            continue
        candidates.append(uid)
        weights.append(float(p.get("session_pc") or 0) + 1)
    if not candidates:
        return None

    target_id = random.choices(candidates, weights=weights, k=1)[0]
    affordable = [
        t for t, m in SABOTAGE_CATALOG.items()
        if get_session_pc(room["id"], buyer_id) >= m["pc_cost"]
    ]
    if not affordable:
        return None
    weights = [max(1, 50 - int(SABOTAGE_CATALOG[t]["pc_cost"])) for t in affordable]
    sabotage_type = random.choices(affordable, weights=weights, k=1)[0]

    try:
        result = purchase_sabotage(room["room_code"], buyer_id, sabotage_type, target_id)
        logger.info(
            "Bot %s used %s on %s",
            bot.get("display_name", buyer_id),
            sabotage_type,
            target_id,
        )
        return result
    except ValueError as exc:
        logger.debug("bot sabotage skipped: %s", exc)
        return None
