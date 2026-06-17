"""Backward-compatible /api/demo/* routes — delegate to unified rooms + match engine."""
from fastapi import APIRouter, Depends, HTTPException

from auth import get_current_user_id
from models import InjectEventRequest, ResolveActiveBetRequest, StartDemoCompatRequest
from services.bots import bot_config_to_json
from services.event_pipeline import notify_manual_inject
from services.match_engine import (
    create_simulation_room,
    end_simulation_room,
    fast_forward_event,
    inject_event,
    inject_random_event,
    resolve_active_bet,
    room_status,
)
from services.bots import answer_open_flash_bet
from config import get_settings
from database import get_supabase

router = APIRouter(prefix="/api/demo", tags=["demo-compat"])


def _get_room(code: str) -> dict:
    db = get_supabase()
    row = db.table("rooms").select("*").eq("room_code", code.upper()).execute()
    if not row.data:
        raise ValueError("room_not_found")
    return row.data[0]


@router.get("/enabled")
async def demo_enabled():
    return {"enabled": get_settings().DEMO_MODE}


@router.post("/start")
async def start_demo(body: StartDemoCompatRequest, user_id: str = Depends(get_current_user_id)):
    try:
        bot_json = bot_config_to_json(True, 3, "medium")
        room = await create_simulation_room(
            user_id,
            "demo_simulation",
            bot_json,
            phase=body.phase,
        )
    except ValueError as e:
        raise HTTPException(400, detail={"error": str(e)})
    return {"room": room, "code": room["room_code"]}


@router.get("/rooms/{code}")
async def get_demo_status(code: str, user_id: str = Depends(get_current_user_id)):
    try:
        return room_status(code)
    except ValueError as e:
        raise HTTPException(404, detail={"error": str(e)})


@router.post("/rooms/{code}/advance")
async def advance_phase(code: str, user_id: str = Depends(get_current_user_id)):
    """Legacy shortcut — prefer /api/rooms/{code}/start|lock|go-live."""
    from services.match_engine import _room_by_code, go_live_simulation
    from services.bots import on_predictions_opened
    from services.room_snapshot import room_snapshot

    try:
        room = _room_by_code(code)
    except ValueError:
        raise HTTPException(404, detail={"error": "room_not_found"})
    if room["host_id"] != user_id:
        raise HTTPException(403, detail={"error": "not_host"})

    db = get_supabase()
    next_state = {"LOBBY": "PREDICTING", "PREDICTING": "CLOSED", "CLOSED": "LIVE"}.get(room["state"])
    if not next_state:
        raise HTTPException(409, detail={"error": "cannot_advance"})

    if next_state == "PREDICTING" and room["state"] == "LOBBY":
        on_predictions_opened(room["id"], room, user_id)
    if next_state == "LIVE":
        updated = go_live_simulation(room)
        return {"room": room_snapshot(updated)}

    updated = db.table("rooms").update({"state": next_state}).eq("id", room["id"]).execute().data[0]
    return {"room": room_snapshot(updated)}


@router.post("/rooms/{code}/fast-forward")
async def fast_forward(code: str, user_id: str = Depends(get_current_user_id)):
    try:
        result = fast_forward_event(code, user_id)
        notify_manual_inject(code)
        return result
    except PermissionError:
        raise HTTPException(403, detail={"error": "not_host"})
    except ValueError as e:
        raise HTTPException(400, detail={"error": str(e)})


@router.post("/rooms/{code}/inject-random")
async def inject_random(code: str, user_id: str = Depends(get_current_user_id)):
    try:
        result = inject_random_event(code, user_id)
        notify_manual_inject(code)
        return result
    except PermissionError:
        raise HTTPException(403, detail={"error": "not_host"})
    except ValueError as e:
        raise HTTPException(400, detail={"error": str(e)})


@router.post("/rooms/{code}/inject-event")
async def inject_event_route(code: str, body: InjectEventRequest, user_id: str = Depends(get_current_user_id)):
    try:
        return inject_event(code, user_id, body.event_type)
    except PermissionError:
        raise HTTPException(403, detail={"error": "not_host"})
    except ValueError as e:
        raise HTTPException(400, detail={"error": str(e)})


@router.post("/rooms/{code}/bot-answers")
async def bot_answers(code: str, user_id: str = Depends(get_current_user_id)):
    try:
        room = _get_room(code)
        if room["host_id"] != user_id:
            raise PermissionError("not_host")
        from services.flash_bets import list_flash_bets
        bets = list_flash_bets(code)
        open_bet = next((b for b in bets if b["state"] == "OPEN"), None)
        if not open_bet:
            raise ValueError("no_open_bet")
        answers = answer_open_flash_bet(room, open_bet, user_id)
        return {"answers": answers, "bet_id": open_bet["id"]}
    except PermissionError:
        raise HTTPException(403, detail={"error": "not_host"})
    except ValueError as e:
        raise HTTPException(409, detail={"error": str(e)})


@router.post("/rooms/{code}/resolve-active")
async def resolve_active(code: str, body: ResolveActiveBetRequest, user_id: str = Depends(get_current_user_id)):
    try:
        return resolve_active_bet(code, user_id, body.correct_option)
    except PermissionError:
        raise HTTPException(403, detail={"error": "not_host"})
    except ValueError as e:
        raise HTTPException(409, detail={"error": str(e)})


@router.post("/rooms/{code}/end")
async def end_demo(code: str, user_id: str = Depends(get_current_user_id)):
    try:
        return await end_simulation_room(code, user_id)
    except PermissionError:
        raise HTTPException(403, detail={"error": "not_host"})
    except ValueError as e:
        raise HTTPException(404, detail={"error": str(e)})
