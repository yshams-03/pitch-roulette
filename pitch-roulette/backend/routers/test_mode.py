"""Test Mode Router — Egypt vs Belgium solo simulation."""
from __future__ import annotations

import asyncio
import time
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, HTTPException
from pydantic import BaseModel, Field

from config import get_settings
from database import get_supabase
from services import game_engine
from services.bet_resolver import resolve_flash_bet
from services.fantasy import submit_fantasy_picks, update_fantasy_scores_from_event
from services.player_balance import add_balance, deduct_balance
from services.test_scenario import (
    BELGIUM_LINEUP,
    BOTS,
    BOT_SABOTAGE_SCRIPT,
    DEFAULT_SPEED,
    EGYPT_LINEUP,
    HANDICAP_ACTIVE,
    MATCH_SCRIPT,
    SQUAD_STRENGTH_BELGIUM,
    SQUAD_STRENGTH_EGYPT,
    TEST_MATCH_ID,
    picks_for_ids,
    top_fantasy_player_ids,
)

router = APIRouter(prefix="/test", tags=["test"])

_test_state: dict = {
    "room_id": None,
    "room_code": None,
    "real_player_id": None,
    "real_player_token": None,
    "bot_player_ids": {},
    "bot_player_tokens": {},
    "event_index": 0,
    "match_started_at": None,
    "score_a": 0,
    "score_b": 0,
    "match_minute": 0,
    "last_event": None,
    "running": False,
    "speed": DEFAULT_SPEED,
}


def get_test_live_snapshot() -> dict:
    """Live score/clock for TEST_EGY_BEL (used by /sports/live)."""
    minute = _test_state.get("match_minute") or 0
    return {
        "score": {"a": _test_state.get("score_a", 0), "b": _test_state.get("score_b", 0)},
        "clock": f"{minute}'",
        "status": "LIVE" if _test_state.get("running") or minute > 0 else "NS",
        "events": [],
        "stats": {"response": []},
    }


class CreateSessionRequest(BaseModel):
    nickname: str = "Yassin"


TEST_SETTINGS = {
    "allow_switching": True,
    "module_fantasy": True,
    "module_flash_bets": True,
    "module_sabotage": True,
    "chaos_frequency": "high",
    "api_buffer_seconds": 3,
    "custom_switch_penalty": None,
    "test_mode": True,
    "fantasy_pick_count": 11,
    "fantasy_all_teams": True,
    "score_predictions": {},
}


async def _submit_bot_fantasy(room_id: str) -> None:
    bot_ids = top_fantasy_player_ids(11)
    picks = picks_for_ids(bot_ids)

    async def submit_one(nick: str) -> None:
        player_id = _test_state["bot_player_ids"][nick]
        existing = _db().table("fantasy_picks").select("id").eq("player_id", player_id).limit(1).execute()
        if existing.data:
            return
        await submit_fantasy_picks(player_id, room_id, picks)

    await asyncio.gather(*[submit_one(nick) for nick in _test_state["bot_player_ids"]])


async def _submit_bot_score_predictions(room_id: str) -> None:
    room = await game_engine.get_room_by_id(room_id)
    if not room:
        return
    settings = dict(room.get("settings") or {})
    predictions = dict(settings.get("score_predictions") or {})
    for nick, pid in _test_state["bot_player_ids"].items():
        predictions[pid] = {"score_a": 1, "score_b": 2}
    settings["score_predictions"] = predictions
    _db().table("rooms").update({"settings": settings}).eq("id", room_id).execute()


async def _resolve_post_match(room_id: str, score_a: int, score_b: int) -> None:
    room = await game_engine.get_room_by_id(room_id)
    if not room:
        return
    settings = room.get("settings") or {}
    predictions = settings.get("score_predictions") or {}

    for player_id, pred in predictions.items():
        exact = pred.get("score_a") == score_a and pred.get("score_b") == score_b
        correct_result = (
            (pred.get("score_a", 0) > pred.get("score_b", 0) and score_a > score_b)
            or (pred.get("score_a", 0) < pred.get("score_b", 0) and score_a < score_b)
            or (pred.get("score_a", 0) == pred.get("score_b", 0) and score_a == score_b)
        )
        reward = 500 if exact else (200 if correct_result else 0)
        if reward:
            add_balance(player_id, reward)
            player = _db().table("players").select("nickname").eq("id", player_id).execute()
            name = player.data[0]["nickname"] if player.data else "Player"
            label = "exact score" if exact else "correct result"
            await game_engine.send_system_message(
                room_id, f"Score prediction: {name} wins {reward} PC ({label})!",
            )

    totals: dict[str, float] = {}
    scores = _db().table("fantasy_scores").select("*").eq("room_id", room_id).execute()
    for row in scores.data or []:
        pid = row["player_id"]
        totals[pid] = totals.get(pid, 0.0) + float(row.get("total_fantasy_score", 0))

    if totals:
        winner_id = max(totals, key=totals.get)
        winner = _db().table("players").select("nickname").eq("id", winner_id).execute()
        name = winner.data[0]["nickname"] if winner.data else "Player"
        await game_engine.send_system_message(
            room_id,
            f"Fantasy winner: {name} with squad rating {totals[winner_id]:.1f}!",
        )


class RunAutoRequest(BaseModel):
    speed: float = Field(default=DEFAULT_SPEED, ge=0.5, le=20.0)


def _db():
    return get_supabase()


@router.post("/create-session")
async def create_test_session(req: CreateSessionRequest):
    code = game_engine.generate_room_code()
    room_result = _db().table("rooms").insert({
        "code": code,
        "match_id": TEST_MATCH_ID,
        "match_name": "Egypt vs Belgium — Test Match",
        "team_a_name": "Egypt",
        "team_b_name": "Belgium",
        "state": "LOBBY",
        "settings": TEST_SETTINGS,
        "squad_strength_a": SQUAD_STRENGTH_EGYPT,
        "squad_strength_b": SQUAD_STRENGTH_BELGIUM,
        "handicap_active": HANDICAP_ACTIVE,
        "underdog_team": None,
        "underdog_multiplier": 1.0,
    }).execute()
    room = room_result.data[0]
    room_id = room["id"]

    real_token = game_engine.generate_session_token()
    real_result = _db().table("players").insert({
        "room_id": room_id,
        "nickname": req.nickname,
        "assigned_team": None,
        "balance": 1000,
        "is_host": True,
        "session_token": real_token,
    }).execute()
    real_player = real_result.data[0]
    real_player_id = real_player["id"]
    _db().table("rooms").update({"host_player_id": real_player_id}).eq("id", room_id).execute()

    bot_ids: dict[str, str] = {}
    bot_tokens: dict[str, str] = {}
    for bot in BOTS:
        bot_token = game_engine.generate_session_token()
        bot_result = _db().table("players").insert({
            "room_id": room_id,
            "nickname": bot["nickname"],
            "assigned_team": None,
            "balance": 1000,
            "is_host": False,
            "session_token": bot_token,
        }).execute()
        bot_player = bot_result.data[0]
        bot_ids[bot["nickname"]] = bot_player["id"]
        bot_tokens[bot["nickname"]] = bot_token

    await game_engine.send_system_message(
        room_id,
        f"TEST MODE — Egypt vs Belgium | Step 1: Start Draft for random team assignment | "
        f"Step 2: Switch team (penalty) or predict score | Step 3: Pick 11 fantasy players | "
        f"Step 4: Live match with flash bets + sabotage",
    )

    _test_state.update({
        "room_id": room_id,
        "room_code": code,
        "real_player_id": real_player_id,
        "real_player_token": real_token,
        "bot_player_ids": bot_ids,
        "bot_player_tokens": bot_tokens,
        "event_index": 0,
        "match_started_at": time.time(),
        "score_a": 0,
        "score_b": 0,
        "match_minute": 0,
        "last_event": None,
        "running": False,
        "speed": DEFAULT_SPEED,
    })

    return {
        "room_id": room_id,
        "room_code": code,
        "real_player_token": real_token,
        "real_player_id": real_player_id,
        "bots": [{"nickname": b["nickname"]} for b in BOTS],
        "total_events": len(MATCH_SCRIPT),
        "flow": [
            "1. Start Draft — random teams assigned",
            "2. Scouting — switch team (PC penalty) + predict final score",
            "3. Lock Fantasy — pick 11 players from both squads",
            "4. Go Live — flash bets + sabotage fire during match",
        ],
        "frontend_url": f"http://localhost:5173/room/{code}/lobby",
        "live_url": f"http://localhost:5173/room/{code}/live",
    }


@router.post("/start-draft")
async def test_start_draft():
    if not _test_state["room_id"]:
        raise HTTPException(400, "No active test session.")
    room = await game_engine.get_room_by_id(_test_state["room_id"])
    if not room:
        raise HTTPException(404, "Room not found")
    if room["state"] == "SCOUTING":
        return {"state": "SCOUTING", "message": "Already in scouting — switch team or predict score."}
    if room["state"] != "LOBBY":
        raise HTTPException(409, detail={"error": "invalid_state", "current": room["state"], "required": "LOBBY"})
    await game_engine.allocate_teams(_test_state["room_id"])
    updated = await game_engine.advance_room_state(_test_state["room_id"], "SCOUTING")
    return {"state": updated["state"], "message": "Teams assigned randomly. Open Scouting to switch or predict score."}


@router.post("/lock-fantasy")
async def test_lock_fantasy():
    if not _test_state["room_id"]:
        raise HTTPException(400, "No active test session.")
    room = await game_engine.get_room_by_id(_test_state["room_id"])
    if not room:
        raise HTTPException(404, "Room not found")
    if room["state"] == "DRAFT_LOCKED":
        return {"state": "DRAFT_LOCKED", "message": "Already in fantasy draft — pick your 11 players."}
    if room["state"] == "LOBBY":
        await game_engine.allocate_teams(_test_state["room_id"])
        await game_engine.advance_room_state(_test_state["room_id"], "SCOUTING")
        room = await game_engine.get_room_by_id(_test_state["room_id"])
    if room["state"] not in ("SCOUTING",):
        raise HTTPException(409, detail={"error": "invalid_state", "current": room["state"], "required": "SCOUTING"})

    await _ensure_user_prediction(_test_state["room_id"], _test_state["real_player_id"])
    await _submit_bot_score_predictions(_test_state["room_id"])
    updated = await game_engine.advance_room_state(_test_state["room_id"], "DRAFT_LOCKED")
    await _submit_bot_fantasy(_test_state["room_id"])
    return {
        "state": updated["state"],
        "message": "Fantasy phase open — pick your 11 players from both teams, then Go Live.",
    }


async def _ensure_user_prediction(room_id: str, player_id: str) -> None:
    room = await game_engine.get_room_by_id(room_id)
    settings = dict(room.get("settings") or {})
    predictions = dict(settings.get("score_predictions") or {})
    if player_id not in predictions:
        predictions[player_id] = {"score_a": 1, "score_b": 2}
        settings["score_predictions"] = predictions
        _db().table("rooms").update({"settings": settings}).eq("id", room_id).execute()


async def _ensure_user_fantasy(room_id: str, player_id: str) -> None:
    existing = _db().table("fantasy_picks").select("id").eq("player_id", player_id).execute()
    if not existing.data:
        await submit_fantasy_picks(player_id, room_id, picks_for_ids(top_fantasy_player_ids(11)))


@router.post("/quick-start")
async def quick_start(req: CreateSessionRequest):
    """One-click setup: create room → teams → predictions → fantasy → LIVE."""
    if _test_state["room_id"]:
        _db().table("rooms").delete().eq("id", _test_state["room_id"]).execute()
        _test_state.update({
            "room_id": None, "room_code": None, "real_player_id": None,
            "real_player_token": None, "bot_player_ids": {}, "event_index": 0,
            "running": False,
        })

    created = await create_test_session(req)
    room_id = _test_state["room_id"]
    player_id = _test_state["real_player_id"]

    await game_engine.allocate_teams(room_id)
    await game_engine.advance_room_state(room_id, "SCOUTING")
    await _ensure_user_prediction(room_id, player_id)
    await _submit_bot_score_predictions(room_id)
    await game_engine.advance_room_state(room_id, "DRAFT_LOCKED")
    await _submit_bot_fantasy(room_id)
    # Stop at DRAFT_LOCKED so the player can pick / re-pick their 11 before Go Live
    updated = await game_engine.get_room_by_id(room_id)

    return {
        **created,
        "state": updated["state"],
        "message": "Pick your 11 players in Draft, then Go Live and Run Full Auto.",
        "draft_url": f"http://localhost:5173/room/{created['room_code']}/draft",
        "live_url": f"http://localhost:5173/room/{created['room_code']}/live",
    }


@router.post("/go-live")
async def go_live():
    if not _test_state["room_id"]:
        raise HTTPException(400, "No active test session.")
    room = await game_engine.get_room_by_id(_test_state["room_id"])
    if not room:
        raise HTTPException(404, "Room not found")
    state = room["state"]
    if state == "LIVE":
        return {"state": "LIVE"}
    if state == "LOBBY":
        await game_engine.allocate_teams(_test_state["room_id"])
        await game_engine.advance_room_state(_test_state["room_id"], "SCOUTING")
        await _ensure_user_prediction(_test_state["room_id"], _test_state["real_player_id"])
        state = "SCOUTING"
    if state == "SCOUTING":
        await _submit_bot_score_predictions(_test_state["room_id"])
        await game_engine.advance_room_state(_test_state["room_id"], "DRAFT_LOCKED")
        await _submit_bot_fantasy(_test_state["room_id"])
        state = "DRAFT_LOCKED"
    if state == "DRAFT_LOCKED":
        await _ensure_user_fantasy(_test_state["room_id"], _test_state["real_player_id"])
        updated = await game_engine.advance_room_state(_test_state["room_id"], "LIVE")
        return {"state": updated["state"]}
    raise HTTPException(409, detail={"error": "invalid_state", "current": state, "required": "DRAFT_LOCKED"})


@router.post("/advance-event")
async def advance_event(background_tasks: BackgroundTasks):
    if not _test_state["room_id"]:
        raise HTTPException(400, "No active test session. POST /test/create-session first.")

    idx = _test_state["event_index"]
    if idx >= len(MATCH_SCRIPT):
        raise HTTPException(400, "All events have been fired. Match is over.")

    event = MATCH_SCRIPT[idx]
    _test_state["event_index"] += 1
    background_tasks.add_task(_fire_event, event)

    payload = event.get("payload", {})
    desc = payload.get("event_label") or payload.get("content") or event["type"]
    next_type = (
        MATCH_SCRIPT[_test_state["event_index"]]["type"]
        if _test_state["event_index"] < len(MATCH_SCRIPT)
        else "END"
    )
    return {
        "fired": event["type"],
        "description": desc,
        "events_remaining": len(MATCH_SCRIPT) - _test_state["event_index"],
        "next_event": next_type,
    }


@router.post("/run-auto")
async def run_auto(req: RunAutoRequest, background_tasks: BackgroundTasks):
    if not _test_state["room_id"]:
        raise HTTPException(400, "No active test session.")
    if _test_state["running"]:
        raise HTTPException(409, "Simulation already running.")

    room = await game_engine.get_room_by_id(_test_state["room_id"])
    if not room or room["state"] != "LIVE":
        raise HTTPException(409, detail={"error": "room_not_live", "state": room["state"] if room else None})

    picks = _db().table("fantasy_picks").select("id").eq(
        "player_id", _test_state["real_player_id"]
    ).execute()
    if not picks.data:
        await _ensure_user_fantasy(_test_state["room_id"], _test_state["real_player_id"])

    _test_state["speed"] = req.speed
    _test_state["running"] = True
    _test_state["match_started_at"] = time.time()

    background_tasks.add_task(_run_with_live_prep, req.speed)

    minutes = round((MATCH_SCRIPT[-1]["delay_seconds"] / req.speed) / 60, 1)
    return {
        "message": f"Match running at {req.speed}x speed — completes in ~{minutes} minutes.",
        "speed": req.speed,
        "frontend_url": f"http://localhost:5173/room/{_test_state['room_code']}/live",
    }


@router.get("/scenario-state")
async def get_scenario_state():
    if not _test_state["room_id"]:
        return {"active": False}

    idx = _test_state["event_index"]
    upcoming = []
    for ev in MATCH_SCRIPT[idx : idx + 5]:
        payload = ev.get("payload", {})
        upcoming.append({
            "type": ev["type"],
            "delay_seconds": ev["delay_seconds"],
            "description": payload.get("event_label") or payload.get("content") or ev["type"],
        })

    result = {
        "active": True,
        "room_code": _test_state["room_code"],
        "room_id": _test_state["room_id"],
        "real_player_token": _test_state["real_player_token"],
        "events_fired": idx,
        "events_remaining": len(MATCH_SCRIPT) - idx,
        "score_a": _test_state["score_a"],
        "score_b": _test_state["score_b"],
        "match_minute": _test_state["match_minute"],
        "last_event": _test_state["last_event"],
        "running": _test_state["running"],
        "speed": _test_state["speed"],
        "next_events": upcoming,
    }

    room = await game_engine.get_room_by_id(_test_state["room_id"])
    if room:
        result["room_state"] = room["state"]
        settings = room.get("settings") or {}
        result["score_predictions"] = settings.get("score_predictions", {})

    return result


@router.post("/reset")
async def reset_test_session():
    if _test_state["room_id"]:
        _db().table("rooms").delete().eq("id", _test_state["room_id"]).execute()

    _test_state.update({
        "room_id": None,
        "room_code": None,
        "real_player_id": None,
        "real_player_token": None,
        "bot_player_ids": {},
        "bot_player_tokens": {},
        "event_index": 0,
        "match_started_at": None,
        "score_a": 0,
        "score_b": 0,
        "match_minute": 0,
        "last_event": None,
        "running": False,
        "speed": DEFAULT_SPEED,
    })
    return {"message": "Test session cleared. Ready for a new game."}


async def _run_with_live_prep(speed: float):
    try:
        room = await game_engine.get_room_by_id(_test_state["room_id"])
        if room and room["state"] == "DRAFT_LOCKED":
            await game_engine.advance_room_state(_test_state["room_id"], "LIVE")
        await asyncio.gather(
            _run_full_script(speed),
            _run_sabotage_script(speed),
        )
    finally:
        _test_state["running"] = False


async def _ensure_live_for_match_events(etype: str, room_id: str) -> None:
    if etype == "system_message":
        return
    room = await game_engine.get_room_by_id(room_id)
    if room and room["state"] == "DRAFT_LOCKED":
        await game_engine.advance_room_state(room_id, "LIVE")


async def _fire_event(event: dict):
    etype = event["type"]
    payload = event.get("payload", {})
    room_id = _test_state["room_id"]
    if not room_id:
        return

    await _ensure_live_for_match_events(etype, room_id)

    _test_state["last_event"] = etype
    if payload.get("minute"):
        _test_state["match_minute"] = payload["minute"]

    if etype == "system_message":
        await game_engine.send_system_message(room_id, payload["content"])

    elif etype in ("goal", "penalty_missed"):
        await _handle_goal(room_id, payload, missed=etype == "penalty_missed")

    elif etype == "card":
        await _handle_card(room_id, payload)

    elif etype == "substitution":
        team_label = "Egypt" if payload["team_key"] == "A" else "Belgium"
        await game_engine.send_system_message(
            room_id,
            f"Substitution — {team_label}: {payload['player_out_name']} -> "
            f"{payload['player_in_name']} (Min {payload['minute']})",
        )

    elif etype == "var_review":
        await game_engine.send_system_message(
            room_id,
            f"VAR Review — {payload['description']}",
        )

    elif etype == "momentum_shift":
        await game_engine.send_system_message(
            room_id,
            f"Momentum Shift! Possession: Egypt {payload['possession_a']}% — "
            f"Belgium {payload['possession_b']}%",
        )

    elif etype == "penalty_awarded":
        await game_engine.send_system_message(
            room_id,
            f"PENALTY to {payload['team']}! {payload['taker_name']} will take it.",
        )

    elif etype == "half_time":
        _test_state["score_a"] = payload["score_a"]
        _test_state["score_b"] = payload["score_b"]
        await game_engine.send_system_message(
            room_id,
            f"HALF TIME — Egypt {payload['score_a']} – {payload['score_b']} Belgium",
        )

    elif etype == "full_time":
        _test_state["score_a"] = payload["score_a"]
        _test_state["score_b"] = payload["score_b"]
        await game_engine.advance_room_state(room_id, "FULL_TIME")
        await game_engine.send_system_message(
            room_id,
            f"FULL TIME — Egypt {payload['score_a']} – {payload['score_b']} Belgium. "
            f"{payload['winner']} win!",
        )
        await _resolve_post_match(room_id, payload["score_a"], payload["score_b"])
        await asyncio.sleep(3)
        await game_engine.advance_room_state(room_id, "RESULTS")

    elif etype == "flash_bet":
        await _create_and_resolve_flash_bet(room_id, payload, event.get("bot_bets", {}))


async def _handle_goal(room_id: str, payload: dict, missed: bool = False):
    team_label = "Egypt" if payload["team_key"] == "A" else "Belgium"
    _test_state["score_a"] = payload.get("score_a", _test_state["score_a"])
    _test_state["score_b"] = payload.get("score_b", _test_state["score_b"])

    if missed:
        await game_engine.send_system_message(
            room_id,
            f"MISSED! {payload['player_name']} fails from the spot for {team_label}! "
            f"Score: Egypt {_test_state['score_a']} – {_test_state['score_b']} Belgium",
        )
        return

    assist = f" (assist: {payload['assist_name']})" if payload.get("assist_name") else ""
    await game_engine.send_system_message(
        room_id,
        f"GOAL! {payload['player_name']} scores for {team_label}{assist}! "
        f"Score: Egypt {_test_state['score_a']} – {_test_state['score_b']} Belgium",
    )

    rows = _db().table("fantasy_scores").select("*").eq("room_id", room_id).eq(
        "api_player_id", payload["player_id"]
    ).execute()
    for row in rows.data or []:
        new_rating = float(row["current_rating"]) + 0.5
        bonus = int(row["bonus_pc"]) + 50
        penalty = int(row["penalty_pc"])
        total = new_rating + (bonus / 100) - (penalty / 100)
        _db().table("fantasy_scores").update({
            "current_rating": round(new_rating, 1),
            "bonus_pc": bonus,
            "total_fantasy_score": round(total, 1),
        }).eq("id", row["id"]).execute()
        add_balance(row["player_id"], 50)


async def _handle_card(room_id: str, payload: dict):
    color = "Yellow" if payload["card"] == "Yellow" else "Red"
    emoji = "Yellow Card" if color == "Yellow" else "Red Card"
    await game_engine.send_system_message(
        room_id,
        f"{emoji} — {payload['player_name']} ({payload['team']}) — Minute {payload['minute']}",
    )
    await update_fantasy_scores_from_event(room_id, {
        "type": "Card",
        "detail": f"{color} Card",
        "player": {"name": payload["player_name"]},
    })
    await game_engine.process_jinx_for_event(
        room_id,
        {"type": "Card", "detail": f"{color} Card", "player": {"name": payload["player_name"]}},
        api_player_id=payload["player_id"],
    )


async def _create_and_resolve_flash_bet(room_id: str, bet_payload: dict, bot_bets: dict):
    room = await game_engine.get_room_by_id(room_id)
    settings = (room or {}).get("settings", {})
    buffer = settings.get("api_buffer_seconds", 3)
    now = datetime.now(timezone.utc)
    frozen_until = now + timedelta(seconds=buffer)
    closes_at = frozen_until + timedelta(seconds=12)

    bet_result = _db().table("flash_bets").insert({
        "room_id": room_id,
        "bet_type": bet_payload["bet_type"],
        "event_label": bet_payload["event_label"],
        "options": bet_payload["options"],
        "frozen_until": frozen_until.isoformat(),
        "closes_at": closes_at.isoformat(),
        "state": "FROZEN",
    }).execute()
    bet = bet_result.data[0]
    bet_id = bet["id"]

    await game_engine.send_system_message(room_id, f"Flash bet: {bet_payload['event_label']}")
    await asyncio.sleep(buffer)
    _db().table("flash_bets").update({"state": "OPEN"}).eq("id", bet_id).execute()

    await asyncio.sleep(2)
    await _place_bot_wagers(bet_id, room_id, bot_bets)

    await asyncio.sleep(10)
    _db().table("flash_bets").update({"state": "CLOSED"}).eq("id", bet_id).execute()
    await asyncio.sleep(2)

    winning_option = bet_payload.get("winning_option", "option_a")
    try:
        await resolve_flash_bet(bet_id, winning_option)
    except ValueError:
        pass


async def _place_bot_wagers(bet_id: str, room_id: str, bot_bets: dict):
    for nick, decision in bot_bets.items():
        player_id = _test_state["bot_player_ids"].get(nick)
        if not player_id:
            continue
        amount = min(decision["amount"], 500)
        if amount < 10:
            continue
        if deduct_balance(player_id, amount) is None:
            continue
        _db().table("wagers").insert({
            "flash_bet_id": bet_id,
            "player_id": player_id,
            "room_id": room_id,
            "chosen_option": decision["option"],
            "amount": amount,
        }).execute()


async def _run_full_script(speed: float = DEFAULT_SPEED):
    start = _test_state["match_started_at"] or time.time()
    for event in MATCH_SCRIPT[_test_state["event_index"] :]:
        target_time = start + (event["delay_seconds"] / speed)
        wait = target_time - time.time()
        if wait > 0:
            await asyncio.sleep(wait)
        if not _test_state["room_id"]:
            break
        await _fire_event(event)
        _test_state["event_index"] += 1


async def _run_sabotage_script(speed: float = DEFAULT_SPEED):
    start = _test_state["match_started_at"] or time.time()
    costs = get_settings().SABOTAGE_COSTS
    durations = get_settings().SABOTAGE_DURATIONS

    for sabotage in BOT_SABOTAGE_SCRIPT:
        target_time = start + (sabotage["delay_seconds"] / speed)
        wait = target_time - time.time()
        if wait > 0:
            await asyncio.sleep(wait)
        if not _test_state["room_id"]:
            break

        sender_id = _test_state["bot_player_ids"].get(sabotage["sender"])
        if sabotage["target"] == "REAL_PLAYER":
            target_id = _test_state["real_player_id"]
            target_display = "YOU"
        else:
            target_id = _test_state["bot_player_ids"].get(sabotage["target"])
            target_display = sabotage["target"]

        if not sender_id or not target_id:
            continue

        token_type = sabotage["token_type"]
        cost = costs.get(token_type, 150)
        if deduct_balance(sender_id, cost) is None:
            continue

        expires = datetime.now(timezone.utc) + timedelta(seconds=durations.get(token_type, 300))
        _db().table("sabotages").insert({
            "room_id": _test_state["room_id"],
            "sender_id": sender_id,
            "target_id": target_id,
            "token_type": token_type,
            "cost": cost,
            "active": True,
            "expires_at": expires.isoformat(),
        }).execute()
        await game_engine.send_system_message(
            _test_state["room_id"],
            f"{sabotage['sender']} deployed {token_type} on {target_display}!",
        )
