from fastapi import APIRouter, Depends, HTTPException

from auth import get_current_user_id
from models import PurchaseSabotageRequest
from services.feature_flags import require_flag
from services.sabotages import get_shop, list_sabotages, purchase_sabotage, silence_seconds_remaining

router = APIRouter(prefix="/api/rooms", tags=["sabotages"])


@router.get("/{code}/sabotages/shop")
async def sabotage_shop(code: str, user_id: str = Depends(get_current_user_id)):
    require_flag("sabotage_shop")
    try:
        return get_shop(code, user_id)
    except ValueError as e:
        raise HTTPException(404, detail={"error": str(e)})


@router.get("/{code}/sabotages")
async def get_sabotages(code: str, user_id: str = Depends(get_current_user_id)):
    require_flag("sabotage_shop")
    try:
        return list_sabotages(code, user_id)
    except ValueError as e:
        raise HTTPException(404, detail={"error": str(e)})


@router.post("/{code}/sabotages")
async def buy_sabotage(
    code: str,
    body: PurchaseSabotageRequest,
    user_id: str = Depends(get_current_user_id),
):
    require_flag("sabotage_shop")
    try:
        return purchase_sabotage(code, user_id, body.sabotage_type, body.target_user_id)
    except ValueError as e:
        err = str(e)
        status = 400
        if err == "insufficient_pc":
            status = 402
        elif err == "room_not_live":
            status = 409
        raise HTTPException(status, detail={"error": err})
