"""Pitch Points calculation on room close."""
from __future__ import annotations

from database import get_supabase


def actual_outcome(home: int, away: int) -> str:
    if home > away:
        return "HOME_WIN"
    if home < away:
        return "AWAY_WIN"
    return "DRAW"


def calculate_points(
    pred_home: int,
    pred_away: int,
    pred_outcome: str,
    actual_home: int,
    actual_away: int,
    is_first: bool,
    streak_before: int,
) -> tuple[float, bool, bool, int]:
    actual = actual_outcome(actual_home, actual_away)
    correct_outcome = pred_outcome == actual
    exact = pred_home == actual_home and pred_away == actual_away

    points = 0.0
    if exact:
        points = 3.0
    elif correct_outcome:
        points = 1.0

    if is_first and points > 0:
        points += 0.5

    new_streak = (streak_before + 1) if correct_outcome else 0
    if correct_outcome and streak_before >= 2:
        points *= 2

    return points, correct_outcome, exact, new_streak


async def close_room_and_award(room_id: str, actual_home: int, actual_away: int) -> list[dict]:
    db = get_supabase()
    room = db.table("rooms").select("*").eq("id", room_id).execute().data[0]

    preds = db.table("predictions").select("*").eq("room_id", room_id).execute().data or []
    if not preds:
        db.table("rooms").update({
            "state": "RESULTS",
            "actual_home_goals": actual_home,
            "actual_away_goals": actual_away,
        }).eq("id", room_id).execute()
        return []

    first_id = min(preds, key=lambda p: p["submitted_at"])["user_id"]
    results = []

    for pred in preds:
        profile = db.table("profiles").select("*").eq("id", pred["user_id"]).execute().data[0]
        streak_before = int(profile.get("current_streak", 0))
        pts, correct, exact, new_streak = calculate_points(
            pred["home_goals"],
            pred["away_goals"],
            pred["predicted_outcome"],
            actual_home,
            actual_away,
            pred["user_id"] == first_id,
            streak_before,
        )

        db.table("predictions").update({"points_earned": pts}).eq("id", pred["id"]).execute()

        best = max(int(profile.get("best_streak", 0)), new_streak)
        db.table("profiles").update({
            "total_points": float(profile.get("total_points", 0)) + pts,
            "total_predictions": int(profile.get("total_predictions", 0)) + 1,
            "correct_outcomes": int(profile.get("correct_outcomes", 0)) + (1 if correct else 0),
            "exact_scores": int(profile.get("exact_scores", 0)) + (1 if exact else 0),
            "current_streak": new_streak,
            "best_streak": best,
        }).eq("id", pred["user_id"]).execute()

        if room.get("group_id"):
            member = db.table("group_members").select("*").eq(
                "group_id", room["group_id"]
            ).eq("user_id", pred["user_id"]).execute()
            if member.data:
                gm = member.data[0]
                db.table("group_members").update({
                    "group_points": float(gm.get("group_points", 0)) + pts,
                }).eq("id", gm["id"]).execute()

        pred["points_earned"] = pts
        results.append(pred)

    db.table("rooms").update({
        "state": "RESULTS",
        "actual_home_goals": actual_home,
        "actual_away_goals": actual_away,
    }).eq("id", room_id).execute()

    return results
