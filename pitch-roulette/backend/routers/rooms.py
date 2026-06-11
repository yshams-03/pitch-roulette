from fastapi import APIRouter, HTTPException, Request
from slowapi import Limiter
from slowapi.util import get_remote_address
from datetime import datetime, timezone

from database import get_supabase
from models import (
    AdvanceStateRequest,
    CreateRoomRequest,
    JoinRoomRequest,
    KickPlayerRequest,
    ManualFlashBetRequest,
    StartDraftRequest,
    UpdateSettingsRequest,
)
from services.game_engine import (
    advance_room_state,
    allocate_teams,
    create_flash_bet,
    generate_room_code,
    generate_session_token,
    get_player_by_token,
    get_room_by_code,
    get_room_by_id,
    validate_host,
    validate_state,
)
from services.presence import effective_is_connected, mark_player_seen

router = APIRouter(prefix="/rooms", tags=["rooms"])
limiter = Limiter(key_func=get_remote_address)


def _rate_limit(rule: str):
    """Apply slowapi limit unless RATE_LIMIT_ENABLED=false (local dev / E2E)."""
    import os

    def decorator(func):
        if os.getenv("RATE_LIMIT_ENABLED", "true").lower() == "false":
            return func
        return limiter.limit(rule)(func)
    return decorator


def _build_room_snapshot(room: dict) -> dict:
    db = get_supabase()
    players = db.table("players").select("*").eq("room_id", room["id"]).execute().data or []
    enriched = []
    for p in players:
        enriched.append({
            **p,
            "is_connected": effective_is_connected(p["id"], p.get("is_connected", True)),
        })
    return {**room, "players": enriched}


@router.post("/create")
@_rate_limit("10/hour")
async def create_room(request: Request, body: CreateRoomRequest):
    db = get_supabase()
    code = generate_room_code()
    for _ in range(10):
        existing = db.table("rooms").select("id").eq("code", code).execute()
        if not existing.data:
            break
        code = generate_room_code()

    room_data = {
        "code": code,
        "state": "LOBBY",
        "match_id": body.match_id,
        "match_name": body.match_name,
        "team_a_name": body.team_a_name,
        "team_b_name": body.team_b_name,
    }
    room_result = db.table("rooms").insert(room_data).execute()
    room = room_result.data[0]

    token = generate_session_token()
    player_result = db.table("players").insert({
        "room_id": room["id"],
        "nickname": body.nickname,
        "is_host": True,
        "session_token": token,
    }).execute()
    player = player_result.data[0]
    mark_player_seen(player["id"])

    db.table("rooms").update({"host_player_id": player["id"]}).eq("id", room["id"]).execute()

    return {"room_id": room["id"], "code": code, "host_token": token, "player_id": player["id"]}


@router.post("/join")
@_rate_limit("30/hour")
async def join_room(request: Request, body: JoinRoomRequest):
    db = get_supabase()
    room = await get_room_by_code(body.code)
    if not room:
        raise HTTPException(status_code=404, detail={"error": "room_not_found"})

    if room["state"] != "LOBBY":
        raise HTTPException(status_code=409, detail={
            "error": "invalid_state",
            "current": room["state"],
            "required": "LOBBY",
        })

    token = generate_session_token()
    player_result = db.table("players").insert({
        "room_id": room["id"],
        "nickname": body.nickname,
        "session_token": token,
    }).execute()
    player = player_result.data[0]
    mark_player_seen(player["id"])

    return {
        "player_id": player["id"],
        "session_token": token,
        "room_state": room["state"],
        "code": room["code"],
    }


@router.get("/{code}")
async def get_room(code: str):
    db = get_supabase()
    result = db.table("rooms").select("*").eq("code", code.upper()).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail={"error": "room_not_found"})

    room = result.data[0]
    expires = room.get("expires_at")
    if expires:
        exp_dt = datetime.fromisoformat(expires.replace("Z", "+00:00"))
        if exp_dt < datetime.now(timezone.utc):
            raise HTTPException(status_code=404, detail={"error": "room_expired"})

    return _build_room_snapshot(room)


@router.patch("/{code}/settings")
async def update_settings(code: str, body: UpdateSettingsRequest):
    room = await get_room_by_code(code)
    if not room:
        raise HTTPException(status_code=404, detail={"error": "room_not_found"})

    room = await get_room_by_id(room["id"])
    if not room:
        raise HTTPException(status_code=404, detail={"error": "room_not_found"})

    try:
        await validate_host(body.session_token, room["id"])
    except ValueError as e:
        if str(e) == "unauthorized":
            raise HTTPException(status_code=401, detail={"error": "unauthorized"})
        raise HTTPException(status_code=403, detail={"error": "not_host"})

    db = get_supabase()
    result = db.table("rooms").update({
        "settings": body.settings.model_dump(),
    }).eq("id", room["id"]).execute()
    return result.data[0]


@router.post("/{code}/start-draft")
async def start_draft(code: str, body: StartDraftRequest):
    room = await get_room_by_code(code)
    if not room:
        raise HTTPException(status_code=404, detail={"error": "room_not_found"})

    try:
        await validate_host(body.session_token, room["id"])
        await validate_state(room, ["LOBBY", "SCOUTING"])
    except ValueError as e:
        err = str(e)
        if err == "unauthorized":
            raise HTTPException(status_code=401, detail={"error": "unauthorized"})
        if err == "not_host":
            raise HTTPException(status_code=403, detail={"error": "not_host"})
        if err.startswith("invalid_state:"):
            parts = err.split(":")
            raise HTTPException(status_code=409, detail={
                "error": "invalid_state",
                "current": parts[1],
                "required": parts[2],
            })

    await allocate_teams(room["id"])
    updated = await advance_room_state(room["id"], "SCOUTING")
    return _build_room_snapshot(updated)


@router.post("/{code}/advance-state")
async def advance_state(code: str, body: AdvanceStateRequest):
    room = await get_room_by_code(code)
    if not room:
        raise HTTPException(status_code=404, detail={"error": "room_not_found"})

    room = await get_room_by_id(room["id"]) or room

    try:
        await validate_host(body.session_token, room["id"])
    except ValueError as e:
        if str(e) == "unauthorized":
            raise HTTPException(status_code=401, detail={"error": "unauthorized"})
        raise HTTPException(status_code=403, detail={"error": "not_host"})

    from config import get_settings
    transitions = get_settings().VALID_TRANSITIONS
    current = room["state"]
    allowed = transitions.get(current, [])
    target = body.target_state or (allowed[0] if allowed else None)

    if not target:
        raise HTTPException(status_code=409, detail={
            "error": "invalid_state",
            "current": current,
            "required": "none",
        })

    try:
        updated = await advance_room_state(room["id"], target)
    except ValueError as e:
        err = str(e)
        if err.startswith("invalid_transition:"):
            parts = err.split(":")
            raise HTTPException(status_code=409, detail={
                "error": "invalid_state",
                "current": parts[1],
                "required": parts[2],
            })
        raise HTTPException(status_code=400, detail={"error": err})

    return _build_room_snapshot(updated)


@router.post("/{code}/manual-flash-bet")
async def manual_flash_bet(code: str, body: ManualFlashBetRequest):
    room = await get_room_by_code(code)
    if not room:
        raise HTTPException(status_code=404, detail={"error": "room_not_found"})

    try:
        await validate_host(body.session_token, room["id"])
    except ValueError as e:
        if str(e) == "unauthorized":
            raise HTTPException(status_code=401, detail={"error": "unauthorized"})
        raise HTTPException(status_code=403, detail={"error": "not_host"})

    bet = await create_flash_bet(room["id"], body.bet_type, body.options, body.event_label)
    if not bet:
        raise HTTPException(status_code=400, detail={"error": "flash_bet_not_created"})
    return bet


@router.post("/{code}/kick")
async def kick_player(code: str, body: KickPlayerRequest):
    room = await get_room_by_code(code)
    if not room:
        raise HTTPException(status_code=404, detail={"error": "room_not_found"})

    try:
        await validate_host(body.session_token, room["id"])
    except ValueError as e:
        if str(e) == "unauthorized":
            raise HTTPException(status_code=401, detail={"error": "unauthorized"})
        raise HTTPException(status_code=403, detail={"error": "not_host"})

    db = get_supabase()
    target = db.table("players").select("*").eq("id", body.player_id).execute()
    if not target.data or target.data[0]["room_id"] != room["id"]:
        raise HTTPException(status_code=404, detail={"error": "player_not_found"})
    if target.data[0].get("is_host"):
        raise HTTPException(status_code=400, detail={"error": "cannot_kick_host"})

    db.table("players").delete().eq("id", body.player_id).execute()
    return {"ok": True}


@router.post("/{code}/rematch")
async def rematch(code: str, body: StartDraftRequest):
    room = await get_room_by_code(code)
    if not room:
        raise HTTPException(status_code=404, detail={"error": "room_not_found"})

    try:
        await validate_host(body.session_token, room["id"])
    except ValueError as e:
        if str(e) == "unauthorized":
            raise HTTPException(status_code=401, detail={"error": "unauthorized"})
        raise HTTPException(status_code=403, detail={"error": "not_host"})

    db = get_supabase()
    new_code = generate_room_code()
    new_room = db.table("rooms").insert({
        "code": new_code,
        "state": "LOBBY",
        "match_id": room.get("match_id"),
        "match_name": room.get("match_name"),
        "team_a_name": room.get("team_a_name"),
        "team_b_name": room.get("team_b_name"),
        "settings": room.get("settings"),
    }).execute().data[0]

    host = await get_player_by_token(body.session_token)
    token = generate_session_token()
    db.table("players").insert({
        "room_id": new_room["id"],
        "nickname": host["nickname"],
        "is_host": True,
        "session_token": token,
    }).execute()

    player = db.table("players").select("*").eq("session_token", token).execute().data[0]
    db.table("rooms").update({"host_player_id": player["id"]}).eq("id", new_room["id"]).execute()

    return {"code": new_code, "host_token": token, "room_id": new_room["id"]}
