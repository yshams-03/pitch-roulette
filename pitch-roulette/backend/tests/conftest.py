"""Shared pytest fixtures."""
from __future__ import annotations

import json
import os
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

# CI and local pytest use FakeSupabase — no live Postgres/Supabase required.
# Set safe defaults before the app imports config (backend/.env is not present in CI).
if not os.getenv("DEMO_MODE"):
    os.environ["DEMO_MODE"] = "true"
if not os.getenv("ESPN_ENABLED"):
    os.environ["ESPN_ENABLED"] = "false"
if not os.getenv("MOCK_MODE"):
    os.environ["MOCK_MODE"] = "true"
if not os.getenv("SUPABASE_URL"):
    os.environ["SUPABASE_URL"] = "https://example.supabase.co"
if not os.getenv("SUPABASE_SERVICE_ROLE_KEY"):
    os.environ["SUPABASE_SERVICE_ROLE_KEY"] = "test-service-role-key"

from tests.mocks.fake_supabase import FakeSupabase

FIXTURES = Path(__file__).parent / "fixtures"


@pytest.fixture
def fake_db() -> FakeSupabase:
    db = FakeSupabase()
    db.seed("rooms", [{
        "id": "room-1",
        "room_code": "TEST01",
        "match_id": "demo-sandbox",
        "match_source": "demo_simulation",
        "match_data": {
            "home_team": "France",
            "away_team": "Netherlands",
            "home_goals": 0,
            "away_goals": 0,
            "demo": True,
            "events_log": [],
        },
        "match_simulation_json": {
            "home_team": "France",
            "away_team": "Netherlands",
            "home_goals": 0,
            "away_goals": 0,
            "events_log": [],
        },
        "bot_config_json": {"enabled": True, "count": 3, "difficulty": "medium"},
        "host_id": "host-user",
        "state": "LIVE",
        "chat_enabled": True,
    }])
    db.seed("room_players", [
        {"id": "rp-1", "room_id": "room-1", "user_id": "host-user", "is_host": True, "session_pp": 0},
        {"id": "rp-2", "room_id": "room-1", "user_id": "player-2", "is_host": False, "session_pp": 0},
    ])
    db.seed("profiles", [
        {"id": "host-user", "username": "host", "display_name": "Host", "total_points": 10, "current_streak": 0, "best_streak": 0},
        {"id": "player-2", "username": "p2", "display_name": "Player 2", "total_points": 5, "current_streak": 0, "best_streak": 0},
    ])
    db.seed("flash_bets", [])
    db.seed("flash_bet_answers", [])
    db.seed("predictions", [])
    db.seed("room_messages", [])
    return db


@pytest.fixture
def auth_user_id() -> str:
    return "host-user"


@pytest.fixture
def client(fake_db: FakeSupabase, auth_user_id: str, monkeypatch):
    from config import reload_settings

    reload_settings()
    monkeypatch.setattr("database.get_supabase", lambda: fake_db)
    monkeypatch.setattr("services.flash_bets.get_supabase", lambda: fake_db)
    monkeypatch.setattr("services.room_snapshot.get_supabase", lambda: fake_db)

    from auth import get_current_user_id
    from main import app

    async def _override():
        return auth_user_id

    app.dependency_overrides[get_current_user_id] = _override
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


@pytest.fixture
def espn_snapshot() -> dict:
    return json.loads((FIXTURES / "espn_snapshot.json").read_text(encoding="utf-8"))


@pytest.fixture
def demo_room(fake_db: FakeSupabase) -> dict:
    return fake_db.tables["rooms"][0]
