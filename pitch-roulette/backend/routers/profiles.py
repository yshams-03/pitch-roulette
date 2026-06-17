from fastapi import APIRouter, Depends, HTTPException

from auth import get_current_user_id
from database import get_supabase
from models import UpdateProfileRequest

router = APIRouter(prefix="/api/profile", tags=["profiles"])


def _enrich_profile(profile: dict, user_id: str | None = None) -> dict:
    db = get_supabase()
    total = db.table("profiles").select("id", count="exact").execute().count or 0
    above = db.table("profiles").select("id", count="exact").gt(
        "total_points", profile.get("total_points", 0)
    ).execute().count or 0
    rank = above + 1
    percentile = round((1 - (rank / max(total, 1))) * 100) if total else 0
    profile["global_rank"] = rank
    profile["global_rank_percentile"] = max(0, min(100, percentile))
    if user_id and profile["id"] == user_id:
        preds = db.table("predictions").select(
            "*, rooms(match_data, actual_home_goals, actual_away_goals, state)"
        ).eq("user_id", user_id).order("submitted_at", desc=True).limit(10).execute()
        profile["recent_predictions"] = preds.data or []
    return profile


@router.get("/me")
async def my_profile(user_id: str = Depends(get_current_user_id)):
    db = get_supabase()
    result = db.table("profiles").select("*").eq("id", user_id).execute()
    if not result.data:
        raise HTTPException(404, detail={"error": "profile_not_found"})
    return _enrich_profile(result.data[0], user_id)


@router.get("/{username}")
async def public_profile(username: str):
    db = get_supabase()
    result = db.table("profiles").select(
        "id, username, display_name, avatar_color, total_points, total_predictions, "
        "correct_outcomes, exact_scores, current_streak, best_streak, rooms_created, created_at"
    ).eq("username", username.lower()).execute()
    if not result.data:
        raise HTTPException(404, detail={"error": "profile_not_found"})
    p = result.data[0]
    p["win_rate"] = round(
        (p["correct_outcomes"] / p["total_predictions"] * 100) if p["total_predictions"] else 0, 1
    )
    return p


@router.put("/me")
async def update_profile(body: UpdateProfileRequest, user_id: str = Depends(get_current_user_id)):
    db = get_supabase()
    result = db.table("profiles").update({
        "display_name": body.display_name.strip(),
    }).eq("id", user_id).execute()
    return result.data[0]
