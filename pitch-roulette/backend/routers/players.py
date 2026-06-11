from fastapi import APIRouter, HTTPException

from database import get_supabase
from models import FantasyPickRequest, ScorePredictionRequest, SessionTokenRequest, SwitchTeamRequest
from services.presence import heartbeat, mark_player_disconnected, mark_player_seen
from services.fantasy import submit_fantasy_picks
from services.game_engine import (
    calculate_switch_penalty,
    calculate_underdog_multiplier,
    get_player_by_token,
    get_room_by_id,
    validate_state,
)

router = APIRouter(prefix="/players", tags=["players"])


@router.post("/heartbeat")
async def player_heartbeat(body: SessionTokenRequest):
    player = await get_player_by_token(body.session_token)
    if not player:
        raise HTTPException(status_code=401, detail={"error": "unauthorized"})
    await heartbeat(player["id"])
    return {"ok": True}


@router.post("/disconnect")
async def player_disconnect(body: SessionTokenRequest):
    player = await get_player_by_token(body.session_token)
    if not player:
        raise HTTPException(status_code=401, detail={"error": "unauthorized"})
    mark_player_disconnected(player["id"])
    return {"ok": True}


@router.get("/me")
async def get_me(session_token: str):
    player = await get_player_by_token(session_token)
    if not player:
        raise HTTPException(status_code=401, detail={"error": "unauthorized"})

    db = get_supabase()
    picks = db.table("fantasy_picks").select("*").eq("player_id", player["id"]).execute().data or []
    scores = db.table("fantasy_scores").select("*").eq("player_id", player["id"]).execute().data or []

    return {**player, "fantasy_picks": picks, "fantasy_scores": scores}


@router.post("/switch-team")
async def switch_team(body: SwitchTeamRequest):
    player = await get_player_by_token(body.session_token)
    if not player:
        raise HTTPException(status_code=401, detail={"error": "unauthorized"})

    room = await get_room_by_id(player["room_id"])
    if not room:
        raise HTTPException(status_code=404, detail={"error": "room_not_found"})

    settings = room.get("settings", {})
    if not settings.get("allow_switching", True):
        raise HTTPException(status_code=403, detail={"error": "switching_disabled"})

    if player.get("switched_team"):
        raise HTTPException(status_code=409, detail={"error": "already_switched"})

    try:
        await validate_state(room, ["SCOUTING", "DRAFT_LOCKED"])
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
    players_count = db.table("players").select("id").eq("room_id", room["id"]).execute()
    lobby_size = len(players_count.data or [])
    penalty = calculate_switch_penalty(
        lobby_size,
        settings.get("custom_switch_penalty"),
    )

    if player["balance"] < penalty:
        raise HTTPException(status_code=400, detail={"error": "insufficient_balance", "required": penalty})

    new_team = "B" if player.get("assigned_team") == "A" else "A"
    db.table("players").update({
        "assigned_team": new_team,
        "balance": player["balance"] - penalty,
        "switched_team": True,
        "switch_penalty_paid": penalty,
    }).eq("id", player["id"]).execute()

    players_result = db.table("players").select("assigned_team").eq("room_id", room["id"]).execute()
    count_a = sum(1 for p in players_result.data if p.get("assigned_team") == "A")
    count_b = sum(1 for p in players_result.data if p.get("assigned_team") == "B")
    underdog_team, multiplier = calculate_underdog_multiplier(count_a, count_b)

    db.table("rooms").update({
        "underdog_team": underdog_team,
        "underdog_multiplier": multiplier,
    }).eq("id", room["id"]).execute()

    updated = db.table("players").select("*").eq("id", player["id"]).execute().data[0]
    return updated


@router.post("/fantasy/pick")
async def fantasy_pick(body: FantasyPickRequest):
    player = await get_player_by_token(body.session_token)
    if not player:
        raise HTTPException(status_code=401, detail={"error": "unauthorized"})

    room = await get_room_by_id(player["room_id"])
    if not room:
        raise HTTPException(status_code=404, detail={"error": "room_not_found"})

    settings = room.get("settings", {})
    if not settings.get("module_fantasy", True):
        raise HTTPException(status_code=403, detail={"error": "fantasy_disabled"})

    try:
        allowed = ["DRAFT_LOCKED"]
        if settings.get("test_mode"):
            allowed.append("LIVE")
        await validate_state(room, allowed)
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
    existing_picks = db.table("fantasy_picks").select("id").eq("player_id", player["id"]).execute()
    test_mode = bool(settings.get("test_mode"))
    if existing_picks.data and not test_mode:
        raise HTTPException(status_code=409, detail={"error": "picks_already_locked"})

    required = int(settings.get("fantasy_pick_count", 3))
    if str(room.get("match_id")) == "TEST_EGY_BEL" and not settings.get("fantasy_pick_count"):
        required = 11
    if len(body.picks) != required:
        raise HTTPException(status_code=400, detail={
            "error": "invalid_pick_count",
            "required": required,
            "got": len(body.picks),
        })

    picks = [p.model_dump(exclude_none=True) for p in body.picks]
    result = await submit_fantasy_picks(player["id"], room["id"], picks)
    return {"picks": result}


@router.post("/predict-score")
async def predict_score(body: ScorePredictionRequest):
    player = await get_player_by_token(body.session_token)
    if not player:
        raise HTTPException(status_code=401, detail={"error": "unauthorized"})

    room = await get_room_by_id(player["room_id"])
    if not room:
        raise HTTPException(status_code=404, detail={"error": "room_not_found"})

    try:
        await validate_state(room, ["SCOUTING", "DRAFT_LOCKED"])
    except ValueError as e:
        err = str(e)
        if err.startswith("invalid_state:"):
            parts = err.split(":")
            raise HTTPException(status_code=409, detail={
                "error": "invalid_state",
                "current": parts[1],
                "required": parts[2],
            })

    settings = dict(room.get("settings") or {})
    predictions = dict(settings.get("score_predictions") or {})
    predictions[player["id"]] = {"score_a": body.score_a, "score_b": body.score_b}
    settings["score_predictions"] = predictions

    db = get_supabase()
    db.table("rooms").update({"settings": settings}).eq("id", room["id"]).execute()
    return {"prediction": predictions[player["id"]]}
