"""Backward-compatible Supabase queries (pre/post migration 002)."""
from __future__ import annotations

from postgrest.exceptions import APIError

_LEGACY_LIVE_COLS = (
    "id, room_code, host_id, match_id, espn_event_id, "
    "match_data, last_seen_event_key, state, created_at"
)
_UNIFIED_LIVE_COLS = (
    f"{_LEGACY_LIVE_COLS}, match_source, match_simulation_json, bot_config_json"
)

_migration_checked = False
_has_unify_migration = True


def _is_missing_column(err: BaseException, column: str) -> bool:
    if not isinstance(err, APIError):
        return False
    msg = str(getattr(err, "message", "")) + str(err)
    return column in msg and ("42703" in msg or "does not exist" in msg)


def has_unify_migration() -> bool:
    global _migration_checked, _has_unify_migration
    if _migration_checked:
        return _has_unify_migration
    from database import get_supabase
    db = get_supabase()
    try:
        db.table("rooms").select("match_source").limit(1).execute()
        _has_unify_migration = True
    except APIError as e:
        if _is_missing_column(e, "match_source"):
            _has_unify_migration = False
        else:
            raise
    _migration_checked = True
    return _has_unify_migration


def fetch_live_rooms(db) -> list[dict]:
    cols = _UNIFIED_LIVE_COLS if has_unify_migration() else _LEGACY_LIVE_COLS
    return db.table("rooms").select(cols).eq("state", "LIVE").execute().data or []


def fetch_results_rooms(db) -> list[dict]:
    if has_unify_migration():
        cols = "id, match_source, match_data, match_simulation_json, state"
    else:
        cols = "id, match_id, match_data, state"
    return db.table("rooms").select(cols).eq("state", "RESULTS").execute().data or []


def strip_unified_fields(payload: dict) -> dict:
    if has_unify_migration():
        return payload
    out = dict(payload)
    for key in ("match_source", "match_simulation_json", "bot_config_json"):
        out.pop(key, None)
    return out


def room_update_payload(payload: dict) -> dict:
    """Strip unified columns from UPDATE payloads when migration 002 is not applied."""
    return strip_unified_fields(payload)
