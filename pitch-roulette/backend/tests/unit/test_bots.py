"""Unit tests for bot pick logic."""
from services.bots import parse_bot_config, pick_flash_bet_option


class TestBotConfig:
    def test_defaults_when_empty(self):
        cfg = parse_bot_config({})
        assert cfg["enabled"] is False
        assert cfg["count"] == 0

    def test_respects_count(self):
        room = {"bot_config_json": {"enabled": True, "count": 2, "difficulty": "hard"}}
        cfg = parse_bot_config(room)
        assert cfg["count"] == 2
        assert cfg["difficulty"] == "hard"


class TestPickFlashBetOption:
    def test_easy_is_random_among_options(self):
        bot = {"id": "b1", "room_difficulty": "easy"}
        picks = {pick_flash_bet_option(bot, ["Yes", "No"], "bet-1") for _ in range(20)}
        assert picks <= {"Yes", "No"}

    def test_medium_yes_no_bias(self):
        bot = {"id": "b1", "yes_bias": 0.99, "room_difficulty": "medium"}
        assert pick_flash_bet_option(bot, ["Yes", "No"], "stable-bet-id") == "Yes"

    def test_deterministic_per_bet_id(self):
        bot = {"id": "b1", "yes_bias": 0.55, "room_difficulty": "medium"}
        a = pick_flash_bet_option(bot, ["Yes", "No"], "bet-abc")
        b = pick_flash_bet_option(bot, ["Yes", "No"], "bet-abc")
        assert a == b
