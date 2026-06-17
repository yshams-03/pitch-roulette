from fastapi import APIRouter, Depends, HTTPException

from auth import get_current_user_id
from database import get_supabase
from models import CreateGroupRequest, JoinGroupRequest
from services.codes import unique_group_invite_code

router = APIRouter(prefix="/api/groups", tags=["groups"])


@router.post("")
async def create_group(body: CreateGroupRequest, user_id: str = Depends(get_current_user_id)):
    db = get_supabase()
    code = unique_group_invite_code()
    group = db.table("friend_groups").insert({
        "name": body.name.strip(),
        "emoji": body.emoji,
        "invite_code": code,
        "created_by": user_id,
    }).execute().data[0]
    db.table("group_members").insert({
        "group_id": group["id"],
        "user_id": user_id,
    }).execute()
    return group


@router.get("/me")
async def my_groups(user_id: str = Depends(get_current_user_id)):
    db = get_supabase()
    memberships = db.table("group_members").select(
        "group_id, group_points, friend_groups(*)"
    ).eq("user_id", user_id).execute()
    groups = []
    for m in memberships.data or []:
        g = m.get("friend_groups", {})
        g["my_group_points"] = m.get("group_points", 0)
        count = db.table("group_members").select("id", count="exact").eq(
            "group_id", g["id"]
        ).execute().count
        g["member_count"] = count
        groups.append(g)
    return {"groups": groups}


@router.get("/{group_id}")
async def group_detail(group_id: str, user_id: str = Depends(get_current_user_id)):
    db = get_supabase()
    member = db.table("group_members").select("id").eq("group_id", group_id).eq(
        "user_id", user_id
    ).execute()
    if not member.data:
        raise HTTPException(403, detail={"error": "not_a_member"})

    group = db.table("friend_groups").select("*").eq("id", group_id).execute()
    if not group.data:
        raise HTTPException(404, detail={"error": "group_not_found"})

    members = db.table("group_members").select(
        "group_points, profiles(id, username, display_name, avatar_color, total_predictions, exact_scores, correct_outcomes)"
    ).eq("group_id", group_id).execute()

    leaderboard = []
    for i, m in enumerate(sorted(members.data or [], key=lambda x: -float(x.get("group_points", 0))), 1):
        p = m.get("profiles") or {}
        total_pred = int(p.get("total_predictions", 0))
        leaderboard.append({
            "rank": i,
            "user_id": p.get("id"),
            "username": p.get("username"),
            "display_name": p.get("display_name"),
            "avatar_color": p.get("avatar_color"),
            "group_points": float(m.get("group_points", 0)),
            "total_predictions": total_pred,
            "exact_scores": int(p.get("exact_scores", 0)),
            "win_rate": round((p.get("correct_outcomes", 0) / total_pred * 100) if total_pred else 0, 1),
        })

    rooms = db.table("rooms").select("*").eq("group_id", group_id).order(
        "created_at", desc=True
    ).limit(20).execute()

    return {
        "group": group.data[0],
        "leaderboard": leaderboard,
        "match_history": rooms.data or [],
    }


@router.post("/join")
async def join_group(body: JoinGroupRequest, user_id: str = Depends(get_current_user_id)):
    db = get_supabase()
    code = body.invite_code.strip().upper()
    group = db.table("friend_groups").select("*").eq("invite_code", code).execute()
    if not group.data:
        raise HTTPException(404, detail={"error": "invalid_invite_code"})
    gid = group.data[0]["id"]
    existing = db.table("group_members").select("id").eq("group_id", gid).eq(
        "user_id", user_id
    ).execute()
    if not existing.data:
        db.table("group_members").insert({"group_id": gid, "user_id": user_id}).execute()
    return {"group": group.data[0]}


@router.delete("/{group_id}/leave")
async def leave_group(group_id: str, user_id: str = Depends(get_current_user_id)):
    db = get_supabase()
    db.table("group_members").delete().eq("group_id", group_id).eq("user_id", user_id).execute()
    return {"ok": True}
