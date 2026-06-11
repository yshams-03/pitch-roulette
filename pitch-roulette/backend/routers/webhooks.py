from fastapi import APIRouter, HTTPException

from database import get_supabase
from models import SportsEventWebhook
from services.game_engine import handle_event

router = APIRouter(prefix="/webhooks", tags=["webhooks"])


EVENT_TYPE_MAP = {
    "goal": "Goal",
    "card": "Card",
    "subst": "subst",
    "substitution": "subst",
    "penalty_awarded": "Penalty",
    "var_review": "Var",
    "match_start": "match_start",
    "match_end": "match_end",
}


@router.post("/sports-event")
async def sports_event_webhook(body: SportsEventWebhook):
    db = get_supabase()
    rooms = db.table("rooms").select("*").eq("match_id", str(body.fixture_id)).eq(
        "state", "LIVE"
    ).execute()

    if not rooms.data:
        return {"processed": False, "reason": "no_active_rooms"}

    event_type = EVENT_TYPE_MAP.get(body.event_type.lower(), body.event_type)
    event = {**body.event, "type": event_type}

    for room in rooms.data:
        if event_type == "match_end":
            from services.game_engine import advance_room_state
            try:
                await advance_room_state(room["id"], "FULL_TIME")
            except ValueError:
                pass
        else:
            await handle_event(room["id"], event)

    return {"processed": True, "rooms_affected": len(rooms.data)}
