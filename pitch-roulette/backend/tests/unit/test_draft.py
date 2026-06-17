"""Unit tests for fantasy draft."""
import pytest

from services.draft import (
    auto_assign_remaining,
    demo_player_for_event,
    pick_count,
    pick_player,
    process_draft_event,
    DEMO_SQUAD,
)


@pytest.fixture
def draft_db(fake_db, monkeypatch):
    fake_db.tables["rooms"][0]["state"] = "DRAFTING"
    fake_db.seed("draft_picks", [])
    monkeypatch.setattr("services.draft.get_supabase", lambda: fake_db)
    monkeypatch.setattr("services.pitch_chips.get_supabase", lambda: fake_db)
    return fake_db


class TestDraftPick:
    def test_pick_succeeds(self, draft_db):
        row = pick_player("TEST01", "player-2", DEMO_SQUAD[0]["player_id"])
        assert row["pick_order"] == 1

    def test_pick_limit(self, draft_db):
        for i in range(3):
            pick_player("TEST01", "player-2", DEMO_SQUAD[i]["player_id"])
        with pytest.raises(ValueError, match="pick_limit"):
            pick_player("TEST01", "player-2", DEMO_SQUAD[3]["player_id"])

    def test_player_taken(self, draft_db):
        pick_player("TEST01", "host-user", DEMO_SQUAD[0]["player_id"])
        with pytest.raises(ValueError, match="player_already_taken"):
            pick_player("TEST01", "player-2", DEMO_SQUAD[0]["player_id"])

    def test_auto_assign(self, draft_db):
        n = auto_assign_remaining("room-1")
        assert n >= 3
        assert pick_count("room-1", "player-2") == 3


class TestDraftRewards:
    def test_demo_player_for_goal(self):
        pid = demo_player_for_event("GOAL_HOME")
        assert pid in {p["player_id"] for p in DEMO_SQUAD if p["team"] == "HOME"}

    def test_process_draft_event_goal(self, draft_db):
        pid = DEMO_SQUAD[5]["player_id"]  # Mbappé
        pick_player("TEST01", "player-2", pid)
        process_draft_event("room-1", "GOAL_HOME", pid)
        row = next(p for p in draft_db.tables["draft_picks"] if p["player_id"] == pid)
        assert float(row.get("pc_earned") or 0) == 25.0
