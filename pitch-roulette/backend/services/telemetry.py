"""Product telemetry — funnel events stored in Supabase for post-launch insights."""
from __future__ import annotations

import logging
from typing import Any

from database import get_supabase

logger = logging.getLogger(__name__)

ALLOWED_EVENTS = frozenset({
    "room_created",
    "room_joined",
    "predictions_locked",
    "draft_picked",
    "flash_bet_seen",
    "flash_bet_answered",
    "sabotage_purchased",
    "match_ended",
    "signup_completed",
    "group_created",
    "page_view",
})

# Ops alert when live room count exceeds this (see /api/health alerts[]).
LIVE_ROOM_ALERT_THRESHOLD = int(__import__("os").getenv("LIVE_ROOM_ALERT_THRESHOLD", "40"))


def track_event(
    event_name: str,
    *,
    user_id: str | None = None,
    properties: dict[str, Any] | None = None,
) -> bool:
    if event_name not in ALLOWED_EVENTS:
        logger.warning("telemetry: rejected event %s", event_name)
        return False
    try:
        db = get_supabase()
        db.table("analytics_events").insert({
            "user_id": user_id,
            "event_name": event_name,
            "properties": properties or {},
        }).execute()
        return True
    except Exception as e:
        logger.debug("telemetry insert failed: %s", e)
        return False


def funnel_summary(hours: int = 24) -> dict[str, int]:
    """Aggregate event counts for ops dashboard / health."""
    try:
        from datetime import datetime, timedelta, timezone

        db = get_supabase()
        since = (datetime.now(timezone.utc) - timedelta(hours=hours)).isoformat()
        rows = db.table("analytics_events").select("event_name").gte("created_at", since).execute().data or []
        counts: dict[str, int] = {}
        for row in rows:
            name = str(row.get("event_name", ""))
            counts[name] = counts.get(name, 0) + 1
        return counts
    except Exception:
        return {}


def funnel_insights(hours: int = 24) -> dict:
    """Product insights derived from funnel events."""
    events = funnel_summary(hours=hours)
    seen = events.get("flash_bet_seen", 0)
    answered = events.get("flash_bet_answered", 0)
    conversion = round(answered / seen, 3) if seen > 0 else None
    drop_off = seen - answered if seen >= answered else 0

    insight = None
    if seen >= 10 and conversion is not None and conversion < 0.5:
        insight = (
            f"Flash bet conversion {conversion:.0%} ({answered}/{seen}) — "
            "users see bets but don't answer. Urgency CTA active in FlashBetCard."
        )

    return {
        "hours": hours,
        "events": events,
        "flash_bet_seen": seen,
        "flash_bet_answered": answered,
        "flash_bet_drop_off": drop_off,
        "flash_bet_conversion_rate": conversion,
        "insight": insight,
    }


def health_alerts(active_live_rooms: int) -> list[str]:
    alerts: list[str] = []
    if active_live_rooms >= LIVE_ROOM_ALERT_THRESHOLD:
        alerts.append(
            f"high_live_room_count:{active_live_rooms}>={LIVE_ROOM_ALERT_THRESHOLD}"
        )
    return alerts
