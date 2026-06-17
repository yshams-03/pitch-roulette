from fastapi import APIRouter, Depends, HTTPException

from auth import get_current_user_id
from database import get_supabase
from models import (
    CloseRoomRequest,
    CreateFlashBetRequest,
    CreateRoomRequest,
    FlashBetAnswerRequest,
    InjectEventRequest,
    KickPlayerRequest,
    PredictRequest,
    ResolveFlashBetRequest,
    RoomMessageRequest,
    ToggleChatRequest,
)
from services import sports_service
from services.bots import (
    bot_config_to_json,
    join_bots_to_room,
    on_predictions_opened,
)
from services.codes import unique_room_code
from services.db_compat import strip_unified_fields
from services.event_pipeline import notify_manual_inject
from services.flash_bets import (
    create_manual_flash_bet,
    get_bet_results,
    list_flash_bets,
    resolve_flash_bet,
    submit_answer,
)
from services.match_engine import (
    create_simulation_room,
    fast_forward_event,
    go_live_simulation,
    inject_event,
    inject_random_event,
    is_simulation_room,
    mark_simulation_ended,
    resolve_active_bet,
)
from services.points import actual_outcome, close_room_and_award
from services.room_messages import delete_message, list_messages, post_message
from services.room_snapshot import room_snapshot as _room_snapshot

router = APIRouter(prefix="/api/rooms", tags=["rooms"])

_LIVE = frozenset({"IN_PLAY", "PAUSED", "LIVE", "1H", "HT", "2H", "ET", "BT", "P", "INT"})


def _get_room(code: str) -> dict:
    db = get_supabase()
    result = db.table("rooms").select("*").eq("room_code", code.upper()).execute()
    if not result.data:
        raise HTTPException(404, detail={"error": "room_not_found"})
    return result.data[0]


def _require_host(room: dict, user_id: str) -> None:
    if room.get("host_id") != user_id:
        raise HTTPException(403, detail={"error": "not_host"})


@router.post("")
async def create_room(body: CreateRoomRequest, user_id: str = Depends(get_current_user_id)):
    if body.match_source == "demo_simulation":
        bot_cfg = body.resolved_bot_config()
        bot_json = bot_config_to_json(bot_cfg.enabled, bot_cfg.count, bot_cfg.difficulty)
        phase = body.phase or "LOBBY"
        room = await create_simulation_room(
            user_id,
            "demo_simulation",
            bot_json,
            phase=phase,
        )
        return room

    if body.match_source == "manual":
        raise HTTPException(400, detail={"error": "manual_not_implemented"})

    if not body.match_id:
        raise HTTPException(400, detail={"error": "match_id_required"})

    live = await sports_service.get_live_match(body.match_id)
    if live.get("status") not in _LIVE:
        raise HTTPException(400, detail={
            "error": "match_not_live",
            "status": live.get("status"),
            "message": "Rooms can only be created for live matches",
        })

    match_data, espn_event_id, _ = await sports_service.bootstrap_espn_for_live_room(live)
    bot_cfg = body.resolved_bot_config()
    bot_json = bot_config_to_json(bot_cfg.enabled, bot_cfg.count, bot_cfg.difficulty)

    db = get_supabase()
    code = unique_room_code()
    room = db.table("rooms").insert(strip_unified_fields({
        "room_code": code,
        "match_id": body.match_id,
        "match_data": match_data,
        "match_source": "live_api",
        "bot_config_json": bot_json,
        "espn_event_id": espn_event_id,
        "host_id": user_id,
        "group_id": body.group_id,
        "state": "LOBBY",
    })).execute().data[0]

    db.table("room_players").insert({
        "room_id": room["id"],
        "user_id": user_id,
        "is_host": True,
    }).execute()

    if bot_cfg.enabled and bot_cfg.count > 0:
        join_bots_to_room(room["id"], room, user_id)

    prof = db.table("profiles").select("rooms_created").eq("id", user_id).execute()
    rc = int(prof.data[0].get("rooms_created", 0)) + 1 if prof.data else 1
    db.table("profiles").update({"rooms_created": rc}).eq("id", user_id).execute()

    return _room_snapshot(room)


@router.get("/{code}")
async def get_room(code: str):
    return _room_snapshot(_get_room(code))


@router.delete("/{code}")
async def delete_room(code: str, user_id: str = Depends(get_current_user_id)):
    """Host-only cleanup — cascades to players, predictions, flash bets, etc."""
    db = get_supabase()
    r = _get_room(code)
    _require_host(r, user_id)
    db.table("rooms").delete().eq("id", r["id"]).execute()
    return {"deleted": True, "code": r["room_code"]}


@router.post("/{code}/join")
async def join_room(code: str, user_id: str = Depends(get_current_user_id)):
    db = get_supabase()
    r = _get_room(code)
    if r["state"] not in ("LOBBY", "PREDICTING"):
        raise HTTPException(409, detail={"error": "room_closed", "state": r["state"]})

    existing = db.table("room_players").select("id").eq("room_id", r["id"]).eq(
        "user_id", user_id
    ).execute()
    if not existing.data:
        db.table("room_players").insert({
            "room_id": r["id"],
            "user_id": user_id,
            "is_host": False,
        }).execute()
    return _room_snapshot(r)


@router.post("/{code}/start")
async def start_predictions(code: str, user_id: str = Depends(get_current_user_id)):
    db = get_supabase()
    r = _get_room(code)
    _require_host(r, user_id)
    if r["state"] != "LOBBY":
        raise HTTPException(409, detail={"error": "invalid_state", "current": r["state"]})
    updated = db.table("rooms").update({"state": "PREDICTING"}).eq("id", r["id"]).execute().data[0]
    on_predictions_opened(r["id"], r, r["host_id"])
    updated = db.table("rooms").select("*").eq("id", r["id"]).execute().data[0]
    return _room_snapshot(updated)


@router.post("/{code}/predict")
async def submit_prediction(code: str, body: PredictRequest, user_id: str = Depends(get_current_user_id)):
    db = get_supabase()
    r = _get_room(code)
    if r["state"] != "PREDICTING":
        raise HTTPException(409, detail={"error": "predictions_closed", "state": r["state"]})

    member = db.table("room_players").select("id").eq("room_id", r["id"]).eq(
        "user_id", user_id
    ).execute()
    if not member.data:
        raise HTTPException(403, detail={"error": "not_in_room"})

    inferred = actual_outcome(body.home_goals, body.away_goals)
    if body.predicted_outcome != inferred:
        raise HTTPException(400, detail={
            "error": "outcome_mismatch",
            "message": "Predicted outcome must match score line",
        })

    existing = db.table("predictions").select("id").eq("room_id", r["id"]).execute()
    is_first = len(existing.data or []) == 0

    db.table("predictions").delete().eq("room_id", r["id"]).eq("user_id", user_id).execute()
    pred = db.table("predictions").insert({
        "room_id": r["id"],
        "user_id": user_id,
        "match_id": r["match_id"],
        "home_goals": body.home_goals,
        "away_goals": body.away_goals,
        "predicted_outcome": body.predicted_outcome,
        "is_first_submission": is_first,
    }).execute().data[0]
    return pred


@router.post("/{code}/lock")
async def lock_predictions(code: str, user_id: str = Depends(get_current_user_id)):
    db = get_supabase()
    r = _get_room(code)
    _require_host(r, user_id)
    if r["state"] != "PREDICTING":
        raise HTTPException(409, detail={"error": "invalid_state", "current": r["state"]})
    updated = db.table("rooms").update({"state": "CLOSED"}).eq("id", r["id"]).execute().data[0]
    return _room_snapshot(updated)


@router.post("/{code}/close")
async def close_room(code: str, body: CloseRoomRequest, user_id: str = Depends(get_current_user_id)):
    return await lock_predictions(code, user_id)


@router.post("/{code}/go-live")
async def go_live(code: str, user_id: str = Depends(get_current_user_id)):
    db = get_supabase()
    r = _get_room(code)
    _require_host(r, user_id)
    if r["state"] != "CLOSED":
        raise HTTPException(409, detail={"error": "invalid_state", "current": r["state"]})

    if is_simulation_room(r):
        updated = go_live_simulation(r)
        return _room_snapshot(updated)

    live = await sports_service.get_live_match(r["match_id"])
    match_data, espn_event_id, last_seen = await sports_service.bootstrap_espn_for_live_room(live)

    update: dict = {
        "state": "LIVE",
        "match_data": match_data,
        "match_source": "live_api",
        "espn_event_id": espn_event_id or r.get("espn_event_id"),
    }
    if last_seen:
        update["last_seen_event_key"] = last_seen

    updated = db.table("rooms").update(update).eq("id", r["id"]).execute().data[0]
    return _room_snapshot(updated)


@router.post("/{code}/end")
async def end_match(code: str, body: CloseRoomRequest, user_id: str = Depends(get_current_user_id)):
    db = get_supabase()
    r = _get_room(code)
    _require_host(r, user_id)
    if r["state"] not in ("LIVE", "FULL_TIME"):
        raise HTTPException(409, detail={"error": "invalid_state", "current": r["state"]})

    if is_simulation_room(r):
        sim = r.get("match_simulation_json") or r.get("match_data") or {}
        home = body.actual_home_goals if body.actual_home_goals is not None else int(sim.get("home_goals", 0))
        away = body.actual_away_goals if body.actual_away_goals is not None else int(sim.get("away_goals", 0))
    else:
        live = await sports_service.get_live_match(r["match_id"])
        home = body.actual_home_goals if body.actual_home_goals is not None else int(live.get("home_goals", 0))
        away = body.actual_away_goals if body.actual_away_goals is not None else int(live.get("away_goals", 0))

    results = await close_room_and_award(r["id"], home, away)
    if is_simulation_room(r):
        mark_simulation_ended(r["id"])
    updated = db.table("rooms").select("*").eq("id", r["id"]).execute().data[0]
    return {"room": _room_snapshot(updated), "results": results}


@router.get("/{code}/results")
async def room_results(code: str):
    r = _get_room(code)
    if r["state"] != "RESULTS":
        raise HTTPException(409, detail={"error": "not_finished", "state": r["state"]})
    snap = _room_snapshot(r)
    preds = sorted(snap.get("predictions", []), key=lambda p: -float(p.get("points_earned", 0)))
    for i, p in enumerate(preds, 1):
        p["rank"] = i
    return {
        "room": snap,
        "leaderboard": preds,
        "actual_score": {
            "home": r.get("actual_home_goals"),
            "away": r.get("actual_away_goals"),
        },
    }


# ─── Match events (unified) ─────────────────────────────────────────────────

@router.post("/{code}/inject-event")
async def inject_match_event(code: str, body: InjectEventRequest, user_id: str = Depends(get_current_user_id)):
    try:
        return inject_event(code, user_id, body.event_type)
    except PermissionError:
        raise HTTPException(403, detail={"error": "not_host"})
    except ValueError as e:
        raise HTTPException(400, detail={"error": str(e)})


@router.post("/{code}/inject-random")
async def inject_random_match_event(code: str, user_id: str = Depends(get_current_user_id)):
    try:
        result = inject_random_event(code, user_id)
        notify_manual_inject(code)
        return result
    except PermissionError:
        raise HTTPException(403, detail={"error": "not_host"})
    except ValueError as e:
        raise HTTPException(400, detail={"error": str(e)})


@router.post("/{code}/fast-forward")
async def fast_forward(code: str, user_id: str = Depends(get_current_user_id)):
    try:
        result = fast_forward_event(code, user_id)
        notify_manual_inject(code)
        return result
    except PermissionError:
        raise HTTPException(403, detail={"error": "not_host"})
    except ValueError as e:
        raise HTTPException(400, detail={"error": str(e)})


@router.post("/{code}/resolve-active")
async def resolve_active_route(code: str, body: ResolveFlashBetRequest, user_id: str = Depends(get_current_user_id)):
    try:
        return resolve_active_bet(code, user_id, body.correct_option)
    except PermissionError:
        raise HTTPException(403, detail={"error": "not_host"})
    except ValueError as e:
        raise HTTPException(409, detail={"error": str(e)})


# ─── Flash bets ─────────────────────────────────────────────────────────────

@router.get("/{code}/flash-bets")
async def get_flash_bets(code: str):
    return {"bets": list_flash_bets(code)}


@router.post("/{code}/flash-bets")
async def create_flash_bet(code: str, body: CreateFlashBetRequest, user_id: str = Depends(get_current_user_id)):
    try:
        bet = create_manual_flash_bet(code, user_id, body.question, body.options, body.wager_tier)
    except PermissionError:
        raise HTTPException(403, detail={"error": "not_host"})
    except ValueError as e:
        raise HTTPException(400, detail={"error": str(e)})
    return bet


@router.post("/{code}/flash-bets/{bet_id}/answer")
async def answer_flash_bet(
    code: str, bet_id: str, body: FlashBetAnswerRequest, user_id: str = Depends(get_current_user_id)
):
    try:
        return submit_answer(code, bet_id, user_id, body.chosen_option)
    except (PermissionError, ValueError) as e:
        raise HTTPException(400, detail={"error": str(e)})


@router.post("/{code}/flash-bets/{bet_id}/resolve")
async def resolve_flash_bet_route(
    code: str, bet_id: str, body: ResolveFlashBetRequest, user_id: str = Depends(get_current_user_id)
):
    try:
        return resolve_flash_bet(code, bet_id, user_id, body.correct_option)
    except PermissionError:
        raise HTTPException(403, detail={"error": "not_host"})
    except ValueError as e:
        raise HTTPException(400, detail={"error": str(e)})


@router.get("/{code}/flash-bets/{bet_id}/results")
async def flash_bet_results(code: str, bet_id: str):
    try:
        return get_bet_results(code, bet_id)
    except ValueError as e:
        raise HTTPException(404, detail={"error": str(e)})


# ─── Chat ───────────────────────────────────────────────────────────────────

@router.get("/{code}/messages")
async def get_messages(code: str, before: str | None = None, limit: int = 50):
    r = _get_room(code)
    return {"messages": list_messages(r["id"], before, limit)}


@router.post("/{code}/messages")
async def send_message(code: str, body: RoomMessageRequest, user_id: str = Depends(get_current_user_id)):
    r = _get_room(code)
    if not r.get("chat_enabled", True):
        raise HTTPException(403, detail={"error": "chat_disabled"})
    try:
        return post_message(r["id"], user_id, body.content)
    except ValueError as e:
        raise HTTPException(400, detail={"error": str(e)})


@router.delete("/{code}/messages/{message_id}")
async def remove_message(code: str, message_id: str, user_id: str = Depends(get_current_user_id)):
    r = _get_room(code)
    _require_host(r, user_id)
    delete_message(message_id, r["id"])
    return {"ok": True}


# ─── Host controls ──────────────────────────────────────────────────────────

@router.post("/{code}/chat-toggle")
async def toggle_chat(code: str, body: ToggleChatRequest, user_id: str = Depends(get_current_user_id)):
    db = get_supabase()
    r = _get_room(code)
    _require_host(r, user_id)
    updated = db.table("rooms").update({"chat_enabled": body.enabled}).eq("id", r["id"]).execute().data[0]
    return _room_snapshot(updated)


@router.post("/{code}/kick")
async def kick_player(code: str, body: KickPlayerRequest, user_id: str = Depends(get_current_user_id)):
    db = get_supabase()
    r = _get_room(code)
    _require_host(r, user_id)
    if body.user_id == user_id:
        raise HTTPException(400, detail={"error": "cannot_kick_self"})
    db.table("room_players").delete().eq("room_id", r["id"]).eq("user_id", body.user_id).execute()
    return _room_snapshot(r)
