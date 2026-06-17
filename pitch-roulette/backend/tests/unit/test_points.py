"""Unit tests for PP calculation."""
from services.points import actual_outcome, calculate_points


class TestActualOutcome:
    def test_home_win(self):
        assert actual_outcome(2, 1) == "HOME_WIN"

    def test_draw(self):
        assert actual_outcome(1, 1) == "DRAW"

    def test_away_win(self):
        assert actual_outcome(0, 2) == "AWAY_WIN"


class TestCalculatePoints:
    def test_exact_score_three_points(self):
        pts, correct, exact, streak = calculate_points(
            2, 1, "HOME_WIN", 2, 1, False, 0,
        )
        assert pts == 3.0
        assert correct is True
        assert exact is True
        assert streak == 1

    def test_outcome_only_one_point(self):
        pts, correct, exact, _ = calculate_points(
            3, 0, "HOME_WIN", 2, 1, False, 0,
        )
        assert pts == 1.0
        assert correct is True
        assert exact is False

    def test_first_submission_bonus(self):
        pts, _, exact, _ = calculate_points(
            2, 1, "HOME_WIN", 2, 1, True, 0,
        )
        assert exact is True
        assert pts == 3.5

    def test_streak_doubles_outcome_points(self):
        pts, correct, exact, streak = calculate_points(
            3, 0, "HOME_WIN", 2, 0, False, 2,
        )
        assert correct is True
        assert exact is False
        assert pts == 2.0
        assert streak == 3

    def test_wrong_prediction_zero(self):
        pts, correct, exact, streak = calculate_points(
            0, 2, "AWAY_WIN", 2, 1, False, 5,
        )
        assert pts == 0.0
        assert correct is False
        assert exact is False
        assert streak == 0
