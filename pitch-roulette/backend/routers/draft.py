from fastapi import APIRouter, Depends, HTTPException

from auth import get_current_user_id
from models import DraftPickRequest
from services.draft import get_squads, list_picks, pick_player, start_draft_room
from services.room_snapshot import room_snapshot as _room_snapshot
from database import get_supabase

router = APIRouter(prefix="/api/rooms", tags=["draft"])


def _get_room(code: str) -> dict:
    db = get_supabase()
    result = db.table("rooms").select("*").eq("room_code", code.upper()).execute()
    if not result.data:
        raise HTTPException(404, detail={"error": "room_not_found"})
    return result.data[0]


@router.get("/{code}/draft/squads")
async def draft_squads(code: str):
    try:
        return await get_squads(code)
    except ValueError as e:
        raise HTTPException(404, detail={"error": str(e)})


@router.get("/{code}/draft/picks")
async def draft_picks(code: str):
    room = _get_room(code)
    picks = list_picks(room["id"])
    grouped: dict[str, dict] = {}
    for p in picks:
        uid = p["user_id"]
        if uid not in grouped:
            grouped[uid] = {
                "user_id": uid,
                "nickname": p.get("display_name") or p.get("username"),
                "picks": [],
            }
        grouped[uid]["picks"].append(p)
    return {"picks_by_user": list(grouped.values()), "all": picks}


@router.post("/{code}/draft/pick")
async def draft_pick(code: str, body: DraftPickRequest, user_id: str = Depends(get_current_user_id)):
    try:
        return pick_player(code, user_id, body.player_id)
    except ValueError as e:
        err = str(e)
        status = 409 if err == "player_already_taken" else 400
        raise HTTPException(status, detail={"error": err})


@router.post("/{code}/start-draft")
async def start_draft(code: str, user_id: str = Depends(get_current_user_id)):
    try:
        updated = start_draft_room(code, user_id)
        return _room_snapshot(updated)
    except PermissionError:
        raise HTTPException(403, detail={"error": "not_host"})
    except ValueError as e:
        raise HTTPException(409, detail={"error": str(e)})
