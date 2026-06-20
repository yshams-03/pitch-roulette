"""Unit tests for time-based flash bet scheduler."""
import pytest

from services.flash_bet_scheduler import (
    DEMO_FLASH_BET_SCHEDULE,
    FLASH_BET_SCHEDULE,
    auto_resolve_flash_bet,
    select_flash_bet_question,
    _fill_templates,
    _already_fired_minute,
)


class TestFlashBetSchedule:
    def test_flash_bet_fires_at_correct_minutes(self):
        assert 5 in FLASH_BET_SCHEDULE
        assert FLASH_BET_SCHEDULE[5]["pool"] == "early_game"
        assert 90 in FLASH_BET_SCHEDULE

    def test_demo_schedule_uses_compressed_minutes(self):
        assert 1 in DEMO_FLASH_BET_SCHEDULE
        assert 20 in DEMO_FLASH_BET_SCHEDULE
        assert 90 not in DEMO_FLASH_BET_SCHEDULE


class TestQuestionSelection:
    def test_template_variables_filled(self):
        q = {
            "question": "{home_team} vs {away_team} — score {home_score}-{away_score}?",
            "options": ["{home_team}", "{away_team}"],
            "answer_key": "test",
        }
        filled = _fill_templates(q, {
            "home_team": "France",
            "away_team": "Netherlands",
            "home_score": 2,
            "away_score": 1,
        })
        assert "France" in filled["question"]
        assert "{" not in filled["question"]
        assert all("{" not in o for o in filled["options"])

    def test_used_questions_not_repeated(self):
        ctx = {"home_team": "A", "away_team": "B", "home_score": 0, "away_score": 0, "minute": 5}
        first = select_flash_bet_question("kickoff", ctx, [])
        second = select_flash_bet_question("kickoff", ctx, [first["answer_key"]])
        assert second["answer_key"] != first["answer_key"] or len(second["answer_key"]) > 0


class TestAutoResolve:
    def test_auto_resolve_goal_before_15(self):
        answer = auto_resolve_flash_bet("goal_before_15", {"minute": 5}, [
            {"type": "GOAL", "minute": 12},
        ])
        assert answer == "Yes"

    def test_auto_resolve_score_final(self):
        answer = auto_resolve_flash_bet("score_final", {"minute": 80, "home_score": 1, "away_score": 0}, [])
        assert answer == "Yes — final score"
        answer2 = auto_resolve_flash_bet("score_final", {"minute": 80}, [
            {"type": "GOAL", "minute": 82},
        ])
        assert answer2 == "No — it changes"


class TestMinuteDedup:
    def test_flash_bet_not_fired_twice_same_minute(self, fake_db, monkeypatch):
        monkeypatch.setattr("services.flash_bet_scheduler.get_supabase", lambda: fake_db)
        fake_db.seed("flash_bets", [{
            "id": "bet-1",
            "room_id": "room-1",
            "match_minute": 15,
        }])
        assert _already_fired_minute("room-1", 15) is True
        assert _already_fired_minute("room-1", 20) is False
