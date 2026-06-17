"""Enriched room payload for API responses."""
from database import get_supabase
from services.match_engine import normalize_room_match_data


def room_snapshot(room: dict) -> dict:
    db = get_supabase()
    players = db.table("room_players").select(
        "*, profiles(username, display_name, avatar_color)"
    ).eq("room_id", room["id"]).execute()
    enriched = []
    for p in players.data or []:
        prof = p.pop("profiles", None) or {}
        enriched.append({**p, **prof})
    preds = db.table("predictions").select(
        "*, profiles(username, display_name, avatar_color)"
    ).eq("room_id", room["id"]).execute()
    pred_list = []
    for pr in preds.data or []:
        prof = pr.pop("profiles", None) or {}
        pred_list.append({**pr, **prof})
    snap = normalize_room_match_data({**room, "players": enriched, "predictions": pred_list})
    if not snap.get("match_source"):
        from services.match_engine import infer_match_source
        snap["match_source"] = infer_match_source(room)
    return snap
