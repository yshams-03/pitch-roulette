import asyncio
import logging
from datetime import datetime, timezone

from database import get_supabase

logger = logging.getLogger(__name__)

STALE_SECONDS = 5
_player_last_seen: dict[str, datetime] = {}
_presence_task: asyncio.Task | None = None


def mark_player_seen(player_id: str) -> None:
    _player_last_seen[player_id] = datetime.now(timezone.utc)


def mark_player_disconnected(player_id: str) -> None:
    _player_last_seen.pop(player_id, None)
    db = get_supabase()
    db.table("players").update({"is_connected": False}).eq("id", player_id).execute()


async def heartbeat(player_id: str) -> None:
    mark_player_seen(player_id)
    db = get_supabase()
    db.table("players").update({"is_connected": True}).eq("id", player_id).execute()


def effective_is_connected(player_id: str, stored: bool) -> bool:
    last = _player_last_seen.get(player_id)
    if not last:
        return stored
    age = (datetime.now(timezone.utc) - last).total_seconds()
    return age <= STALE_SECONDS


async def _presence_loop() -> None:
    while True:
        try:
            now = datetime.now(timezone.utc)
            db = get_supabase()
            for player_id, last_seen in list(_player_last_seen.items()):
                if (now - last_seen).total_seconds() > STALE_SECONDS:
                    db.table("players").update({"is_connected": False}).eq("id", player_id).execute()
                    _player_last_seen.pop(player_id, None)
        except Exception as e:
            logger.warning("Presence loop error: %s", e)
        await asyncio.sleep(2)


def start_presence_monitor() -> None:
    global _presence_task
    if _presence_task is None or _presence_task.done():
        _presence_task = asyncio.create_task(_presence_loop())
