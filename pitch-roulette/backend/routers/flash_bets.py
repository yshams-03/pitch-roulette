from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException

from database import get_supabase
from models import ResolveFlashBetRequest, WagerRequest
from services.bet_resolver import resolve_flash_bet
from services.game_engine import get_player_by_token, get_room_by_id, send_system_message, validate_state
from services.player_balance import deduct_balance

router = APIRouter(prefix="/flash-bets", tags=["flash_bets"])


@router.get("/{room_id}/active")
async def get_active_bet(room_id: str):
    db = get_supabase()
    result = db.table("flash_bets").select("*").eq("room_id", room_id).in_(
        "state", ["FROZEN", "OPEN"]
    ).order("created_at", desc=True).limit(1).execute()

    if not result.data:
        closed = db.table("flash_bets").select("*").eq("room_id", room_id).eq(
            "state", "CLOSED"
        ).order("created_at", desc=True).limit(1).execute()
        if closed.data:
            return {"bet": closed.data[0]}
        return {"bet": None}
    return {"bet": result.data[0]}


@router.post("/wager")
async def place_wager(body: WagerRequest):
    player = await get_player_by_token(body.session_token)
    if not player:
        raise HTTPException(status_code=401, detail={"error": "unauthorized"})

    room = await get_room_by_id(player["room_id"])
    if not room:
        raise HTTPException(status_code=404, detail={"error": "room_not_found"})

    try:
        await validate_state(room, ["LIVE"])
    except ValueError as e:
        err = str(e)
        if err.startswith("invalid_state:"):
            parts = err.split(":")
            raise HTTPException(status_code=409, detail={
                "error": "invalid_state",
                "current": parts[1],
                "required": parts[2],
            })

    db = get_supabase()
    bet_result = db.table("flash_bets").select("*").eq("id", body.flash_bet_id).execute()
    if not bet_result.data:
        raise HTTPException(status_code=404, detail={"error": "bet_not_found"})

    bet = bet_result.data[0]
    if bet["state"] != "OPEN":
        raise HTTPException(status_code=409, detail={"error": "bet_not_open", "state": bet["state"]})

    now = datetime.now(timezone.utc)
    closes_at = datetime.fromisoformat(bet["closes_at"].replace("Z", "+00:00"))
    if now >= closes_at:
        raise HTTPException(status_code=409, detail={"error": "bet_closed"})

    existing = db.table("wagers").select("id").eq("flash_bet_id", body.flash_bet_id).eq(
        "player_id", player["id"]
    ).execute()
    if existing.data:
        raise HTTPException(status_code=409, detail={"error": "already_wagered"})

    amount = max(10, min(500, round(body.amount / 50) * 50))
    if amount > player["balance"]:
        raise HTTPException(status_code=400, detail={"error": "insufficient_balance"})

    new_balance = deduct_balance(player["id"], amount)
    if new_balance is None:
        raise HTTPException(status_code=400, detail={"error": "insufficient_balance"})

    wager_result = db.table("wagers").insert({
        "flash_bet_id": body.flash_bet_id,
        "player_id": player["id"],
        "room_id": room["id"],
        "chosen_option": body.chosen_option,
        "amount": amount,
    }).execute()

    await send_system_message(room["id"], f"💰 {player['nickname']} just locked in a wager.")

    options = bet.get("options", {})
    option_label = options.get(body.chosen_option, {}).get("label", body.chosen_option)

    return {
        **wager_result.data[0],
        "option_label": option_label,
        "new_balance": new_balance,
    }


@router.post("/resolve")
async def resolve_bet(body: ResolveFlashBetRequest):
    try:
        result = await resolve_flash_bet(body.flash_bet_id, body.winning_option)
    except ValueError as e:
        err = str(e)
        if err == "bet_not_found":
            raise HTTPException(status_code=404, detail={"error": "bet_not_found"})
        if err == "already_resolved":
            raise HTTPException(status_code=409, detail={"error": "already_resolved"})
        raise HTTPException(status_code=400, detail={"error": err})
    return result
