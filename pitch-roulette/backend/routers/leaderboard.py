from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query

from auth import get_current_user_id, get_optional_user_id
from database import get_supabase

router = APIRouter(prefix="/api/leaderboard", tags=["leaderboard"])


def _win_rate(p: dict) -> float:
    total = int(p.get("total_predictions", 0))
    if not total:
        return 0.0
    return round(int(p.get("correct_outcomes", 0)) / total * 100, 1)


@router.get("/global")
async def global_leaderboard(
    period: str = Query("alltime", pattern="^(alltime|month|week)$"),
    page: int = Query(1, ge=1),
    user_id: str | None = Depends(get_optional_user_id),
):
    db = get_supabase()
    page_size = 20
    offset = (page - 1) * page_size

    query = db.table("profiles").select("*").order("total_points", desc=True)
    if period == "month":
        since = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()
        recent = db.table("predictions").select("user_id, points_earned").gte(
            "submitted_at", since
        ).execute()
        totals: dict[str, float] = {}
        for r in recent.data or []:
            totals[r["user_id"]] = totals.get(r["user_id"], 0) + float(r["points_earned"])
        sorted_users = sorted(totals.items(), key=lambda x: -x[1])
        entries = []
        for i, (uid, pts) in enumerate(sorted_users[offset:offset + page_size], offset + 1):
            p = db.table("profiles").select("*").eq("id", uid).execute().data[0]
            entries.append({
                "rank": i,
                "user_id": uid,
                "username": p["username"],
                "display_name": p["display_name"],
                "avatar_color": p["avatar_color"],
                "total_points": pts,
                "total_predictions": p["total_predictions"],
                "exact_scores": p["exact_scores"],
                "correct_outcomes": p["correct_outcomes"],
                "win_rate": _win_rate(p),
                "is_me": uid == user_id,
            })
        my_rank = None
        if user_id:
            for j, (uid, _) in enumerate(sorted_users, 1):
                if uid == user_id:
                    my_rank = j
                    break
        return {"period": period, "entries": entries, "page": page, "my_rank": my_rank}

    result = query.range(offset, offset + page_size - 1).execute()
    entries = []
    for i, p in enumerate(result.data or [], offset + 1):
        entries.append({
            "rank": i,
            "user_id": p["id"],
            "username": p["username"],
            "display_name": p["display_name"],
            "avatar_color": p["avatar_color"],
            "total_points": float(p["total_points"]),
            "total_predictions": p["total_predictions"],
            "exact_scores": p["exact_scores"],
            "correct_outcomes": p["correct_outcomes"],
            "win_rate": _win_rate(p),
            "is_me": p["id"] == user_id,
        })

    my_rank = None
    if user_id:
        above = db.table("profiles").select("id", count="exact").gt(
            "total_points", db.table("profiles").select("total_points").eq("id", user_id).execute().data[0]["total_points"]
        ).execute().count
        my_rank = (above or 0) + 1

    return {"period": period, "entries": entries, "page": page, "my_rank": my_rank}


@router.get("/group/{group_id}")
async def group_leaderboard(group_id: str, user_id: str = Depends(get_current_user_id)):
    from routers.groups import group_detail
    data = await group_detail(group_id, user_id)
    return {"leaderboard": data["leaderboard"]}
