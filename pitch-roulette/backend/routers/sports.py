from fastapi import APIRouter, HTTPException

from database import get_supabase
from services.game_engine import compute_ssr, apply_handicap_if_needed
from services.sports_api import get_fixture, get_lineups, get_live_events, get_live_stats, search_fixtures

router = APIRouter(prefix="/sports", tags=["sports"])


@router.get("/search-match")
async def search_match(q: str):
    if len(q) < 2:
        raise HTTPException(status_code=400, detail={"error": "query_too_short"})

    fixtures = await search_fixtures(q)
    results = []
    for f in fixtures[:20]:
        fixture = f.get("fixture", {})
        teams = f.get("teams", {})
        results.append({
            "id": fixture.get("id"),
            "date": fixture.get("date"),
            "venue": fixture.get("venue", {}).get("name"),
            "team_a": teams.get("home", {}).get("name"),
            "team_b": teams.get("away", {}).get("name"),
            "team_a_logo": teams.get("home", {}).get("logo"),
            "team_b_logo": teams.get("away", {}).get("logo"),
        })
    return {"matches": results}


@router.get("/lineups/{match_id}")
async def fetch_lineups(match_id: str):
    if str(match_id) == "TEST_EGY_BEL":
        from services.test_scenario import get_test_lineups_response
        data = get_test_lineups_response()
        db = get_supabase()
        db.table("rooms").update({
            "squad_strength_a": data["ssr_a"],
            "squad_strength_b": data["ssr_b"],
            "handicap_active": data["handicap"]["active"],
        }).eq("match_id", str(match_id)).execute()
        return data

    data = await get_lineups(match_id)
    if not data.get("available"):
        return {"available": False, "lineups": []}

    lineups = data["lineups"]
    ssr_a = 6.5
    ssr_b = 6.5
    if len(lineups) >= 1:
        ssr_a = compute_ssr(lineups[0].get("startXI", []))
    if len(lineups) >= 2:
        ssr_b = compute_ssr(lineups[1].get("startXI", []))

    handicap = apply_handicap_if_needed(ssr_a, ssr_b)

    db = get_supabase()
    db.table("rooms").update({
        "squad_strength_a": ssr_a,
        "squad_strength_b": ssr_b,
        "handicap_active": handicap["active"],
    }).eq("match_id", str(match_id)).execute()

    formatted = []
    for lineup in lineups:
        team = lineup.get("team", {})
        team_name = team if isinstance(team, str) else team.get("name", "")
        players = []
        for entry in lineup.get("startXI", []):
            p = entry.get("player", {})
            players.append({
                "id": p.get("id"),
                "name": p.get("name"),
                "number": p.get("number"),
                "pos": p.get("pos"),
            })
        formatted.append({
            "team": team_name,
            "formation": lineup.get("formation"),
            "players": players,
        })

    return {
        "available": True,
        "lineups": formatted,
        "ssr_a": ssr_a,
        "ssr_b": ssr_b,
        "handicap": handicap,
    }


@router.get("/live/{match_id}")
async def fetch_live(match_id: str):
    if str(match_id) == "TEST_EGY_BEL":
        from routers.test_mode import get_test_live_snapshot
        return get_test_live_snapshot()

    fixture = await get_fixture(match_id)
    events = await get_live_events(match_id)
    stats = await get_live_stats(match_id)

    score = {"a": 0, "b": 0}
    clock = "0'"
    status = "NS"

    if fixture:
        goals = fixture.get("goals", {})
        score = {"a": goals.get("home", 0) or 0, "b": goals.get("away", 0) or 0}
        elapsed = fixture.get("fixture", {}).get("status", {}).get("elapsed")
        status = fixture.get("fixture", {}).get("status", {}).get("short", "NS")
        clock = f"{elapsed}'" if elapsed else status

    return {
        "score": score,
        "clock": clock,
        "status": status,
        "events": events,
        "stats": stats,
    }
