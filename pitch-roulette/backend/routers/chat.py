from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException

from database import get_supabase
from models import ChatMessageRequest, SessionTokenRequest
from services.game_engine import get_player_by_token

router = APIRouter(prefix="/chat", tags=["chat"])


@router.post("/send")
async def send_message(body: ChatMessageRequest):
    player = await get_player_by_token(body.session_token)
    if not player:
        raise HTTPException(status_code=401, detail={"error": "unauthorized"})

    db = get_supabase()
    now = datetime.now(timezone.utc).isoformat()
    sabotages = db.table("sabotages").select("*").eq("target_id", player["id"]).eq(
        "token_type", "CHAT_SILENCER"
    ).eq("active", True).gte("expires_at", now).execute()

    if sabotages.data:
        raise HTTPException(status_code=403, detail={"error": "silenced"})

    result = db.table("chat_messages").insert({
        "room_id": player["room_id"],
        "player_id": player["id"],
        "nickname": player["nickname"],
        "content": body.content,
        "is_system": False,
    }).execute()

    return result.data[0]


@router.get("/{room_id}/messages")
async def get_messages(room_id: str, limit: int = 50):
    db = get_supabase()
    result = db.table("chat_messages").select("*").eq(
        "room_id", room_id
    ).order("created_at", desc=True).limit(limit).execute()

    messages = list(reversed(result.data or []))
    return {"messages": messages}
