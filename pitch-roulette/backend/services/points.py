"""Pitch Points (PP) — lifetime skill score."""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone

from database import get_supabase

STREAK_MULTIPLIERS = {
    0: 1.0,
    1: 1.0,
    2: 1.2,
    3: 1.5,
    4: 1.75,
}
STREAK_MAX_MULTIPLIER = 2.0

EARLY_BONUS_TIERS = [
    (60, 0.5),
    (120, 0.25),
    (300, 0.0),
]


@dataclass
class PredictionResult:
    base_pp: float
    streak_multiplier: float
    early_bonus: float
    underdog_bonus: float
    total_pp: float
    outcome_correct: bool
    score_exact: bool
    score_diff_correct: bool
    new_streak: int
    breakdown: dict


def actual_outcome(home: int, away: int) -> str:
    return _outcome(home, away)


def _outcome(home: int, away: int) -> str:
    if home > away:
        return "HOME_WIN"
    if home < away:
        return "AWAY_WIN"
    return "DRAW"


def _streak_multiplier(current_streak: int) -> float:
    """Multiplier for this prediction when current_streak prior correct answers exist."""
    n = current_streak + 1
    if n >= 5:
        return STREAK_MAX_MULTIPLIER
    if n == 4:
        return 1.75
    if n == 3:
        return 1.5
    if n == 2:
        return 1.2
    return 1.0


def calculate_prediction_pp(
    predicted_home: int,
    predicted_away: int,
    actual_home: int,
    actual_away: int,
    seconds_to_submit: float,
    current_streak: int,
    was_underdog: bool,
    underdog_won: bool,
) -> PredictionResult:
    pred_outcome = _outcome(predicted_home, predicted_away)
    actual_outcome_val = _outcome(actual_home, actual_away)
    outcome_correct = pred_outcome == actual_outcome_val
    score_exact = predicted_home == actual_home and predicted_away == actual_away
    score_diff_correct = (
        not score_exact
        and outcome_correct
        and abs(predicted_home - predicted_away) == abs(actual_home - actual_away)
    )

    if score_exact:
        base_pp = 3.0
    elif score_diff_correct:
        base_pp = 2.0
    elif outcome_correct:
        base_pp = 1.0
    else:
        base_pp = 0.0

    multiplier = _streak_multiplier(current_streak) if outcome_correct else 1.0
    boosted_base = base_pp * multiplier

    early_bonus = 0.0
    if base_pp > 0:
        for threshold_secs, bonus in EARLY_BONUS_TIERS:
            if seconds_to_submit <= threshold_secs:
                early_bonus = bonus
                break

    underdog_bonus = 0.0
    if was_underdog and underdog_won and outcome_correct:
        underdog_bonus = 1.0

    new_streak = (current_streak + 1) if outcome_correct else 0
    total_pp = boosted_base + early_bonus + underdog_bonus

    return PredictionResult(
        base_pp=base_pp,
        streak_multiplier=multiplier,
        early_bonus=early_bonus,
        underdog_bonus=underdog_bonus,
        total_pp=round(total_pp, 2),
        outcome_correct=outcome_correct,
        score_exact=score_exact,
        score_diff_correct=score_diff_correct,
        new_streak=new_streak,
        breakdown={
            "base": base_pp,
            "streak_mult": f"×{multiplier}",
            "streak_bonus": round(boosted_base - base_pp, 2),
            "early_bonus": early_bonus,
            "underdog_bonus": underdog_bonus,
            "total": round(total_pp, 2),
            "score_exact": score_exact,
            "score_diff_correct": score_diff_correct,
            "outcome_correct": outcome_correct,
        },
    )


def calculate_points(
    pred_home: int,
    pred_away: int,
    pred_outcome: str,
    actual_home: int,
    actual_away: int,
    is_first: bool,
    streak_before: int,
) -> tuple[float, bool, bool, int]:
    """Backward-compatible wrapper (is_first maps to early 60s bonus)."""
    seconds = 30.0 if is_first else 400.0
    result = calculate_prediction_pp(
        pred_home,
        pred_away,
        actual_home,
        actual_away,
        seconds,
        streak_before,
        was_underdog=False,
        underdog_won=False,
    )
    return result.total_pp, result.outcome_correct, result.score_exact, result.new_streak


def _parse_dt(iso: str | None) -> datetime | None:
    if not iso:
        return None
    try:
        dt = datetime.fromisoformat(iso.replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc)
    except ValueError:
        return None


def _prediction_epoch(room: dict) -> datetime:
    for key in ("draft_started_at", "created_at"):
        dt = _parse_dt(room.get(key))
        if dt:
            return dt
    return datetime.now(timezone.utc)


def _side_counts(db, room_id: str) -> tuple[int, int]:
    players = (
        db.table("room_players")
        .select("assigned_side")
        .eq("room_id", room_id)
        .execute()
        .data
        or []
    )
    home = sum(1 for p in players if p.get("assigned_side") == "HOME")
    away = sum(1 for p in players if p.get("assigned_side") == "AWAY")
    return home, away


async def close_room_and_award(room_id: str, actual_home: int, actual_away: int) -> list[dict]:
    db = get_supabase()
    room = db.table("rooms").select("*").eq("id", room_id).execute().data[0]
    epoch = _prediction_epoch(room)
    actual_winner = _outcome(actual_home, actual_away)
    home_count, away_count = _side_counts(db, room_id)

    players = {
        p["user_id"]: p
        for p in (
            db.table("room_players").select("*").eq("room_id", room_id).execute().data or []
        )
    }

    preds = db.table("predictions").select("*").eq("room_id", room_id).execute().data or []
    if not preds:
        db.table("rooms").update({
            "state": "RESULTS",
            "actual_home_goals": actual_home,
            "actual_away_goals": actual_away,
        }).eq("id", room_id).execute()
        return []

    results = []

    for pred in preds:
        profile = db.table("profiles").select("*").eq("id", pred["user_id"]).execute().data[0]
        streak_before = int(profile.get("current_streak", 0))

        submitted = _parse_dt(pred.get("submitted_at")) or epoch
        seconds_to_submit = max(0.0, (submitted - epoch).total_seconds())

        player = players.get(pred["user_id"]) or {}
        side = player.get("assigned_side")
        was_underdog = False
        underdog_won = False
        if side == "HOME":
            was_underdog = home_count < away_count
            underdog_won = actual_winner == "HOME_WIN"
        elif side == "AWAY":
            was_underdog = away_count < home_count
            underdog_won = actual_winner == "AWAY_WIN"

        result = calculate_prediction_pp(
            pred["home_goals"],
            pred["away_goals"],
            actual_home,
            actual_away,
            seconds_to_submit,
            streak_before,
            was_underdog,
            underdog_won,
        )

        update_payload: dict = {
            "points_earned": result.total_pp,
            "pp_breakdown": result.breakdown,
        }
        try:
            db.table("predictions").update(update_payload).eq("id", pred["id"]).execute()
        except Exception:
            db.table("predictions").update({"points_earned": result.total_pp}).eq(
                "id", pred["id"]
            ).execute()

        best = max(int(profile.get("best_streak", 0)), result.new_streak)
        db.table("profiles").update({
            "total_points": float(profile.get("total_points", 0)) + result.total_pp,
            "total_predictions": int(profile.get("total_predictions", 0)) + 1,
            "correct_outcomes": int(profile.get("correct_outcomes", 0))
            + (1 if result.outcome_correct else 0),
            "exact_scores": int(profile.get("exact_scores", 0))
            + (1 if result.score_exact else 0),
            "current_streak": result.new_streak,
            "best_streak": best,
        }).eq("id", pred["user_id"]).execute()

        if room.get("group_id"):
            member = db.table("group_members").select("*").eq(
                "group_id", room["group_id"]
            ).eq("user_id", pred["user_id"]).execute()
            if member.data:
                gm = member.data[0]
                db.table("group_members").update({
                    "group_points": float(gm.get("group_points", 0)) + result.total_pp,
                }).eq("id", gm["id"]).execute()

        pred["points_earned"] = result.total_pp
        pred["pp_breakdown"] = result.breakdown
        pred["outcome_correct"] = result.outcome_correct
        pred["score_exact"] = result.score_exact
        pred["score_diff_correct"] = result.score_diff_correct
        results.append(pred)

    db.table("rooms").update({
        "state": "RESULTS",
        "actual_home_goals": actual_home,
        "actual_away_goals": actual_away,
    }).eq("id", room_id).execute()

    return results
