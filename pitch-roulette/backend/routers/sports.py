from fastapi import APIRouter, HTTPException

from services import sports_service

router = APIRouter(prefix="/api", tags=["sports"])


@router.get("/fixtures")
async def fixtures(status: str | None = None, competition: str = "WC"):
    """List matches, optionally filtered by status (e.g. LIVE, SCHEDULED, LIVE|SCHEDULED)."""
    data = await sports_service.get_matches(competition)
    matches = list(data.get("matches") or [])
    if status:
        allowed = {s.strip().upper() for s in status.replace("|", ",").split(",") if s.strip()}
        live_statuses = frozenset({"IN_PLAY", "PAUSED", "LIVE"})
        scheduled_statuses = frozenset({"SCHEDULED", "TIMED"})

        def _ok(m: dict) -> bool:
            s = str(m.get("status", "")).upper()
            if "LIVE" in allowed and (s in live_statuses or m.get("is_live")):
                return True
            if "SCHEDULED" in allowed and s in scheduled_statuses:
                return True
            return s in allowed

        matches = [m for m in matches if _ok(m)]
    return {
        "competition": data.get("competition", competition),
        "matches": matches,
        "source": data.get("source"),
        "updated_at": data.get("updated_at"),
    }


@router.get("/standings/{competition}")
async def standings(competition: str):
    return await sports_service.get_standings(competition)


@router.get("/matches/{competition}")
async def matches(competition: str):
    return await sports_service.get_matches(competition)


@router.get("/matches/{match_id}/live")
async def live_match(match_id: str):
    return await sports_service.get_live_match(match_id)


@router.get("/espn/events/{espn_event_id}")
async def espn_match_events(espn_event_id: str):
    snapshot = await sports_service.get_espn_live_snapshot(espn_event_id)
    if snapshot.get("error"):
        raise HTTPException(404, detail={"error": snapshot["error"]})
    return snapshot
