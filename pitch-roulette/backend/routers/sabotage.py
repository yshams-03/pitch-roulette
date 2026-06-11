from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, HTTPException

from config import get_settings
from database import get_supabase
from models import SabotageDeployRequest, SessionTokenRequest
from services.game_engine import get_player_by_token, get_room_by_id, send_system_message, validate_state

router = APIRouter(prefix="/sabotage", tags=["sabotage"])


@router.post("/deploy")
async def deploy_sabotage(body: SabotageDeployRequest):
    player = await get_player_by_token(body.session_token)
    if not player:
        raise HTTPException(status_code=401, detail={"error": "unauthorized"})

    room = await get_room_by_id(player["room_id"])
    if not room:
        raise HTTPException(status_code=404, detail={"error": "room_not_found"})

    settings = room.get("settings", {})
    if not settings.get("module_sabotage", True):
        raise HTTPException(status_code=403, detail={"error": "sabotage_disabled"})

    try:
        await validate_state(room, ["LIVE", "SCOUTING", "DRAFT_LOCKED"])
    except ValueError as e:
        err = str(e)
        if err.startswith("invalid_state:"):
            parts = err.split(":")
            raise HTTPException(status_code=409, detail={
                "error": "invalid_state",
                "current": parts[1],
                "required": parts[2],
            })

    if body.target_id == player["id"]:
        raise HTTPException(status_code=400, detail={"error": "cannot_target_self"})

    db = get_supabase()
    target = db.table("players").select("*").eq("id", body.target_id).execute()
    if not target.data or target.data[0]["room_id"] != room["id"]:
        raise HTTPException(status_code=404, detail={"error": "target_not_found"})

    if target.data[0].get("assigned_team") == player.get("assigned_team"):
        raise HTTPException(status_code=400, detail={"error": "cannot_target_teammate"})

    cfg = get_settings()
    cost = cfg.SABOTAGE_COSTS.get(body.token_type, 100)
    if player["balance"] < cost:
        raise HTTPException(status_code=400, detail={"error": "insufficient_balance", "required": cost})

    duration = cfg.SABOTAGE_DURATIONS.get(body.token_type, 300)
    expires_at = datetime.now(timezone.utc) + timedelta(seconds=duration)

    from services.player_balance import deduct_balance
    new_balance = deduct_balance(player["id"], cost)
    if new_balance is None:
        raise HTTPException(status_code=400, detail={"error": "insufficient_balance", "required": cost})

    result = db.table("sabotages").insert({
        "room_id": room["id"],
        "sender_id": player["id"],
        "target_id": body.target_id,
        "token_type": body.token_type,
        "cost": cost,
        "expires_at": expires_at.isoformat(),
    }).execute()

    await send_system_message(
        room["id"],
        f"{player['nickname']} deployed {body.token_type} on {target.data[0]['nickname']}!",
    )

    return result.data[0]


@router.get("/{room_id}/active")
async def get_active_sabotages(room_id: str, session_token: str):
    player = await get_player_by_token(session_token)
    if not player:
        raise HTTPException(status_code=401, detail={"error": "unauthorized"})

    db = get_supabase()
    now = datetime.now(timezone.utc).isoformat()
    result = db.table("sabotages").select("*").eq("room_id", room_id).eq(
        "target_id", player["id"]
    ).eq("active", True).gte("expires_at", now).execute()

    enriched = []
    for s in result.data or []:
        sender = db.table("players").select("nickname").eq("id", s["sender_id"]).execute()
        enriched.append({
            **s,
            "sender_nickname": sender.data[0]["nickname"] if sender.data else "Unknown",
        })

    return {"sabotages": enriched}
