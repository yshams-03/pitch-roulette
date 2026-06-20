"""Unified event pipeline — simulation auto-events, ESPN/FD polling, host inject."""
from __future__ import annotations

import asyncio
import logging
import random
from datetime import datetime, timedelta, timezone

from postgrest.exceptions import APIError

from database import get_supabase
from services import sports_service
from services.bots import answer_open_flash_bet
from services.db_compat import fetch_live_rooms
from services.flash_bet_scheduler import maybe_fire_flash_bet, try_auto_resolve_locked_bets
from services.flash_bets import (
    _missing_phase2_table,
    _warn_migration_once,
    list_flash_bets,
    lock_expired_bets,
)
from services.match_engine import (
    cleanup_abandoned_live_demo_rooms,
    infer_match_source,
    inject_random_event,
    is_simulation_room,
    resolve_active_bet,
    cleanup_stale_simulation_rooms,
)
from services.host_management import cleanup_orphan_host_rooms

logger = logging.getLogger(__name__)

_TICK_SECONDS = 10
_SIM_INJECT_COOLDOWN = 18
_RESOLVE_GRACE_SECONDS = 8
_BOT_ANSWER_DELAY_MIN = 1.0
_BOT_ANSWER_DELAY_MAX = 3.0

_last_inject: dict[str, datetime] = {}
_bot_answer_ready_at: dict[str, datetime] = {}
_task: asyncio.Task | None = None


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _parse_ts(iso: str | None) -> datetime | None:
    if not iso:
        return None
    try:
        dt = datetime.fromisoformat(iso.replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.astimezone(timezone.utc)
    except ValueError:
        return None


def notify_manual_inject(code: str) -> None:
    _last_inject[code.upper()] = _now()


def _schedule_bot_answers(bet_id: str) -> None:
    if bet_id not in _bot_answer_ready_at:
        delay = random.uniform(_BOT_ANSWER_DELAY_MIN, _BOT_ANSWER_DELAY_MAX)
        _bot_answer_ready_at[bet_id] = _now() + timedelta(seconds=delay)


def _bots_ready(bet_id: str) -> bool:
    ready_at = _bot_answer_ready_at.get(bet_id)
    return ready_at is not None and _now() >= ready_at


def _clear_bot_schedule(bet_id: str) -> None:
    _bot_answer_ready_at.pop(bet_id, None)


def _user_answered(bet_id: str, user_id: str) -> bool:
    db = get_supabase()
    row = db.table("flash_bet_answers").select("id").eq(
        "flash_bet_id", bet_id
    ).eq("user_id", user_id).execute()
    return bool(row.data)


def _should_resolve_bet(bet: dict, host_id: str) -> bool:
    locks_at = _parse_ts(bet.get("locks_at"))
    if not locks_at:
        return False
    elapsed = (_now() - locks_at).total_seconds()
    if elapsed < 0:
        return False
    if _user_answered(bet["id"], host_id):
        return elapsed >= 1.0
    return elapsed >= _RESOLVE_GRACE_SECONDS


def _resolve_bet(code: str, host_id: str, bet: dict) -> None:
    opts = bet.get("options") or ["Yes", "No"]
    options = [str(o) for o in opts] if isinstance(opts, list) else ["Yes", "No"]
    resolve_active_bet(code, host_id, random.choice(options))
    _clear_bot_schedule(bet["id"])


def _can_inject_simulation(code: str, events_log: list) -> bool:
    key = code.upper()
    last = _last_inject.get(key)
    if last and (_now() - last).total_seconds() < _SIM_INJECT_COOLDOWN:
        return False
    if events_log:
        at = _parse_ts(events_log[-1].get("at"))
        if at and (_now() - at).total_seconds() < _SIM_INJECT_COOLDOWN:
            return False
    return True


def _process_simulation_room(room: dict) -> None:
    code = room["room_code"]
    host_id = room["host_id"]
    sim_data = room.get("match_simulation_json") or room.get("match_data") or {}
    events_log = sim_data.get("events_log") or []

    bets = list_flash_bets(code)
    active = next((b for b in bets if b["state"] in ("OPEN", "LOCKED")), None)

    if active:
        _schedule_bot_answers(active["id"])
        if active["state"] == "OPEN" and _bots_ready(active["id"]):
            try:
                answer_open_flash_bet(room, active, host_id)
            except Exception as e:
                logger.debug("bot answer skipped %s: %s", code, e)
        if _should_resolve_bet(active, host_id):
            try:
                _resolve_bet(code, host_id, active)
            except ValueError as e:
                logger.debug("resolve skipped %s: %s", code, e)
        return

    from services.sabotages import maybe_bot_purchase_sabotage
    maybe_bot_purchase_sabotage(room)

    if infer_match_source(room) != "demo_simulation":
        return

    if not _can_inject_simulation(code, events_log):
        return

    try:
        result = inject_random_event(code, host_id, source="demo_random")
        _last_inject[code.upper()] = _now()
        bet = result.get("flash_bet")
        if bet and bet.get("id"):
            _schedule_bot_answers(bet["id"])
    except (ValueError, PermissionError) as e:
        logger.debug("sim inject skipped %s: %s", code, e)


def _match_data_from_snapshot(snapshot: dict, fd_live: dict | None = None) -> dict:
    base = fd_live or {}
    espn_slice = {
        k: snapshot[k]
        for k in (
            "id", "espn_event_id", "home_team", "away_team", "home_logo", "away_logo",
            "kickoff", "status", "status_label", "minute", "home_goals", "away_goals",
            "group_name", "venue", "is_live", "source",
        )
        if k in snapshot
    }
    merged = {**base, **espn_slice}
    if base.get("id"):
        merged["id"] = base["id"]
    return merged


async def _process_live_api_room(room: dict, db) -> None:
    match_id = room.get("match_id")
    match_data = room.get("match_data") or {}
    home = match_data.get("home_team", "")
    away = match_data.get("away_team", "")
    kickoff = match_data.get("kickoff")

    async def _fd_live() -> dict:
        if not match_id:
            return match_data
        return await sports_service.get_live_match(str(match_id))

    espn_id = room.get("espn_event_id")
    if espn_id:
        snapshot, fd_live = await asyncio.gather(
            sports_service.get_espn_live_snapshot(str(espn_id)),
            _fd_live(),
        )
    else:
        fd_live, espn_id = await asyncio.gather(
            _fd_live(),
            sports_service.resolve_espn_event_id(home, away, kickoff),
        )
        if not espn_id:
            await _process_score_fallback(room, db, fd_live)
            return
        db.table("rooms").update({"espn_event_id": espn_id}).eq("id", room["id"]).execute()
        snapshot = await sports_service.get_espn_live_snapshot(str(espn_id))

    if snapshot.get("error"):
        err = snapshot.get("error")
        if err == "demo_match":
            logger.debug("ESPN skipped for demo room %s", room.get("room_code"))
            return
        logger.warning("ESPN snapshot failed for room %s: %s", room["id"], err)
        await _process_score_fallback(room, db, fd_live)
        return

    details = snapshot.get("details") or []
    last_key = room.get("last_seen_event_key")
    start_idx = 0
    if last_key:
        for i, d in enumerate(details):
            if d.get("event_key") == last_key:
                start_idx = i + 1
                break

    latest_detail_key = last_key
    for detail in details[start_idx:]:
        event_key = detail.get("event_key")
        if not event_key:
            continue
        _record_room_event(room["id"], detail, "espn_webhook")
        latest_detail_key = event_key

    update: dict = {"match_data": _match_data_from_snapshot(snapshot, fd_live)}
    if latest_detail_key and latest_detail_key != last_key:
        update["last_seen_event_key"] = latest_detail_key
    db.table("rooms").update(update).eq("id", room["id"]).execute()

    # Bots in live rooms answer open flash bets
    bets = list_flash_bets(room["room_code"])
    active = next((b for b in bets if b["state"] == "OPEN"), None)
    if active and room.get("host_id"):
        _schedule_bot_answers(active["id"])
        if _bots_ready(active["id"]):
            try:
                answer_open_flash_bet(room, active, room["host_id"])
            except Exception:
                pass


async def _process_score_fallback(room: dict, db, fd_live: dict | None = None) -> None:
    match_id = room.get("match_id")
    if not match_id:
        return
    live = fd_live or await sports_service.get_live_match(str(match_id))
    home = int(live.get("home_goals", 0))
    away = int(live.get("away_goals", 0))
    minute = live.get("minute") or 0
    event_key = f"score-{home}-{away}-m{minute}"

    if room.get("last_seen_event_key") == event_key:
        return

    prev = room.get("match_data") or {}
    prev_home = int(prev.get("home_goals", 0))
    prev_away = int(prev.get("away_goals", 0))

    if home != prev_home or away != prev_away:
        _record_room_event(room["id"], {
            "event_key": event_key,
            "type": "GOAL",
            "minute": minute,
            "home_goals": home,
            "away_goals": away,
        }, "score_fallback")

    db.table("rooms").update({
        "match_data": live,
        "last_seen_event_key": event_key,
    }).eq("id", room["id"]).execute()


def _record_room_event(room_id: str, event: dict, source: str) -> None:
    db = get_supabase()
    try:
        db.table("room_events").insert({
            "room_id": room_id,
            "event_key": event.get("event_key"),
            "event_type": event.get("type"),
            "minute": event.get("minute"),
            "source": source,
            "payload": event,
        }).execute()
    except Exception:
        pass
    try:
        from services.draft import process_draft_event
        player_id = event.get("player_id") or event.get("athlete_id")
        process_draft_event(room_id, str(event.get("type", "")), str(player_id) if player_id else None)
    except Exception:
        pass


async def _tick_once() -> None:
    lock_expired_bets()
    try:
        cleanup_stale_simulation_rooms()
        n = cleanup_abandoned_live_demo_rooms()
        if n:
            logger.info("Auto-ended %s stale LIVE demo room(s)", n)
        n_orphan = cleanup_orphan_host_rooms()
        if n_orphan:
            logger.info("Orphan host cleanup: %s room(s)", n_orphan)
    except APIError as e:
        if not _missing_phase2_table(e):
            logger.debug("cleanup skipped: %s", e)
    db = get_supabase()
    try:
        live_rooms = fetch_live_rooms(db)
    except APIError as e:
        if _missing_phase2_table(e):
            _warn_migration_once()
            return
        raise

    for room in live_rooms:
        if room.get("state") != "LIVE":
            continue
        try:
            await maybe_fire_flash_bet(room)
            await try_auto_resolve_locked_bets(room)
        except Exception as exc:
            logger.debug("flash scheduler %s: %s", room.get("room_code"), exc)

    for room in live_rooms:
        if room.get("state") != "LIVE":
            continue
        md = room.get("match_data") or {}
        if md.get("status") in ("FINISHED", "FT", "Full time") or md.get("status_label") == "Full time":
            try:
                from services.points import close_room_and_award
                home = int(md.get("home_goals") or room.get("actual_home_goals") or 0)
                away = int(md.get("away_goals") or room.get("actual_away_goals") or 0)
                await close_room_and_award(room["id"], home, away)
                logger.info("Auto-ended room %s — match finished", room.get("room_code"))
            except Exception as exc:
                logger.debug("auto-end skipped %s: %s", room.get("room_code"), exc)

    sim_rooms = []
    api_rooms = []
    for room in live_rooms:
        if is_simulation_room(room):
            sim_rooms.append(room)
        else:
            api_rooms.append(room)

    for room in sim_rooms:
        _process_simulation_room(room)

    if api_rooms:
        await asyncio.gather(*(_process_live_api_room(room, db) for room in api_rooms))


async def _loop() -> None:
    while True:
        try:
            await _tick_once()
        except Exception as e:
            logger.exception("event pipeline error: %s", e)
        await asyncio.sleep(_TICK_SECONDS)


def start_event_pipeline() -> None:
    global _task
    if _task is None or _task.done():
        _task = asyncio.create_task(_loop())


# Backward-compat aliases
start_flash_bet_generator = start_event_pipeline
start_demo_auto_events = start_event_pipeline
