"""Unit tests for sabotage shop logic."""
from datetime import datetime, timedelta, timezone

import pytest

from services.room_messages import post_message
from services.sabotages import (
    SABOTAGE_CATALOG,
    apply_flash_bet_pc_with_sabotage,
    apply_mirror_to_choice,
    purchase_sabotage,
    silence_seconds_remaining,
)
from services.flash_bets import resolve_flash_bet, submit_answer


@pytest.fixture
def sabotage_db(fake_db, monkeypatch):
    monkeypatch.setattr("services.sabotages.get_supabase", lambda: fake_db)
    monkeypatch.setattr("services.pitch_chips.get_supabase", lambda: fake_db)
    monkeypatch.setattr("services.flash_bets.get_supabase", lambda: fake_db)
    monkeypatch.setattr("services.room_messages.get_supabase", lambda: fake_db)
    return fake_db


class TestSabotageCatalog:
    def test_six_types(self):
        assert len(SABOTAGE_CATALOG) == 6


class TestPurchase:
    def test_rejects_self_target(self, sabotage_db):
        with pytest.raises(ValueError, match="cannot_target_self"):
            purchase_sabotage("TEST01", "host-user", "TAX", "host-user")

    def test_rejects_insufficient_pc(self, sabotage_db):
        sabotage_db.tables["room_players"][0]["session_pc"] = 5
        with pytest.raises(ValueError, match="insufficient_pc"):
            purchase_sabotage("TEST01", "host-user", "BLINDFOLD", "player-2")

    def test_tax_transfers_pc(self, sabotage_db):
        purchase_sabotage("TEST01", "host-user", "TAX", "player-2")
        host_pc = next(p["session_pc"] for p in sabotage_db.tables["room_players"] if p["user_id"] == "host-user")
        p2_pc = next(p["session_pc"] for p in sabotage_db.tables["room_players"] if p["user_id"] == "player-2")
        assert host_pc == 80  # 100 - 20 tax cost
        assert p2_pc == 90  # 100 - 10 stolen

    def test_replaces_active_on_target(self, sabotage_db):
        purchase_sabotage("TEST01", "host-user", "JINX", "player-2")
        purchase_sabotage("TEST01", "host-user", "BLINDFOLD", "player-2")
        rows = sabotage_db.tables["sabotages"]
        expired = [r for r in rows if r["state"] == "EXPIRED"]
        active = [r for r in rows if r["state"] == "ACTIVE"]
        assert len(expired) == 1
        assert len(active) == 1
        assert active[0]["sabotage_type"] == "BLINDFOLD"


class TestMirror:
    def test_flips_yes_no(self):
        assert apply_mirror_to_choice("Yes", ["Yes", "No"]) == "No"
        assert apply_mirror_to_choice("No", ["Yes", "No"]) == "Yes"


class TestSilence:
    def test_blocks_chat(self, sabotage_db):
        now = datetime.now(timezone.utc)
        sabotage_db.seed("sabotages", [{
            "id": "sab-1",
            "room_id": "room-1",
            "buyer_id": "host-user",
            "target_id": "player-2",
            "sabotage_type": "SILENCE",
            "pc_cost": 25,
            "state": "ACTIVE",
            "expires_at": (now + timedelta(minutes=2)).isoformat(),
        }])
        with pytest.raises(ValueError, match="silenced"):
            post_message("room-1", "player-2", "hello")

    def test_silence_seconds(self, sabotage_db):
        now = datetime.now(timezone.utc)
        sabotage_db.seed("sabotages", [{
            "id": "sab-1",
            "room_id": "room-1",
            "buyer_id": "host-user",
            "target_id": "player-2",
            "sabotage_type": "SILENCE",
            "pc_cost": 25,
            "state": "ACTIVE",
            "expires_at": (now + timedelta(seconds=90)).isoformat(),
        }])
        assert silence_seconds_remaining("room-1", "player-2") >= 85


class TestFlashBetSabotage:
    def _open_bet(self, sabotage_db):
        now = datetime.now(timezone.utc)
        sabotage_db.seed("flash_bets", [{
            "id": "bet-1",
            "room_id": "room-1",
            "state": "OPEN",
            "options": ["Yes", "No"],
            "locks_at": (now + timedelta(seconds=30)).isoformat(),
            "wager_amount": 10.0,
        }])

    def test_mirror_reverses_answer(self, sabotage_db):
        self._open_bet(sabotage_db)
        sabotage_db.seed("sabotages", [{
            "id": "sab-m",
            "room_id": "room-1",
            "buyer_id": "host-user",
            "target_id": "player-2",
            "sabotage_type": "MIRROR",
            "pc_cost": 35,
            "state": "ACTIVE",
        }])
        ans = submit_answer("TEST01", "bet-1", "player-2", "Yes")
        assert ans["chosen_option"] == "No"

    def test_jinx_doubles_loss(self, sabotage_db):
        self._open_bet(sabotage_db)
        sabotage_db.seed("sabotages", [{
            "id": "sab-j",
            "room_id": "room-1",
            "buyer_id": "host-user",
            "target_id": "player-2",
            "sabotage_type": "JINX",
            "pc_cost": 30,
            "state": "ACTIVE",
        }])
        submit_answer("TEST01", "bet-1", "player-2", "Yes")
        resolve_flash_bet("TEST01", "bet-1", "host-user", "No")
        p2_pc = next(p["session_pc"] for p in sabotage_db.tables["room_players"] if p["user_id"] == "player-2")
        assert p2_pc == 80  # 100 - 20 jinx loss

    def test_double_or_nothing_triple_win(self, sabotage_db):
        self._open_bet(sabotage_db)
        sabotage_db.seed("sabotages", [{
            "id": "sab-d",
            "room_id": "room-1",
            "buyer_id": "host-user",
            "target_id": "player-2",
            "sabotage_type": "DOUBLE_OR_NOTHING",
            "pc_cost": 40,
            "state": "ACTIVE",
        }])
        submit_answer("TEST01", "bet-1", "player-2", "Yes")
        resolve_flash_bet("TEST01", "bet-1", "host-user", "Yes")
        p2_pc = next(p["session_pc"] for p in sabotage_db.tables["room_players"] if p["user_id"] == "player-2")
        assert p2_pc == 130  # 100 + 30 (3×10)


class TestPcWithSabotage:
    def test_jinx_loss_amount(self, sabotage_db):
        apply_flash_bet_pc_with_sabotage(
            "room-1", "player-2", 10.0, False, "bet-1", {"jinx": True},
        )
        p2_pc = next(p["session_pc"] for p in sabotage_db.tables["room_players"] if p["user_id"] == "player-2")
        assert p2_pc == 80
