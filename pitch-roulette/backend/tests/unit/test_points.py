"""Unit tests for PP calculation."""
from services.points import (
    actual_outcome,
    calculate_prediction_pp,
    calculate_points,
)


class TestActualOutcome:
    def test_home_win(self):
        assert actual_outcome(2, 1) == "HOME_WIN"

    def test_draw(self):
        assert actual_outcome(1, 1) == "DRAW"

    def test_away_win(self):
        assert actual_outcome(0, 2) == "AWAY_WIN"


class TestCalculatePredictionPP:
    def test_exact_score_gives_3pp(self):
        r = calculate_prediction_pp(2, 1, 2, 1, 400, 0, False, False)
        assert r.total_pp == 3.0
        assert r.score_exact is True
        assert r.new_streak == 1

    def test_correct_outcome_gives_1pp(self):
        r = calculate_prediction_pp(3, 0, 2, 1, 400, 0, False, False)
        assert r.total_pp == 1.0
        assert r.outcome_correct is True
        assert r.score_exact is False

    def test_score_diff_correct_gives_2pp(self):
        r = calculate_prediction_pp(3, 1, 2, 0, 400, 0, False, False)
        assert r.total_pp == 2.0
        assert r.score_diff_correct is True

    def test_wrong_prediction_gives_0pp(self):
        r = calculate_prediction_pp(0, 2, 2, 1, 400, 5, False, False)
        assert r.total_pp == 0.0
        assert r.new_streak == 0

    def test_early_bonus_within_60s(self):
        r = calculate_prediction_pp(2, 1, 2, 1, 45, 0, False, False)
        assert r.early_bonus == 0.5
        assert r.total_pp == 3.5

    def test_early_bonus_within_2min(self):
        r = calculate_prediction_pp(2, 1, 2, 1, 90, 0, False, False)
        assert r.early_bonus == 0.25
        assert r.total_pp == 3.25

    def test_no_early_bonus_after_5min(self):
        r = calculate_prediction_pp(2, 1, 2, 1, 400, 0, False, False)
        assert r.early_bonus == 0.0

    def test_streak_2_multiplier_1_2(self):
        r = calculate_prediction_pp(3, 0, 2, 0, 400, 1, False, False)
        assert r.streak_multiplier == 1.2
        assert r.total_pp == 1.2

    def test_streak_3_multiplier_1_5(self):
        r = calculate_prediction_pp(3, 0, 2, 0, 400, 2, False, False)
        assert r.streak_multiplier == 1.5
        assert r.total_pp == 1.5

    def test_streak_5_plus_caps_at_2x(self):
        r = calculate_prediction_pp(2, 0, 3, 0, 400, 4, False, False)
        assert r.streak_multiplier == 2.0
        assert r.total_pp == 2.0

    def test_streak_resets_on_wrong(self):
        r = calculate_prediction_pp(0, 2, 2, 1, 400, 5, False, False)
        assert r.new_streak == 0

    def test_underdog_bonus_awarded(self):
        r = calculate_prediction_pp(2, 1, 2, 1, 400, 0, True, True)
        assert r.underdog_bonus == 1.0
        assert r.total_pp == 4.0

    def test_underdog_bonus_not_awarded_when_equal(self):
        r = calculate_prediction_pp(2, 1, 2, 1, 400, 0, False, True)
        assert r.underdog_bonus == 0.0


class TestCalculatePointsCompat:
    def test_first_submission_bonus_compat(self):
        pts, _, exact, _ = calculate_points(2, 1, "HOME_WIN", 2, 1, True, 0)
        assert exact is True
        assert pts == 3.5

    def test_streak_compat(self):
        pts, correct, _, streak = calculate_points(3, 0, "HOME_WIN", 2, 0, False, 2)
        assert correct is True
        assert pts == 1.5
        assert streak == 3
