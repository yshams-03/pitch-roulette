"""Enhanced health checks for ops and E2E validation."""
import os

from fastapi import APIRouter, Request

from database import get_supabase
from services import sports_service
from services.db_compat import has_unify_migration
from services.feature_flags import get_feature_flags
from services.telemetry import funnel_insights, funnel_summary, health_alerts

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
    info["environment"] = os.getenv("ENVIRONMENT", "development")
    info["feature_flags"] = get_feature_flags()
    info["sentry_enabled"] = bool(os.getenv("SENTRY_DSN", "").strip())
    info["telemetry_24h"] = funnel_summary(hours=24)
    live_count = _count_rooms(state="LIVE")
    info["active_rooms"] = live_count
    info["active_simulation_rooms"] = _count_rooms(state="LIVE", simulation=True)
    info["alerts"] = health_alerts(live_count if live_count >= 0 else 0)
    insights = funnel_insights(hours=24)
    if insights.get("insight"):
        info["product_insight"] = insights["insight"]
    info["flash_bet_conversion_24h"] = insights.get("flash_bet_conversion_rate")
    info["supabase_connected"] = _count_rooms() >= 0
    return info


@router.get("/api/cors-test")
async def cors_test(request: Request):
    return {
        "origin_received": request.headers.get("origin", "none"),
        "cors_should_allow": [
            "https://pitch-roulette.vercel.app",
        ],
        "message": "If you can read this, CORS is working",
    }
