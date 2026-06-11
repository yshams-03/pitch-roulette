from database import get_supabase
from services.sports_api import get_player_ratings


async def submit_fantasy_picks(player_id: str, room_id: str, picks: list[dict]) -> list[dict]:
    db = get_supabase()
    db.table("fantasy_picks").delete().eq("player_id", player_id).execute()

    inserted = []
    for pick in picks:
        result = db.table("fantasy_picks").insert({
            "player_id": player_id,
            "room_id": room_id,
            "api_player_id": pick["api_player_id"],
            "player_name": pick["player_name"],
            "position": pick["position"],
        }).execute()
        inserted.append(result.data[0])

        initial_rating = float(pick.get("initial_rating", 0) or 0)
        existing = db.table("fantasy_scores").select("id").eq(
            "player_id", player_id
        ).eq("api_player_id", pick["api_player_id"]).execute()
        if not existing.data:
            db.table("fantasy_scores").insert({
                "player_id": player_id,
                "room_id": room_id,
                "api_player_id": pick["api_player_id"],
                "current_rating": initial_rating,
                "bonus_pc": 0,
                "penalty_pc": 0,
                "total_fantasy_score": initial_rating,
            }).execute()

    return inserted


async def sync_fantasy_ratings(room_id: str, fixture_id: int) -> None:
    db = get_supabase()
    ratings_data = await get_player_ratings(fixture_id)

    picks_result = db.table("fantasy_picks").select("*").eq("room_id", room_id).execute()
    pick_map = {p["api_player_id"]: p for p in (picks_result.data or [])}

    for team_data in ratings_data:
        for player_data in team_data.get("players", []):
            api_player = player_data.get("player", {})
            api_id = api_player.get("id")
            if api_id not in pick_map:
                continue

            stats = player_data.get("statistics", [{}])
            rating = 0.0
            if stats:
                rating_val = stats[0].get("games", {}).get("rating")
                if rating_val:
                    rating = float(rating_val)

            pick = pick_map[api_id]
            scores_result = db.table("fantasy_scores").select("*").eq(
                "player_id", pick["player_id"]
            ).eq("api_player_id", api_id).execute()

            if not scores_result.data:
                continue

            score_row = scores_result.data[0]
            prev_rating = float(score_row.get("current_rating", 0))
            bonus_pc = int(score_row.get("bonus_pc", 0))
            penalty_pc = int(score_row.get("penalty_pc", 0))

            if rating >= 8.0 and prev_rating < 8.0:
                bonus_pc += 50
                player_result = db.table("players").select("balance").eq("id", pick["player_id"]).execute()
                if player_result.data:
                    db.table("players").update({
                        "balance": player_result.data[0]["balance"] + 50,
                    }).eq("id", pick["player_id"]).execute()

            if rating <= 6.0 and prev_rating > 6.0 and prev_rating > 0:
                from services.game_engine import process_jinx_for_event
                await process_jinx_for_event(
                    room_id, {"player": {"name": pick["player_name"]}, "detail": "Foul", "type": "Card"},
                    api_player_id=api_id,
                    trigger="rating_drop",
                )

            if rating <= 4.0 and prev_rating > 4.0 and prev_rating > 0:
                penalty_pc += 50
                player_result = db.table("players").select("balance").eq("id", pick["player_id"]).execute()
                if player_result.data:
                    db.table("players").update({
                        "balance": max(0, player_result.data[0]["balance"] - 50),
                    }).eq("id", pick["player_id"]).execute()

            total = rating + (bonus_pc / 100) - (penalty_pc / 100)

            db.table("fantasy_scores").update({
                "current_rating": rating,
                "bonus_pc": bonus_pc,
                "penalty_pc": penalty_pc,
                "total_fantasy_score": round(total, 1),
            }).eq("id", score_row["id"]).execute()


async def update_fantasy_scores_from_event(room_id: str, event: dict) -> None:
    detail = event.get("detail", "")
    player_info = event.get("player", {})
    player_name = player_info.get("name", "")

    if not player_name:
        return

    db = get_supabase()
    picks_result = db.table("fantasy_picks").select("*").eq("room_id", room_id).ilike(
        "player_name", f"%{player_name}%"
    ).execute()

    for pick in picks_result.data or []:
        scores_result = db.table("fantasy_scores").select("*").eq(
            "player_id", pick["player_id"]
        ).eq("api_player_id", pick["api_player_id"]).execute()

        if not scores_result.data:
            continue

        score_row = scores_result.data[0]
        penalty_pc = int(score_row.get("penalty_pc", 0))

        if detail in ("Red Card", "Yellow Card"):
            penalty_pc += 25 if detail == "Yellow Card" else 50
            player_result = db.table("players").select("balance").eq("id", pick["player_id"]).execute()
            if player_result.data:
                deduction = 25 if detail == "Yellow Card" else 50
                db.table("players").update({
                    "balance": max(0, player_result.data[0]["balance"] - deduction),
                }).eq("id", pick["player_id"]).execute()

            rating = float(score_row.get("current_rating", 0))
            total = rating + (int(score_row.get("bonus_pc", 0)) / 100) - (penalty_pc / 100)
            db.table("fantasy_scores").update({
                "penalty_pc": penalty_pc,
                "total_fantasy_score": round(total, 1),
            }).eq("id", score_row["id"]).execute()
