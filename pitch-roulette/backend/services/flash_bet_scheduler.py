"""Time-based flash bet scheduler — pools, selection, and auto-resolve."""
from __future__ import annotations

import logging
import random
import re
from copy import deepcopy
from datetime import datetime, timezone
from typing import Any, Callable

from database import get_supabase
from services.flash_bets import (
    DEMO_FLASH_WINDOW_SECONDS,
    FLASH_WINDOW_SECONDS,
    create_scheduled_flash_bet,
    list_flash_bets,
    resolve_flash_bet_by_id,
)
from services.match_engine import infer_match_source, is_simulation_room

logger = logging.getLogger(__name__)

FLASH_BET_SCHEDULE: dict[int, dict[str, str]] = {
    0: {"pool": "kickoff", "tier": "LOW"},
    5: {"pool": "early_game", "tier": "LOW"},
    10: {"pool": "early_game", "tier": "LOW"},
    15: {"pool": "early_game", "tier": "MEDIUM"},
    20: {"pool": "mid_game", "tier": "MEDIUM"},
    25: {"pool": "mid_game", "tier": "MEDIUM"},
    30: {"pool": "mid_game", "tier": "MEDIUM"},
    35: {"pool": "mid_game", "tier": "HIGH"},
    40: {"pool": "pre_halftime", "tier": "HIGH"},
    44: {"pool": "pre_halftime", "tier": "HIGH"},
    45: {"pool": "halftime", "tier": "HIGH"},
    50: {"pool": "second_half", "tier": "LOW"},
    55: {"pool": "second_half", "tier": "MEDIUM"},
    60: {"pool": "second_half", "tier": "MEDIUM"},
    65: {"pool": "mid_game", "tier": "MEDIUM"},
    70: {"pool": "mid_game", "tier": "HIGH"},
    75: {"pool": "late_game", "tier": "HIGH"},
    80: {"pool": "late_game", "tier": "HIGH"},
    85: {"pool": "final_push", "tier": "HIGH"},
    88: {"pool": "final_push", "tier": "HIGH"},
    90: {"pool": "fulltime", "tier": "HIGH"},
}

DEMO_FLASH_BET_SCHEDULE: dict[int, dict[str, str]] = {
    1: {"pool": "kickoff", "tier": "LOW"},
    3: {"pool": "early_game", "tier": "LOW"},
    5: {"pool": "mid_game", "tier": "MEDIUM"},
    8: {"pool": "pre_halftime", "tier": "HIGH"},
    10: {"pool": "halftime", "tier": "HIGH"},
    12: {"pool": "second_half", "tier": "MEDIUM"},
    15: {"pool": "late_game", "tier": "HIGH"},
    18: {"pool": "final_push", "tier": "HIGH"},
    20: {"pool": "fulltime", "tier": "HIGH"},
}

QUESTION_POOLS: dict[str, list[dict[str, Any]]] = {
    "kickoff": [
        {
            "question": "Who scores the first goal?",
            "options": ["{home_team}", "{away_team}", "No goal in first 20 min"],
            "answer_key": "first_goal_team",
        },
        {
            "question": "Will there be a goal in the first 15 minutes?",
            "options": ["Yes", "No"],
            "answer_key": "goal_before_15",
        },
        {
            "question": "Which team wins the first corner?",
            "options": ["{home_team}", "{away_team}"],
            "answer_key": "first_corner",
        },
    ],
    "early_game": [
        {
            "question": "Next team to score?",
            "options": ["{home_team}", "{away_team}", "No more goals this half"],
            "answer_key": "next_scorer",
        },
        {
            "question": "Will there be a yellow card before the 30th minute?",
            "options": ["Yes", "No"],
            "answer_key": "yellow_before_30",
        },
        {
            "question": "Total goals in first half: over or under 1.5?",
            "options": ["Over 1.5", "Under 1.5"],
            "answer_key": "first_half_goals_ou",
        },
    ],
    "mid_game": [
        {
            "question": "Next goal in this match?",
            "options": ["{home_team}", "{away_team}", "No goal next 10 min"],
            "answer_key": "next_goal",
        },
        {
            "question": "Will the current score change in the next 10 minutes?",
            "options": ["Yes — goal coming", "No — stays the same"],
            "answer_key": "score_change_10",
        },
        {
            "question": "Next set piece leads to a shot on target?",
            "options": ["Yes", "No"],
            "answer_key": "set_piece_shot",
        },
        {
            "question": "Any substitution before the 60th minute?",
            "options": ["Yes", "No"],
            "answer_key": "sub_before_60",
        },
    ],
    "pre_halftime": [
        {
            "question": "Will there be a goal in added time?",
            "options": ["Yes", "No"],
            "answer_key": "ht_added_time_goal",
        },
        {
            "question": "Half time score: correct?",
            "options": [
                "{home_score}-{away_score} (current stands)",
                "Score changes before HT",
            ],
            "answer_key": "ht_score_stands",
        },
        {
            "question": "More than {added_time} minutes of added time?",
            "options": ["Yes", "No"],
            "answer_key": "more_added_time",
        },
    ],
    "halftime": [
        {
            "question": "Which team scores first in the second half?",
            "options": ["{home_team}", "{away_team}", "No goals in 2nd half"],
            "answer_key": "second_half_first_scorer",
        },
        {
            "question": "Will the result change in the second half?",
            "options": ["Yes", "No"],
            "answer_key": "result_changes_2h",
        },
        {
            "question": "Total goals in the match: over or under 2.5?",
            "options": ["Over 2.5", "Under 2.5"],
            "answer_key": "total_goals_ou",
        },
        {
            "question": "Any red card in the second half?",
            "options": ["Yes", "No"],
            "answer_key": "red_card_2h",
        },
    ],
    "second_half": [
        {
            "question": "Next goal scorer plays for?",
            "options": ["{home_team}", "{away_team}", "No more goals"],
            "answer_key": "next_scorer_team",
        },
        {
            "question": "Any VAR check in the next 15 minutes?",
            "options": ["Yes", "No"],
            "answer_key": "var_next_15",
        },
        {
            "question": "Will there be a penalty before full time?",
            "options": ["Yes", "No"],
            "answer_key": "penalty_before_ft",
        },
    ],
    "late_game": [
        {
            "question": "Final score stays as {home_score}-{away_score}?",
            "options": ["Yes — final score", "No — it changes"],
            "answer_key": "score_final",
        },
        {
            "question": "Any goal in the last 10 minutes?",
            "options": ["Yes", "No"],
            "answer_key": "goal_last_10",
        },
        {
            "question": "Will this go to extra time?",
            "options": ["Yes", "No"],
            "answer_key": "extra_time",
            "condition": "knockout_match",
        },
        {
            "question": "Next corner leads to a goal?",
            "options": ["Yes", "No"],
            "answer_key": "corner_goal",
        },
    ],
    "final_push": [
        {
            "question": "Any goal in added time?",
            "options": ["Yes", "No"],
            "answer_key": "goal_added_time",
        },
        {
            "question": "Final score: {home_score}-{away_score}?",
            "options": ["Yes — this is it", "No — it changes"],
            "answer_key": "score_final_90",
        },
        {
            "question": "More than {added_time} minutes of stoppage time?",
            "options": ["Yes", "No"],
            "answer_key": "stoppage_over",
        },
    ],
    "fulltime": [
        {
            "question": "Man of the match plays for?",
            "options": ["{home_team}", "{away_team}"],
            "answer_key": "motm_team",
        },
        {
            "question": "Total goals in the match: over or under 2.5?",
            "options": ["Over 2.5", "Under 2.5"],
            "answer_key": "total_goals_final",
        },
    ],
}

_GOAL_TYPES = frozenset({"GOAL", "GOAL_HOME", "GOAL_AWAY", "OWN_GOAL", "PENALTY_SCORED"})
_YELLOW_TYPES = frozenset({"YELLOW", "YELLOW_CARD", "SECOND_YELLOW"})
_RED_TYPES = frozenset({"RED", "RED_CARD", "SECOND_YELLOW"})
_SKIP_STATUS = frozenset({"NS", "FT", "AET", "PEN", "FINISHED", "SCHEDULED"})


def _check_condition(condition: str | None, ctx: dict) -> bool:
    if condition is None:
        return True
    if condition == "knockout_match":
        return bool(ctx.get("is_knockout"))
    if condition == "score_tied":
        return ctx.get("home_score") == ctx.get("away_score")
    if condition == "losing_team":
        return ctx.get("home_score") != ctx.get("away_score")
    return True


def _fill_templates(question: dict, ctx: dict) -> dict:
    q = deepcopy(question)
    replacements = {
        "{home_team}": str(ctx.get("home_team", "Home")),
        "{away_team}": str(ctx.get("away_team", "Away")),
        "{home_score}": str(ctx.get("home_score", 0)),
        "{away_score}": str(ctx.get("away_score", 0)),
        "{added_time}": str(ctx.get("added_time", 4)),
    }
    for k, v in replacements.items():
        q["question"] = q["question"].replace(k, v)
        q["options"] = [opt.replace(k, v) for opt in q["options"]]
    return q


def _weighted_pick(available: list[dict], ctx: dict) -> dict:
    if not available:
        raise ValueError("empty_pool")
    if len(available) == 1:
        return available[0]
    weights = []
    for q in available:
        w = 1.0
        key = q.get("answer_key", "")
        if key in ("score_final", "score_final_90") and ctx.get("minute", 0) >= 75:
            w = 2.0
        if key == "goal_before_15" and ctx.get("minute", 0) <= 10:
            w = 2.0
        weights.append(w)
    return random.choices(available, weights=weights, k=1)[0]


def select_flash_bet_question(
    pool_name: str,
    match_context: dict,
    used_answer_keys: list[str],
) -> dict:
    pool = QUESTION_POOLS.get(pool_name, QUESTION_POOLS["mid_game"])
    available = [q for q in pool if q.get("answer_key") not in used_answer_keys]
    if not available:
        available = list(pool)
    available = [q for q in available if _check_condition(q.get("condition"), match_context)]
    if not available:
        available = list(pool)
    picked = _weighted_pick(available, match_context)
    return _fill_templates(picked, match_context)


def _norm_events(events: list[dict]) -> list[dict]:
    out = []
    for e in events:
        et = str(e.get("type", "")).upper()
        minute = int(e.get("minute") or 0)
        out.append({**e, "type": et, "minute": minute})
    return out


def _has_goal(events: list[dict], max_minute: int | None = None) -> bool:
    for e in events:
        if e["type"] not in _GOAL_TYPES:
            continue
        if max_minute is None or e["minute"] <= max_minute:
            return True
    return False


def _has_card(events: list[dict], types: frozenset, max_minute: int | None = None) -> bool:
    for e in events:
        if e["type"] not in types:
            continue
        if max_minute is None or e["minute"] <= max_minute:
            return True
    return False


def _resolve_goal_before_15(_ctx: dict, events: list[dict]) -> str:
    return "Yes" if _has_goal(events, 15) else "No"


def _resolve_yellow_before_30(_ctx: dict, events: list[dict]) -> str:
    return "Yes" if _has_card(events, _YELLOW_TYPES, 30) else "No"


def _resolve_score_final(ctx: dict, events: list[dict]) -> str:
    if any(e["type"] in _GOAL_TYPES for e in events):
        return "No — it changes"
    return "Yes — final score"


def _resolve_score_final_90(ctx: dict, events: list[dict]) -> str:
    if any(e["type"] in _GOAL_TYPES for e in events):
        return "No — it changes"
    return "Yes — this is it"


def _resolve_goal_last_10(ctx: dict, events: list[dict]) -> str:
    start = int(ctx.get("minute") or 80)
    if any(e["type"] in _GOAL_TYPES and e["minute"] >= start for e in events):
        return "Yes"
    return "No"


def _resolve_total_goals_ou(ctx: dict, events: list[dict]) -> str:
    home = int(ctx.get("home_score", 0))
    away = int(ctx.get("away_score", 0))
    for e in events:
        if e["type"] in _GOAL_TYPES:
            team = e.get("team", "home")
            if team == "away":
                away += 1
            else:
                home += 1
    total = home + away
    return "Over 2.5" if total > 2 else "Under 2.5"


def _resolve_result_changes_2h(_ctx: dict, events: list[dict]) -> str:
    return "Yes" if _has_goal(events) else "No"


ANSWER_RESOLVERS: dict[str, Callable[[dict, list[dict]], str | None]] = {
    "goal_before_15": _resolve_goal_before_15,
    "yellow_before_30": _resolve_yellow_before_30,
    "score_final": _resolve_score_final,
    "score_final_90": _resolve_score_final_90,
    "goal_last_10": _resolve_goal_last_10,
    "total_goals_ou": _resolve_total_goals_ou,
    "total_goals_final": _resolve_total_goals_ou,
    "result_changes_2h": _resolve_result_changes_2h,
    "score_change_10": lambda _c, ev: (
        "Yes — goal coming" if _has_goal(ev) else "No — stays the same"
    ),
    "goal_added_time": lambda _c, ev: "Yes" if _has_goal(ev) else "No",
    "ht_added_time_goal": lambda _c, ev: "Yes" if _has_goal(ev) else "No",
    "red_card_2h": lambda _c, ev: "Yes" if _has_card(ev, _RED_TYPES) else "No",
    "penalty_before_ft": lambda _c, ev: (
        "Yes"
        if any(e["type"] in ("PENALTY_SCORED", "PENALTY_MISSED", "PENALTY") for e in ev)
        else "No"
    ),
}


def auto_resolve_flash_bet(
    answer_key: str,
    match_context_at_creation: dict,
    events_since_creation: list[dict],
) -> str | None:
    resolver = ANSWER_RESOLVERS.get(answer_key)
    if not resolver:
        return None
    try:
        return resolver(match_context_at_creation, _norm_events(events_since_creation))
    except Exception:
        return None


def _match_context(room: dict) -> dict:
    md = room.get("match_data") or {}
    stage = str(md.get("stage") or "")
    is_ko = bool(
        md.get("is_knockout")
        or re.search(r"ROUND|QUARTER|SEMI|FINAL|KNOCKOUT", stage.upper())
    )
    return {
        "home_team": md.get("home_team", "Home"),
        "away_team": md.get("away_team", "Away"),
        "home_score": int(md.get("home_goals") or md.get("home_score") or 0),
        "away_score": int(md.get("away_goals") or md.get("away_score") or 0),
        "added_time": int(md.get("added_time") or 4),
        "minute": int(md.get("minute") or 0),
        "is_knockout": is_ko,
        "status": md.get("status", "1H"),
    }


def _effective_minute(room: dict) -> int | None:
    ctx = _match_context(room)
    minute = ctx.get("minute")
    if minute is None:
        return None
    minute = int(minute)
    if is_simulation_room(room) and infer_match_source(room) == "demo_simulation":
        sim = room.get("match_simulation_json") or {}
        if sim.get("minute") is not None:
            minute = int(sim["minute"])
    return minute


def _schedule_for_room(room: dict) -> dict[int, dict[str, str]]:
    if is_simulation_room(room):
        return DEMO_FLASH_BET_SCHEDULE
    return FLASH_BET_SCHEDULE


def _used_answer_keys(room_id: str) -> list[str]:
    db = get_supabase()
    try:
        rows = (
            db.table("flash_bets")
            .select("answer_key")
            .eq("room_id", room_id)
            .execute()
            .data
            or []
        )
        return [str(r["answer_key"]) for r in rows if r.get("answer_key")]
    except Exception:
        return []


def _already_fired_minute(room_id: str, match_minute: int) -> bool:
    db = get_supabase()
    try:
        rows = (
            db.table("flash_bet_minutes")
            .select("match_minute")
            .eq("room_id", room_id)
            .eq("match_minute", match_minute)
            .execute()
            .data
        )
        if rows:
            return True
    except Exception:
        pass
    try:
        rows = (
            db.table("flash_bets")
            .select("id")
            .eq("room_id", room_id)
            .eq("match_minute", match_minute)
            .execute()
            .data
        )
        return bool(rows)
    except Exception:
        return False


def _has_active_bet(room_code: str) -> bool:
    bets = list_flash_bets(room_code)
    return any(b.get("state") in ("OPEN", "LOCKED") for b in bets)


async def maybe_fire_flash_bet(room: dict) -> dict | None:
    """Fire a scheduled flash bet if the match minute matches the schedule."""
    if room.get("state") != "LIVE":
        return None
    code = room.get("room_code", "")
    if _has_active_bet(code):
        return None

    ctx = _match_context(room)
    status = str(ctx.get("status", "1H")).upper()
    if status in _SKIP_STATUS:
        return None

    minute = _effective_minute(room)
    if minute is None:
        return None

    schedule = _schedule_for_room(room)
    entry = schedule.get(minute)
    if not entry:
        return None

    room_id = room["id"]
    if _already_fired_minute(room_id, minute):
        return None

    used = _used_answer_keys(room_id)
    question_data = select_flash_bet_question(entry["pool"], ctx, used)

    window = DEMO_FLASH_WINDOW_SECONDS if is_simulation_room(room) else FLASH_WINDOW_SECONDS
    bet = create_scheduled_flash_bet(
        room_id=room_id,
        question=question_data["question"],
        options=question_data["options"],
        answer_key=question_data["answer_key"],
        wager_tier=entry["tier"],
        match_minute=minute,
        match_context_snapshot=ctx,
        window_seconds=window,
    )
    if bet:
        logger.info(
            "[FlashBet] Fired at minute %s for room %s: %s",
            minute,
            code,
            question_data["question"],
        )
    return bet


def _events_since(room_id: str, created_at: str | None) -> list[dict]:
    db = get_supabase()
    try:
        rows = (
            db.table("room_events")
            .select("payload, minute, event_type")
            .eq("room_id", room_id)
            .execute()
            .data
            or []
        )
    except Exception:
        rows = []
    events = []
    for row in rows:
        payload = row.get("payload") or {}
        events.append({
            "type": payload.get("type") or row.get("event_type"),
            "minute": row.get("minute") or payload.get("minute"),
            "team": payload.get("team"),
        })
    if created_at:
        # include simulation events from match_data if present
        pass
    return events


async def try_auto_resolve_locked_bets(room: dict) -> int:
    """Attempt auto-resolve on LOCKED bets; returns count resolved."""
    host_id = room.get("host_id")
    if not host_id:
        return 0
    resolved = 0
    bets = list_flash_bets(room["room_code"])
    for bet in bets:
        if bet.get("state") != "LOCKED":
            continue
        if bet.get("auto_resolved"):
            continue
        key = bet.get("answer_key")
        if not key:
            continue
        ctx = bet.get("match_context_snapshot") or _match_context(room)
        events = _events_since(room["id"], bet.get("created_at"))
        answer = auto_resolve_flash_bet(key, ctx, events)
        if not answer:
            continue
        options = bet.get("options") or []
        if isinstance(options, list) and answer not in options:
            for opt in options:
                if opt.lower() == answer.lower():
                    answer = opt
                    break
            else:
                continue
        try:
            resolve_flash_bet_by_id(
                room["room_code"],
                bet["id"],
                str(host_id),
                answer,
                auto_resolved=True,
            )
            resolved += 1
        except Exception as exc:
            logger.debug("auto-resolve skipped %s: %s", bet.get("id"), exc)
    return resolved
