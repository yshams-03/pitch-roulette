"""Enhanced health checks for ops and E2E validation."""
from fastapi import APIRouter

from database import get_supabase
from services import sports_service
from services.db_compat import has_unify_migration

router = APIRouter(tags=["health"])

API_VERSION = "3.0.0"


def _count_rooms(state: str | None = None, simulation: bool | None = None) -> int:
    try:
        db = get_supabase()
        cols = "id, state, match_data"
        if has_unify_migration():
            cols = "id, state, match_source, match_data"
        q = db.table("rooms").select(cols)
        if state:
            q = q.eq("state", state)
        rows = q.execute().data or []
        if simulation is None:
            return len(rows)
        out = 0
        for r in rows:
            src = r.get("match_source")
            is_sim = src in ("demo_simulation", "manual") or (r.get("match_data") or {}).get("demo")
            if simulation and is_sim:
                out += 1
            elif not simulation and not is_sim:
                out += 1
        return out
    except Exception:
        return -1


@router.get("/api/health")
async def health():
    info = sports_service.health_info()
    info["version"] = API_VERSION
    info["active_rooms"] = _count_rooms(state="LIVE")
    info["active_simulation_rooms"] = _count_rooms(state="LIVE", simulation=True)
    info["supabase_connected"] = _count_rooms() >= 0
    return info
