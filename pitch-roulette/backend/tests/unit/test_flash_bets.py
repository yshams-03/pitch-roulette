"""Unit tests for flash bet logic."""
from datetime import datetime, timedelta, timezone

import pytest

from services.flash_bets import (
    ANSWER_GRACE_SECONDS,
    WAGER_AMOUNTS,
    _match_option,
    _normalize_options,
    _parse_dt,
    submit_answer,
)


class TestFlashBetHelpers:
    def test_normalize_options_defaults(self):
        assert _normalize_options(None) == ["Yes", "No"]

    def test_normalize_options_strips(self):
        assert _normalize_options([" Yes ", "No"]) == ["Yes", "No"]

    def test_match_option_case_insensitive(self):
        opts = ["Yes", "No"]
        assert _match_option("yes", opts) == "Yes"
        assert _match_option("NO", opts) == "No"
        assert _match_option("Maybe", opts) is None

    def test_wager_amounts_tiers(self):
        assert WAGER_AMOUNTS["LOW"] == 5.0
        assert WAGER_AMOUNTS["MEDIUM"] == 10.0
        assert WAGER_AMOUNTS["HIGH"] == 20.0


class TestSubmitAnswerGrace:
    def test_rejects_after_grace_period(self, fake_db, monkeypatch):
        monkeypatch.setattr("services.flash_bets.get_supabase", lambda: fake_db)
        monkeypatch.setattr("services.pitch_chips.get_supabase", lambda: fake_db)
        now = datetime.now(timezone.utc)
        locks_at = (now - timedelta(seconds=ANSWER_GRACE_SECONDS + 2)).isoformat()
        fake_db.seed("flash_bets", [{
            "id": "bet-1",
            "room_id": "room-1",
            "state": "LOCKED",
            "options": ["Yes", "No"],
            "locks_at": locks_at,
            "wager_amount": 10.0,
        }])

        with pytest.raises(ValueError, match="bet_locked"):
            submit_answer("TEST01", "bet-1", "player-2", "Yes")

    def test_accepts_within_grace_period(self, fake_db, monkeypatch):
        monkeypatch.setattr("services.flash_bets.get_supabase", lambda: fake_db)
        monkeypatch.setattr("services.pitch_chips.get_supabase", lambda: fake_db)
        now = datetime.now(timezone.utc)
        locks_at = (now - timedelta(seconds=2)).isoformat()
        fake_db.seed("flash_bets", [{
            "id": "bet-1",
            "room_id": "room-1",
            "state": "LOCKED",
            "options": ["Yes", "No"],
            "locks_at": locks_at,
            "wager_amount": 10.0,
        }])

        ans = submit_answer("TEST01", "bet-1", "player-2", "Yes")
        assert ans["chosen_option"] == "Yes"

    def test_rejects_duplicate_answer(self, fake_db, monkeypatch):
        monkeypatch.setattr("services.flash_bets.get_supabase", lambda: fake_db)
        monkeypatch.setattr("services.pitch_chips.get_supabase", lambda: fake_db)
        now = datetime.now(timezone.utc)
        locks_at = (now + timedelta(seconds=30)).isoformat()
        fake_db.seed("flash_bets", [{
            "id": "bet-1",
            "room_id": "room-1",
            "state": "OPEN",
            "options": ["Yes", "No"],
            "locks_at": locks_at,
            "wager_amount": 10.0,
        }])
        fake_db.seed("flash_bet_answers", [{
            "id": "ans-1",
            "flash_bet_id": "bet-1",
            "user_id": "player-2",
            "chosen_option": "No",
        }])

        with pytest.raises(ValueError, match="already_answered"):
            submit_answer("TEST01", "bet-1", "player-2", "Yes")


class TestParseDt:
    def test_parse_zulu(self):
        dt = _parse_dt("2026-06-17T12:00:00Z")
        assert dt is not None
        assert dt.tzinfo is not None
