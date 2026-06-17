"""Unit tests for match engine."""
from unittest.mock import MagicMock, patch

import pytest

from services.match_engine import (
    DemoMatchSimulation,
    infer_match_source,
    is_simulation_room,
    normalize_room_match_data,
)


class TestInferMatchSource:
    def test_explicit_demo_simulation(self):
        room = {"match_source": "demo_simulation", "match_id": "x"}
        assert infer_match_source(room) == "demo_simulation"

    def test_legacy_demo_flag(self):
        room = {"match_data": {"demo": True}, "match_id": "other"}
        assert infer_match_source(room) == "demo_simulation"

    def test_legacy_demo_match_id(self):
        room = {"match_id": "demo-sandbox"}
        assert infer_match_source(room) == "demo_simulation"

    def test_live_api_default(self):
        room = {"match_id": "12345", "match_data": {}}
        assert infer_match_source(room) == "live_api"


class TestIsSimulationRoom:
    def test_demo_is_simulation(self):
        assert is_simulation_room({"match_source": "demo_simulation"}) is True

    def test_live_is_not_simulation(self):
        assert is_simulation_room({"match_source": "live_api"}) is False


class TestNormalizeRoomMatchData:
    def test_repairs_demo_teams(self):
        room = {
            "match_source": "demo_simulation",
            "state": "LIVE",
            "match_data": {"home_team": "T", "away_team": "T"},
        }
        out = normalize_room_match_data(room)
        assert out["match_data"]["home_team"] == "France"
        assert out["match_data"]["away_team"] == "Netherlands"


class TestDemoMatchSimulation:
    @patch("services.match_engine.create_auto_flash_bet")
    @patch("services.match_engine._record_room_event")
    def test_goal_home_increments_score(self, _record, mock_bet, fake_db, monkeypatch):
        monkeypatch.setattr("services.match_engine.get_supabase", lambda: fake_db)
        mock_bet.return_value = {"id": "fb-1", "state": "OPEN"}
        room = fake_db.tables["rooms"][0]
        sim = DemoMatchSimulation(room)
        result = sim.inject_event("GOAL_HOME", source="demo_random")

        assert result["event"]["home_goals"] == 1
        assert result["event"]["away_goals"] == 0
        assert result["event"]["type"] == "GOAL_HOME"
        mock_bet.assert_called_once()

    def test_invalid_event_raises(self, fake_db):
        sim = DemoMatchSimulation(fake_db.tables["rooms"][0])
        with pytest.raises(ValueError, match="invalid_event_type"):
            sim.inject_event("OFFSIDE")
