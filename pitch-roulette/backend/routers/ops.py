"""Ops endpoints: feature flags, telemetry, funnel metrics."""
from typing import Any

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from auth import get_current_user_id
from services.feature_flags import get_feature_flags
from services.telemetry import ALLOWED_EVENTS, funnel_summary, track_event

router = APIRouter(prefix="/api", tags=["ops"])


class TrackEventRequest(BaseModel):
    event_name: str = Field(..., min_length=1, max_length=64)
    properties: dict[str, Any] = Field(default_factory=dict)


@router.get("/flags")
async def feature_flags():
    return {"flags": get_feature_flags()}


@router.post("/events")
async def ingest_event(body: TrackEventRequest, user_id: str = Depends(get_current_user_id)):
    if body.event_name not in ALLOWED_EVENTS:
        return {"ok": False, "error": "unknown_event"}
    ok = track_event(body.event_name, user_id=user_id, properties=body.properties)
    return {"ok": ok}


@router.get("/metrics/funnel")
async def metrics_funnel(hours: int = 24):
    return {"hours": hours, "events": funnel_summary(hours=hours)}
