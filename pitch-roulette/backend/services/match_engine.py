"""Unified match simulation engine — demo, manual, and live API rooms."""
from __future__ import annotations

import random
from abc import ABC, abstractmethod
from datetime import datetime, timezone
from typing import Literal

from database import get_supabase
from services.codes import unique_room_code
from services.flash_bets import (
    DEMO_FLASH_WINDOW_SECONDS,
    create_auto_flash_bet,
    list_flash_bets,
    resolve_flash_bet,
)
from services.points import close_room_and_award

DEMO_MATCH_ID = "demo-sandbox"
DEMO_ESPN_ID = "demo-espn-1"
SIMULATION_CLEANUP_MINUTES = 10

MatchSource = Literal["live_api", "demo_simulation", "manual"]

EVENT_QUESTIONS: dict[str, tuple[str, list[str]]] = {
    "GOAL": ("Next goal within 10 minutes?", ["Yes", "No"]),
    "YELLOW_CARD": ("Another yellow card before full time?", ["Yes", "No"]),
    "RED_CARD": ("Will there be another red card?", ["Yes", "No"]),
    "PENALTY": ("Next penalty scored?", ["Yes", "No"]),
}

INJECT_TO_FLASH: dict[str, str] = {
    "GOAL_HOME": "GOAL",
    "GOAL_AWAY": "GOAL",
    "YELLOW_CARD": "YELLOW_CARD",
    "RED_CARD": "RED_CARD",
    "PENALTY_SCORED": "PENALTY",
    "PENALTY_MISSED": "PENALTY",
}

RANDOM_EVENT_TYPES = list(INJECT_TO_FLASH.keys())


def infer_match_source(room: dict) -> MatchSource:
    src = room.get("match_source")
    if src in ("live_api", "demo_simulation", "manual"):
        return src
    match_data = room.get("match_data") or {}
    espn_id = str(room.get("espn_event_id") or "")
    if (
        match_data.get("demo")
        or room.get("match_id") == DEMO_MATCH_ID
        or espn_id.startswith("demo-")
    ):
        return "demo_simulation"
    return "live_api"


def is_simulation_room(room: dict) -> bool:
    return infer_match_source(room) in ("demo_simulation", "manual")


def is_legacy_demo_room(room: dict) -> bool:
    """Backward-compat alias."""
    return infer_match_source(room) == "demo_simulation"


def _simulation_payload(room: dict) -> dict:
    sim = room.get("match_simulation_json")
    if isinstance(sim, dict) and sim:
        return dict(sim)
    return dict(room.get("match_data") or {})


class MatchSimulation(ABC):
    def __init__(self, room: dict):
        self.room = room
        self._state = _simulation_payload(room)

    @abstractmethod
    def default_teams(self) -> tuple[str, str]:
        ...

    def get_state(self) -> dict:
        return dict(self._state)

    def get_score(self) -> tuple[int, int]:
        return (
            int(self._state.get("home_goals", 0)),
            int(self._state.get("away_goals", 0)),
        )

    def get_events(self) -> list[dict]:
        return list(self._state.get("events_log") or [])

    def to_match_data(self) -> dict:
        home, away = self.default_teams()
        out = dict(self._state)
        out.setdefault("home_team", home)
        out.setdefault("away_team", away)
        out.setdefault("home_goals", 0)
        out.setdefault("away_goals", 0)
        out.setdefault("events_log", [])
        return out

    def persist(self, extra: dict | None = None) -> dict:
        from services.db_compat import room_update_payload

        db = get_supabase()
        match_data = self.to_match_data()
        sim_json = {
            **match_data,
            "events_log": list(match_data.get("events_log") or []),
        }
        update: dict = {
            "match_data": match_data,
            "match_simulation_json": sim_json,
        }
        if extra:
            update.update(extra)
        return db.table("rooms").update(room_update_payload(update)).eq("id", self.room["id"]).execute().data[0]


class DemoMatchSimulation(MatchSimulation):
    def default_teams(self) -> tuple[str, str]:
        return ("France", "Netherlands")

    @staticmethod
    def base_match_data(*, live: bool = False) -> dict:
        now = datetime.now(timezone.utc)
        kickoff = now.replace(hour=18, minute=0, second=0, microsecond=0).isoformat()
        home, away = "France", "Netherlands"
        if live:
            return {
                "id": DEMO_MATCH_ID,
                "espn_event_id": DEMO_ESPN_ID,
                "home_team": home,
                "away_team": away,
                "home_logo": None,
                "away_logo": None,
                "kickoff": kickoff,
                "status": "1H",
                "status_label": "Live",
                "minute": 1,
                "home_goals": 0,
                "away_goals": 0,
                "group_name": "Group A",
                "venue": "Demo Stadium",
                "is_live": True,
                "source": "demo_simulation",
                "demo": True,
                "events_log": [],
            }
        return {
            "id": DEMO_MATCH_ID,
            "espn_event_id": DEMO_ESPN_ID,
            "home_team": home,
            "away_team": away,
            "home_logo": None,
            "away_logo": None,
            "kickoff": kickoff,
            "status": "SCHEDULED",
            "status_label": "Scheduled",
            "minute": 0,
            "home_goals": 0,
            "away_goals": 0,
            "group_name": "Group A",
            "venue": "Demo Stadium",
            "is_live": False,
            "source": "demo_simulation",
            "demo": True,
            "events_log": [],
        }

    def live_state_from_room(self) -> dict:
        existing = self._state
        data = {**self.base_match_data(live=True), **existing}
        home, away = self.default_teams()
        data.update({
            "home_team": home,
            "away_team": away,
            "status": "1H",
            "status_label": "Live",
            "minute": max(1, int(existing.get("minute") or 1)) if existing.get("events_log") else 1,
            "is_live": True,
            "demo": True,
            "events_log": list(existing.get("events_log") or []),
        })
        if not existing.get("events_log"):
            data["home_goals"] = 0
            data["away_goals"] = 0
            data["minute"] = 1
        self._state = data
        return data

    def inject_event(self, event_type: str, *, source: str = "demo_random") -> dict:
        if event_type not in INJECT_TO_FLASH:
            raise ValueError("invalid_event_type")

        home_team, away_team = self.default_teams()
        self._state = {**self.base_match_data(live=True), **self._state}
        minute = int(self._state.get("minute") or 0) + 1
        self._state["minute"] = minute

        if event_type == "GOAL_HOME":
            self._state["home_goals"] = int(self._state.get("home_goals", 0)) + 1
        elif event_type == "GOAL_AWAY":
            self._state["away_goals"] = int(self._state.get("away_goals", 0)) + 1

        flash_type = INJECT_TO_FLASH[event_type]
        event_key = (
            f"sim-{event_type.lower()}-{minute}-"
            f"{self._state['home_goals']}-{self._state['away_goals']}"
        )

        log = list(self._state.get("events_log") or [])
        event = {
            "type": event_type,
            "minute": minute,
            "home_goals": self._state["home_goals"],
            "away_goals": self._state["away_goals"],
            "event_key": event_key,
            "at": datetime.now(timezone.utc).isoformat(),
            "source": source,
        }
        from services.draft import demo_player_for_event
        pid = demo_player_for_event(event_type)
        if pid:
            event["player_id"] = pid
        log.append(event)
        self._state["events_log"] = log[-20:]
        self._state["home_team"] = home_team
        self._state["away_team"] = away_team
        self._state["demo"] = True

        q, opts = EVENT_QUESTIONS[flash_type]
        bet = create_auto_flash_bet(
            self.room["id"], q, opts, flash_type, event_key,
            window_seconds=DEMO_FLASH_WINDOW_SECONDS,
        )

        updated = self.persist({
            "last_seen_event_key": event_key,
        })
        _record_room_event(self.room["id"], event)

        return {"room": updated, "flash_bet": bet, "event": event}


class LiveMatchSimulation(MatchSimulation):
    def default_teams(self) -> tuple[str, str]:
        home = self._state.get("home_team") or "Home"
        away = self._state.get("away_team") or "Away"
        return str(home), str(away)

    def sync_from_external(self, snapshot: dict, fd_live: dict | None = None) -> dict:
        base = fd_live or {}
        merged = {**base, **{k: snapshot[k] for k in snapshot if k != "details"}}
        if base.get("id"):
            merged["id"] = base["id"]
        self._state = merged
        return self.persist()


class ManualMatchSimulation(DemoMatchSimulation):
    """Host-driven simulation on custom fixture metadata."""

    def default_teams(self) -> tuple[str, str]:
        home = self._state.get("home_team") or "Home"
        away = self._state.get("away_team") or "Away"
        return str(home), str(away)


def simulation_for(room: dict) -> MatchSimulation:
    src = infer_match_source(room)
    if src == "live_api":
        return LiveMatchSimulation(room)
    if src == "manual":
        return ManualMatchSimulation(room)
    return DemoMatchSimulation(room)


def normalize_room_match_data(room: dict) -> dict:
    """Repair simulation metadata on every API read."""
    src = infer_match_source(room)
    if src == "live_api":
        return room

    sim = simulation_for(room)
    if isinstance(sim, DemoMatchSimulation):
        state = room.get("state")
        live_states = frozenset({"LIVE", "FULL_TIME"})
        base = DemoMatchSimulation.base_match_data(live=state in live_states)
        merged = {**base, **_simulation_payload(room)}
        home, away = sim.default_teams()
        merged["home_team"] = home
        merged["away_team"] = away
        merged["demo"] = src == "demo_simulation"
        merged.setdefault("home_goals", 0)
        merged.setdefault("away_goals", 0)
        merged.setdefault("minute", 1 if state in live_states else 0)
        merged["is_live"] = state in live_states
        if state in live_states and merged.get("status") == "SCHEDULED":
            merged["status"] = "1H"
        return {**room, "match_data": merged, "match_source": src}

    return {**room, "match_source": src}


def _record_room_event(room_id: str, event: dict) -> None:
    db = get_supabase()
    try:
        db.table("room_events").insert({
            "room_id": room_id,
            "event_key": event.get("event_key"),
            "event_type": event.get("type"),
            "minute": event.get("minute"),
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


def _room_by_code(code: str) -> dict:
    db = get_supabase()
    row = db.table("rooms").select("*").eq("room_code", code.upper()).execute()
    if not row.data:
        raise ValueError("room_not_found")
    return row.data[0]


def _snapshot(room: dict) -> dict:
    from services.room_snapshot import room_snapshot
    return room_snapshot(room)


async def create_simulation_room(
    host_id: str,
    match_source: MatchSource,
    bot_config_json: dict,
    *,
    phase: str = "LOBBY",
    match_data: dict | None = None,
    group_id: str | None = None,
) -> dict:
    from services.bots import join_bots_to_room, seed_bot_predictions
    from services.db_compat import strip_unified_fields

    valid = frozenset({"LOBBY", "PREDICTING", "CLOSED", "LIVE"})
    if phase not in valid:
        raise ValueError("invalid_phase")

    db = get_supabase()
    sim = DemoMatchSimulation({"id": "", "match_data": match_data or {}})
    md = match_data or DemoMatchSimulation.base_match_data(live=phase == "LIVE")
    code = unique_room_code()

    room = db.table("rooms").insert(strip_unified_fields({
        "room_code": code,
        "match_id": DEMO_MATCH_ID,
        "match_data": md,
        "match_simulation_json": md,
        "match_source": match_source,
        "bot_config_json": bot_config_json,
        "espn_event_id": DEMO_ESPN_ID,
        "host_id": host_id,
        "group_id": group_id,
        "state": phase,
        "last_seen_event_key": None,
    })).execute().data[0]

    host_row = db.table("room_players").insert({
        "room_id": room["id"],
        "user_id": host_id,
        "is_host": True,
        "session_pc": 100,
    }).execute().data[0]
    from services.pitch_chips import ensure_starting_pc
    ensure_starting_pc(room["id"], host_id, host_row["id"])

    join_bots_to_room(room["id"], room, host_id)
    if phase in ("PREDICTING", "CLOSED"):
        seed_bot_predictions(room["id"], room, host_id, DEMO_MATCH_ID)

    return _snapshot(db.table("rooms").select("*").eq("id", room["id"]).execute().data[0])


def go_live_simulation(room: dict) -> dict:
    from services.db_compat import room_update_payload

    sim = simulation_for(room)
    if isinstance(sim, (DemoMatchSimulation, ManualMatchSimulation)):
        match_data = sim.live_state_from_room() if hasattr(sim, "live_state_from_room") else sim.to_match_data()
    else:
        match_data = sim.to_match_data()
    db = get_supabase()
    updated = db.table("rooms").update(room_update_payload({
        "state": "LIVE",
        "match_data": match_data,
        "match_simulation_json": match_data,
    })).eq("id", room["id"]).execute().data[0]
    return updated


def inject_event(code: str, host_id: str, event_type: str, *, source: str = "manual_host") -> dict:
    room = _room_by_code(code)
    if room["host_id"] != host_id:
        raise PermissionError("not_host")
    if room["state"] != "LIVE":
        raise ValueError("room_not_live")
    if infer_match_source(room) == "live_api":
        raise ValueError("live_api_inject_disabled")

    sim = simulation_for(room)
    if not isinstance(sim, (DemoMatchSimulation, ManualMatchSimulation)):
        raise ValueError("not_simulation_room")
    result = sim.inject_event(event_type, source=source)
    result["room"] = _snapshot(result["room"])
    return result


def inject_random_event(code: str, host_id: str, *, source: str = "demo_random") -> dict:
    return inject_event(code, host_id, random.choice(RANDOM_EVENT_TYPES), source=source)


def fast_forward_event(code: str, host_id: str) -> dict:
    room = _room_by_code(code)
    if room["host_id"] != host_id:
        raise PermissionError("not_host")
    if room["state"] != "LIVE":
        raise ValueError("room_not_live")

    bets = list_flash_bets(code)
    active = next((b for b in bets if b["state"] in ("OPEN", "LOCKED")), None)
    if active:
        opts = active.get("options") or ["Yes", "No"]
        if isinstance(opts, list) and opts:
            resolve_active_bet(code, host_id, random.choice([str(o) for o in opts]))

    return inject_random_event(code, host_id, source="manual_host")


def resolve_active_bet(code: str, host_id: str, correct_option: str) -> dict:
    room = _room_by_code(code)
    bets = list_flash_bets(code)
    target = next((b for b in bets if b["state"] in ("OPEN", "LOCKED")), None)
    if not target:
        raise ValueError("no_active_bet")
    return resolve_flash_bet(code, target["id"], host_id, correct_option)


def mark_simulation_ended(room_id: str) -> None:
    from services.db_compat import has_unify_migration, room_update_payload

    db = get_supabase()
    cols = "match_data, match_simulation_json" if has_unify_migration() else "match_data"
    row = db.table("rooms").select(cols).eq("id", room_id).execute()
    if not row.data:
        return
    r = row.data[0]
    data = dict(r.get("match_data") or {})
    data["simulation_ended_at"] = datetime.now(timezone.utc).isoformat()
    update: dict = {"match_data": data}
    if has_unify_migration():
        update["match_simulation_json"] = data
    db.table("rooms").update(room_update_payload(update)).eq("id", room_id).execute()


def cleanup_abandoned_live_demo_rooms(max_age_minutes: int = 30) -> int:
    """End stale LIVE demo rooms left behind by E2E / dev sessions."""
    from services.db_compat import fetch_live_rooms

    db = get_supabase()
    rows = fetch_live_rooms(db)
    now = datetime.now(timezone.utc)
    closed = 0
    for room in rows:
        if not is_simulation_room(room):
            continue
        created_raw = room.get("created_at")
        if not created_raw:
            continue
        try:
            created = datetime.fromisoformat(str(created_raw).replace("Z", "+00:00"))
            if created.tzinfo is None:
                created = created.replace(tzinfo=timezone.utc)
        except ValueError:
            continue
        if (now - created).total_seconds() < max_age_minutes * 60:
            continue
        db.table("rooms").update({"state": "RESULTS"}).eq("id", room["id"]).execute()
        closed += 1
    return closed


def cleanup_stale_simulation_rooms() -> int:
    from services.db_compat import fetch_results_rooms

    db = get_supabase()
    rows = fetch_results_rooms(db)
    removed = 0
    now = datetime.now(timezone.utc)
    for room in rows:
        if not is_simulation_room(room):
            continue
        sim = room.get("match_simulation_json") or room.get("match_data") or {}
        ended_raw = sim.get("simulation_ended_at") or sim.get("demo_ended_at")
        if not ended_raw:
            continue
        try:
            ended = datetime.fromisoformat(ended_raw.replace("Z", "+00:00"))
            if ended.tzinfo is None:
                ended = ended.replace(tzinfo=timezone.utc)
        except ValueError:
            continue
        if (now - ended).total_seconds() < SIMULATION_CLEANUP_MINUTES * 60:
            continue
        db.table("rooms").delete().eq("id", room["id"]).execute()
        removed += 1
    return removed


async def end_simulation_room(code: str, host_id: str) -> dict:
    room = _room_by_code(code)
    if room["host_id"] != host_id:
        raise PermissionError("not_host")
    sim_data = _simulation_payload(room)
    home = int(sim_data.get("home_goals", 0))
    away = int(sim_data.get("away_goals", 0))
    results = await close_room_and_award(room["id"], home, away)
    mark_simulation_ended(room["id"])
    updated = get_supabase().table("rooms").select("*").eq("id", room["id"]).execute().data[0]
    return {"room": _snapshot(updated), "results": results, "actual_score": {"home": home, "away": away}}


def room_status(code: str) -> dict:
    room = _room_by_code(code)
    snap = _snapshot(room)
    bets = list_flash_bets(code)
    events = (_simulation_payload(room).get("events_log") or [])
    return {"room": snap, "flash_bets": bets, "events_log": events}
