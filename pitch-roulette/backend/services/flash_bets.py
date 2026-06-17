"""Flash bet lifecycle and PP awards."""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

from postgrest.exceptions import APIError

from database import get_supabase

logger = logging.getLogger(__name__)

WAGER_AMOUNTS = {"LOW": 0.5, "MEDIUM": 1.0, "HIGH": 2.0}
FLASH_WINDOW_SECONDS = 12
DEMO_FLASH_WINDOW_SECONDS = 30
ANSWER_GRACE_SECONDS = 5
_migration_warned = False


def _missing_phase2_table(exc: BaseException) -> bool:
    if isinstance(exc, APIError) and getattr(exc, "code", None) == "PGRST205":
        return True
    msg = str(exc)
    return "flash_bets" in msg and "PGRST205" in msg


def _warn_migration_once() -> None:
    global _migration_warned
    if not _migration_warned:
        _migration_warned = True
        logger.warning(
            "Phase 2 tables missing — run supabase/phase2_migration.sql in Supabase SQL Editor"
        )


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


def _normalize_options(raw) -> list[str]:
    if raw is None:
        return ["Yes", "No"]
    if isinstance(raw, list):
        return [str(x).strip() for x in raw if str(x).strip()]
    return ["Yes", "No"]


def _match_option(chosen: str, options: list[str]) -> str | None:
    needle = chosen.strip()
    for opt in options:
        if opt == needle or opt.lower() == needle.lower():
            return opt
    return None


def _get_room_by_code(code: str) -> dict:
    db = get_supabase()
    result = db.table("rooms").select("*").eq("room_code", code.upper()).execute()
    if not result.data:
        raise ValueError("room_not_found")
    return result.data[0]


def _require_host(room: dict, user_id: str) -> None:
    if room.get("host_id") != user_id:
        raise PermissionError("not_host")


def _require_live(room: dict) -> None:
    if room.get("state") != "LIVE":
        raise ValueError("room_not_live")


def create_manual_flash_bet(
    code: str,
    user_id: str,
    question: str,
    options: list[str],
    wager_tier: str = "MEDIUM",
) -> dict:
    room = _get_room_by_code(code)
    _require_host(room, user_id)
    _require_live(room)
    if len(options) < 2 or len(options) > 4:
        raise ValueError("invalid_options")

    wager = WAGER_AMOUNTS.get(wager_tier, 1.0)
    now = _now()
    locks = now + timedelta(seconds=FLASH_WINDOW_SECONDS)
    db = get_supabase()
    row = db.table("flash_bets").insert({
        "room_id": room["id"],
        "triggered_by": "HOST",
        "question": question.strip(),
        "options": options,
        "wager_tier": wager_tier,
        "wager_amount": wager,
        "state": "OPEN",
        "opens_at": now.isoformat(),
        "locks_at": locks.isoformat(),
    }).execute().data[0]
    return row


def create_auto_flash_bet(
    room_id: str,
    question: str,
    options: list[str],
    event_type: str,
    event_key: str,
    wager_tier: str = "MEDIUM",
    window_seconds: int | None = None,
) -> dict | None:
    db = get_supabase()
    existing = db.table("flash_bets").select("id").eq("room_id", room_id).eq(
        "event_key", event_key
    ).execute()
    if existing.data:
        return None

    wager = WAGER_AMOUNTS.get(wager_tier, 1.0)
    now = _now()
    window = window_seconds or FLASH_WINDOW_SECONDS
    locks = now + timedelta(seconds=window)
    try:
        row = db.table("flash_bets").insert({
            "room_id": room_id,
            "triggered_by": "AUTO",
            "question": question,
            "options": options,
            "wager_tier": wager_tier,
            "wager_amount": wager,
            "state": "OPEN",
            "opens_at": now.isoformat(),
            "locks_at": locks.isoformat(),
            "match_event_type": event_type,
            "event_key": event_key,
        }).execute().data[0]
        return row
    except Exception:
        return None


def list_flash_bets(code: str) -> list[dict]:
    room = _get_room_by_code(code)
    db = get_supabase()
    try:
        return db.table("flash_bets").select("*").eq("room_id", room["id"]).order(
            "created_at", desc=True
        ).limit(50).execute().data or []
    except APIError as e:
        if _missing_phase2_table(e):
            _warn_migration_once()
            return []
        raise


def submit_answer(code: str, bet_id: str, user_id: str, chosen_option: str) -> dict:
    room = _get_room_by_code(code)
    _require_live(room)
    db = get_supabase()

    member = db.table("room_players").select("id").eq("room_id", room["id"]).eq(
        "user_id", user_id
    ).execute()
    if not member.data:
        raise PermissionError("not_in_room")

    bet = db.table("flash_bets").select("*").eq("id", bet_id).eq("room_id", room["id"]).execute()
    if not bet.data:
        raise ValueError("bet_not_found")
    b = bet.data[0]
    if b["state"] == "RESOLVED":
        raise ValueError("already_resolved")
    if b["state"] not in ("OPEN", "LOCKED"):
        raise ValueError("bet_not_open")

    locks_at = _parse_dt(b.get("locks_at"))
    if locks_at and _now() > locks_at + timedelta(seconds=ANSWER_GRACE_SECONDS):
        raise ValueError("bet_locked")

    options = _normalize_options(b.get("options"))
    matched = _match_option(chosen_option, options)
    if not matched:
        raise ValueError("invalid_option")

    existing = db.table("flash_bet_answers").select("id").eq(
        "flash_bet_id", bet_id
    ).eq("user_id", user_id).execute()
    if existing.data:
        raise ValueError("already_answered")

    return db.table("flash_bet_answers").insert({
        "flash_bet_id": bet_id,
        "room_id": room["id"],
        "user_id": user_id,
        "chosen_option": matched,
    }).execute().data[0]


def resolve_flash_bet(code: str, bet_id: str, user_id: str, correct_option: str) -> dict:
    room = _get_room_by_code(code)
    _require_host(room, user_id)
    db = get_supabase()

    bet = db.table("flash_bets").select("*").eq("id", bet_id).eq("room_id", room["id"]).execute()
    if not bet.data:
        raise ValueError("bet_not_found")
    b = bet.data[0]
    if b["state"] == "RESOLVED":
        raise ValueError("already_resolved")

    options = b.get("options") or []
    if correct_option not in options:
        raise ValueError("invalid_option")

    wager = float(b.get("wager_amount", 1))
    answers = db.table("flash_bet_answers").select("*").eq("flash_bet_id", bet_id).execute().data or []

    for ans in answers:
        correct = ans["chosen_option"] == correct_option
        pp_change = (wager * 2) if correct else -wager
        if not correct:
            pp_change = -wager

        db.table("flash_bet_answers").update({
            "is_correct": correct,
            "pp_change": pp_change,
        }).eq("id", ans["id"]).execute()

        _apply_pp(room, ans["user_id"], pp_change)

    now = _now().isoformat()
    db.table("flash_bets").update({
        "state": "RESOLVED",
        "correct_option": correct_option,
        "resolved_at": now,
    }).eq("id", bet_id).execute()

    updated = db.table("flash_bets").select("*").eq("id", bet_id).execute().data[0]
    breakdown = db.table("flash_bet_answers").select("*").eq("flash_bet_id", bet_id).execute().data or []
    return {"bet": updated, "answers": breakdown}


def get_bet_results(code: str, bet_id: str) -> dict:
    room = _get_room_by_code(code)
    db = get_supabase()
    bet = db.table("flash_bets").select("*").eq("id", bet_id).eq("room_id", room["id"]).execute()
    if not bet.data:
        raise ValueError("bet_not_found")
    answers = db.table("flash_bet_answers").select(
        "*, profiles(username, display_name, avatar_color)"
    ).eq("flash_bet_id", bet_id).execute().data or []
    enriched = []
    for a in answers:
        prof = a.pop("profiles", None) or {}
        enriched.append({**a, **prof})
    return {"bet": bet.data[0], "answers": enriched}


def lock_expired_bets() -> int:
    """Background: OPEN → LOCKED when locks_at passed."""
    try:
        db = get_supabase()
        open_bets = db.table("flash_bets").select("id, locks_at").eq("state", "OPEN").execute().data or []
    except APIError as e:
        if _missing_phase2_table(e):
            _warn_migration_once()
            return 0
        raise
    locked = 0
    now = _now()
    for b in open_bets:
        locks_at = _parse_dt(b.get("locks_at"))
        if locks_at and now >= locks_at:
            db.table("flash_bets").update({"state": "LOCKED"}).eq("id", b["id"]).execute()
            locked += 1
    return locked


def _apply_pp(room: dict, user_id: str, pp_change: float) -> None:
    db = get_supabase()
    player = db.table("room_players").select("*").eq("room_id", room["id"]).eq(
        "user_id", user_id
    ).execute()
    if player.data:
        p = player.data[0]
        new_session = max(0, float(p.get("session_pp", 0)) + pp_change)
        db.table("room_players").update({"session_pp": new_session}).eq("id", p["id"]).execute()

    profile = db.table("profiles").select("total_points").eq("id", user_id).execute()
    if profile.data:
        new_total = max(0, float(profile.data[0].get("total_points", 0)) + pp_change)
        db.table("profiles").update({"total_points": new_total}).eq("id", user_id).execute()

    if room.get("group_id"):
        member = db.table("group_members").select("*").eq(
            "group_id", room["group_id"]
        ).eq("user_id", user_id).execute()
        if member.data:
            gm = member.data[0]
            db.table("group_members").update({
                "group_points": max(0, float(gm.get("group_points", 0)) + pp_change),
            }).eq("id", gm["id"]).execute()
