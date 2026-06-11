"""Sports data facade — API-Football + Big Balls Sports Data."""
from __future__ import annotations

import asyncio
import logging

from config import get_settings
from services.sports_providers import api_football, big_balls

logger = logging.getLogger(__name__)

_polling_active: dict[str, bool] = {}

_LIVE_STATUSES = frozenset({"1H", "HT", "2H", "ET", "BT", "P", "LIVE", "INT", "IN_PLAY"})
_TERMINAL_STATUSES = frozenset({"FT", "AET", "PEN", "FINISHED"})


def _provider_mode() -> str:
    return get_settings().SPORTS_PROVIDER.lower()


def _use_big_balls_only() -> bool:
    return _provider_mode() == "bigballs" and big_balls.is_configured()


def _can_fallback_big_balls() -> bool:
    return big_balls.is_configured() and _provider_mode() in ("auto", "bigballs")


async def search_fixtures(query: str) -> list[dict]:
    if _use_big_balls_only():
        return await big_balls.search_fixtures(query)

    results = await api_football.search_fixtures(query)
    if results:
        return results
    if _can_fallback_big_balls():
        logger.info("Falling back to Big Balls for search: %s", query)
        return await big_balls.search_fixtures(query)
    return []


async def get_lineups(fixture_id: str | int) -> dict:
    if _use_big_balls_only():
        return await big_balls.get_lineups(fixture_id)

    data = await api_football.get_lineups(fixture_id)
    if data.get("available") or not data.get("_rate_limited"):
        data.pop("_rate_limited", None)
        return data
    if _can_fallback_big_balls():
        logger.info("Falling back to Big Balls for lineups: %s", fixture_id)
        return await big_balls.get_lineups(fixture_id)
    return {"available": False, "lineups": []}


async def get_live_events(fixture_id: str | int) -> list[dict]:
    if _use_big_balls_only():
        return await big_balls.get_live_events(fixture_id)

    events = await api_football.get_live_events(fixture_id)
    if events:
        return events
    if _can_fallback_big_balls():
        return await big_balls.get_live_events(fixture_id)
    return []


async def get_live_stats(fixture_id: str | int) -> dict:
    if _use_big_balls_only():
        return await big_balls.get_live_stats(fixture_id)

    stats = await api_football.get_live_stats(fixture_id)
    if stats.get("response"):
        return stats
    if _can_fallback_big_balls():
        bbs = await big_balls.get_live_stats(fixture_id)
        if bbs.get("response"):
            return bbs
    return stats


async def get_player_ratings(fixture_id: str | int) -> list[dict]:
    if _use_big_balls_only():
        return await big_balls.get_player_ratings(fixture_id)

    ratings = await api_football.get_player_ratings(fixture_id)
    if ratings:
        return ratings
    return []


async def get_fixture(fixture_id: str | int) -> dict | None:
    if _use_big_balls_only():
        return await big_balls.get_fixture(fixture_id)

    fixture = await api_football.get_fixture(fixture_id)
    if fixture:
        return fixture
    if _can_fallback_big_balls():
        return await big_balls.get_fixture(fixture_id)
    return None


async def start_live_polling(room_id: str, fixture_id: str | int) -> None:
    if str(fixture_id) == "TEST_EGY_BEL":
        return

    from services.game_engine import get_room_by_id, handle_event, update_momentum, advance_room_state

    _polling_active[room_id] = True
    known_event_ids: set[str] = set()
    seen_live = False

    while _polling_active.get(room_id, False):
        room = await get_room_by_id(room_id)
        if not room or room["state"] not in ("LIVE",):
            break

        events = await get_live_events(fixture_id)
        for event in events:
            eid = str(event.get("id", ""))
            if eid and eid not in known_event_ids:
                known_event_ids.add(eid)
                await handle_event(room_id, event)

        stats = await get_live_stats(fixture_id)
        await update_momentum(room_id, stats)

        fixture = await get_fixture(fixture_id)
        if fixture:
            status = fixture.get("fixture", {}).get("status", {}).get("short", "")
            if status in _LIVE_STATUSES:
                seen_live = True
            if status in _TERMINAL_STATUSES and seen_live:
                try:
                    await advance_room_state(room_id, "FULL_TIME")
                except ValueError:
                    pass
                break

        from services.fantasy import sync_fantasy_ratings
        await sync_fantasy_ratings(room_id, fixture_id)

        await asyncio.sleep(30)

    _polling_active.pop(room_id, None)


def stop_polling(room_id: str) -> None:
    _polling_active[room_id] = False
