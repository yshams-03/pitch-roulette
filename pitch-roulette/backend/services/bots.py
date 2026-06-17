"""Unified bot players for any room (simulation or live)."""
from __future__ import annotations

import hashlib
import logging
import random

from config import get_settings
from database import get_supabase

logger = logging.getLogger(__name__)

BOT_SPECS = [
    {
        "email": "pitch-demo-alex@invalid.pitchroulette",
        "username": "demo_alex",
        "display_name": "Alex (Bot)",
        "avatar_color": "#3b82f6",
        "yes_bias": 0.72,
        "bot_difficulty": "medium",
    },
    {
        "email": "pitch-demo-sam@invalid.pitchroulette",
        "username": "demo_sam",
        "display_name": "Sam (Bot)",
        "avatar_color": "#f59e0b",
        "yes_bias": 0.38,
        "bot_difficulty": "medium",
    },
    {
        "email": "pitch-demo-jordan@invalid.pitchroulette",
        "username": "demo_jordan",
        "display_name": "Jordan (Bot)",
        "avatar_color": "#a855f7",
        "yes_bias": 0.55,
        "bot_difficulty": "medium",
    },
]

_BOT_PASSWORD = "PitchDemoBot!2026"
_cache: list[dict] | None = None

DIFFICULTY_BIAS = {
    "easy": 0.5,
    "medium": None,  # use per-bot yes_bias
    "hard": None,
}


def parse_bot_config(room: dict) -> dict:
    raw = room.get("bot_config_json") or {}
    if not isinstance(raw, dict):
        raw = {}
    difficulty = raw.get("difficulty") or get_settings().DEFAULT_BOT_DIFFICULTY
    count = int(raw.get("count", 0) or 0)
    enabled = bool(raw.get("enabled", count > 0))
    max_bots = get_settings().MAX_BOTS_PER_ROOM
    return {
        "enabled": enabled,
        "count": min(max(count, 0), max_bots),
        "difficulty": difficulty if difficulty in DIFFICULTY_BIAS else "medium",
    }


def bot_config_to_json(enabled: bool, count: int, difficulty: str) -> dict:
    max_bots = get_settings().MAX_BOTS_PER_ROOM
    return {
        "enabled": enabled,
        "count": min(max(count, 0), max_bots),
        "difficulty": difficulty,
    }


def _profile_by_username(username: str) -> dict | None:
    db = get_supabase()
    row = db.table("profiles").select("*").eq("username", username).execute()
    return row.data[0] if row.data else None


def _create_bot(spec: dict) -> dict:
    db = get_supabase()
    try:
        created = db.auth.admin.create_user({
            "email": spec["email"],
            "password": _BOT_PASSWORD,
            "email_confirm": True,
            "user_metadata": {
                "username": spec["username"],
                "display_name": spec["display_name"],
                "avatar_color": spec["avatar_color"],
            },
        })
        user_id = str(created.user.id)
        try:
            db.table("profiles").update({
                "is_bot": True,
                "bot_difficulty": spec.get("bot_difficulty", "medium"),
            }).eq("id", user_id).execute()
        except Exception:
            pass
    except Exception as exc:
        logger.warning("Bot create %s: %s — trying profile lookup", spec["username"], exc)
        prof = _profile_by_username(spec["username"])
        if prof:
            return prof
        raise

    prof = db.table("profiles").select("*").eq("id", user_id).execute()
    if prof.data:
        return prof.data[0]
    return {
        "id": user_id,
        "username": spec["username"],
        "display_name": spec["display_name"],
        "avatar_color": spec["avatar_color"],
        "is_bot": True,
        "bot_difficulty": spec.get("bot_difficulty", "medium"),
    }


def ensure_builtin_bots() -> list[dict]:
    global _cache
    if _cache:
        return _cache

    bots: list[dict] = []
    for spec in BOT_SPECS:
        prof = _profile_by_username(spec["username"])
        if not prof:
            prof = _create_bot(spec)
        bias = spec.get("yes_bias", 0.5)
        bots.append({**prof, "yes_bias": bias})
    _cache = bots
    return bots


def bots_for_room(room: dict, host_id: str) -> list[dict]:
    cfg = parse_bot_config(room)
    if not cfg["enabled"] or cfg["count"] <= 0:
        return []
    pool = ensure_builtin_bots()
    selected = []
    for bot in pool:
        if bot["id"] == host_id:
            continue
        selected.append({**bot, "room_difficulty": cfg["difficulty"]})
        if len(selected) >= cfg["count"]:
            break
    return selected


def join_bots_to_room(room_id: str, room: dict, host_id: str) -> None:
    db = get_supabase()
    for bot in bots_for_room(room, host_id):
        existing = db.table("room_players").select("id").eq(
            "room_id", room_id
        ).eq("user_id", bot["id"]).execute()
        if existing.data:
            continue
        row = db.table("room_players").insert({
            "room_id": room_id,
            "user_id": bot["id"],
            "is_host": False,
            "session_pc": 100,
        }).execute().data[0]
        from services.pitch_chips import ensure_starting_pc
        ensure_starting_pc(room_id, bot["id"], row["id"])


def seed_bot_predictions(room_id: str, room: dict, host_id: str, match_id: str) -> None:
    from services.points import actual_outcome

    db = get_supabase()
    scores = [(2, 1), (1, 1), (0, 2), (3, 2), (1, 0)]
    idx = 0
    for bot in bots_for_room(room, host_id):
        if idx >= len(scores):
            break
        h, a = scores[idx]
        idx += 1
        db.table("predictions").delete().eq("room_id", room_id).eq("user_id", bot["id"]).execute()
        db.table("predictions").insert({
            "room_id": room_id,
            "user_id": bot["id"],
            "match_id": match_id,
            "home_goals": h,
            "away_goals": a,
            "predicted_outcome": actual_outcome(h, a),
            "is_first_submission": idx == 1,
        }).execute()


def on_predictions_opened(room_id: str, room: dict, host_id: str) -> None:
    seed_bot_predictions(room_id, room, host_id, room.get("match_id", ""))


def _rng_for(bot: dict, bet_id: str) -> random.Random:
    seed = hashlib.md5(f"{bet_id}:{bot.get('id', '')}".encode()).hexdigest()
    return random.Random(int(seed[:8], 16))


def _difficulty_yes_bias(bot: dict) -> float:
    difficulty = bot.get("room_difficulty") or bot.get("bot_difficulty") or "medium"
    if difficulty == "easy":
        return 0.5
    if difficulty == "hard":
        return float(bot.get("yes_bias", 0.55))
    return float(bot.get("yes_bias", 0.55))


def pick_flash_bet_option(
    bot: dict,
    options: list[str],
    bet_id: str,
    event_type: str | None = None,
) -> str:
    opts = [str(o).strip() for o in options if str(o).strip()]
    if not opts:
        return "Yes"
    if len(opts) == 1:
        return opts[0]

    rng = _rng_for(bot, bet_id)
    difficulty = bot.get("room_difficulty") or bot.get("bot_difficulty") or "medium"
    yes_bias = _difficulty_yes_bias(bot)

    if difficulty == "easy":
        return rng.choice(opts)

    if event_type in ("GOAL", "PENALTY"):
        yes_bias = min(0.85, yes_bias + 0.12)
    elif event_type == "RED_CARD":
        yes_bias = max(0.15, yes_bias - 0.2)

    if "Yes" in opts and "No" in opts:
        return "Yes" if rng.random() < yes_bias else "No"

    weights = [1.0 + (i * 0.15) for i in range(len(opts))]
    return rng.choices(opts, weights=weights, k=1)[0]


def answer_open_flash_bet(room: dict, open_bet: dict, host_id: str) -> list[dict]:
    from services.flash_bets import submit_answer

    options = open_bet.get("options") or ["Yes", "No"]
    if not isinstance(options, list):
        options = ["Yes", "No"]
    event_type = open_bet.get("match_event_type")
    answers = []
    code = room.get("room_code", "")
    for bot in bots_for_room(room, host_id):
        uid = bot["id"]
        db = get_supabase()
        member = db.table("room_players").select("id").eq(
            "room_id", room["id"]
        ).eq("user_id", uid).execute()
        if not member.data:
            continue
        existing = db.table("flash_bet_answers").select("id").eq(
            "flash_bet_id", open_bet["id"]
        ).eq("user_id", uid).execute()
        if existing.data:
            continue
        choice = pick_flash_bet_option(bot, options, open_bet["id"], event_type)
        try:
            row = submit_answer(code, open_bet["id"], uid, choice)
            answers.append({**row, "display_name": bot.get("display_name")})
        except (ValueError, PermissionError) as exc:
            logger.debug("bot flash answer skipped %s: %s", uid, exc)
    return answers
