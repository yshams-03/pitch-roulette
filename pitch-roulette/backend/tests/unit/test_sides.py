"""Unit tests for side assignment."""
import pytest

from services.sides import (
    apply_underdog_bonus,
    assign_room_sides,
    assign_sides,
    can_swap,
    count_sides,
    swap_side,
)


@pytest.fixture
def sides_db(fake_db, monkeypatch):
    monkeypatch.setattr("services.sides.get_supabase", lambda: fake_db)
    monkeypatch.setattr("services.pitch_chips.get_supabase", lambda: fake_db)
    return fake_db


class TestAssignSides:
    def test_balanced_even(self):
        m = assign_sides(["a", "b", "c", "d"])
        assert len(m) == 4
        assert sum(1 for v in m.values() if v == "HOME") == 2

    def test_balanced_odd(self):
        m = assign_sides(["a", "b", "c"])
        assert sum(1 for v in m.values() if v == "HOME") == 2

    def test_assigned_on_room(self, sides_db):
        assign_room_sides("room-1")
        players = sides_db.tables["room_players"]
        assert all(p.get("assigned_side") in ("HOME", "AWAY") for p in players)


class TestUnderdog:
    def test_bonus_minority(self, sides_db):
        sides_db.tables["room_players"][0]["assigned_side"] = "HOME"
        sides_db.tables["room_players"][1]["assigned_side"] = "HOME"
        sides_db.tables["room_players"].append({
            "id": "rp-3", "room_id": "room-1", "user_id": "player-3",
            "is_host": False, "session_pc": 100, "assigned_side": "AWAY",
        })
        n = apply_underdog_bonus("room-1")
        assert n == 1
        away_player = next(p for p in sides_db.tables["room_players"] if p.get("assigned_side") == "AWAY")
        assert away_player["session_pc"] == 120

    def test_no_bonus_equal(self, sides_db):
        sides_db.tables["room_players"][0]["assigned_side"] = "HOME"
        sides_db.tables["room_players"][1]["assigned_side"] = "HOME"
        n = apply_underdog_bonus("room-1")
        assert n == 0


class TestSwap:
    def test_swap_improves_balance(self, sides_db):
        sides_db.tables["room_players"][0]["assigned_side"] = "HOME"
        sides_db.tables["room_players"][1]["assigned_side"] = "HOME"
        ok, _ = can_swap("room-1", "host-user")
        assert ok

    def test_swap_rejected_worsens(self, sides_db):
        sides_db.tables["room_players"][0]["assigned_side"] = "HOME"
        sides_db.tables["room_players"][1]["assigned_side"] = "AWAY"
        ok, reason = can_swap("room-1", "host-user")
        assert not ok
        assert reason == "swap_would_unbalance"

    def test_swap_deducts_on_rejection(self, sides_db):
        sides_db.tables["room_players"][0]["assigned_side"] = "HOME"
        sides_db.tables["room_players"][1]["assigned_side"] = "AWAY"
        with pytest.raises(ValueError, match="swap_would_unbalance"):
            swap_side("room-1", "host-user")
        assert sides_db.tables["room_players"][0]["session_pc"] == 80
