"""Realistic mock data when API + cache are unavailable."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

NOW = datetime.now(timezone.utc)


def mock_standings(competition: str) -> dict:
    groups = {
        "A": ["France", "Netherlands", "Senegal", "Ecuador"],
        "B": ["England", "USA", "Iran", "Wales"],
        "C": ["Argentina", "Poland", "Mexico", "Saudi Arabia"],
        "D": ["Belgium", "Croatia", "Morocco", "Japan"],
        "E": ["Brazil", "Switzerland", "Serbia", "Cameroon"],
        "F": ["Germany", "Spain", "Costa Rica", "Canada"],
        "G": ["Portugal", "Uruguay", "South Korea", "Ghana"],
        "H": ["Italy", "Australia", "Denmark", "Tunisia"],
    }
    rows = []
    for group, teams in groups.items():
        group_rows = []
        for i, team in enumerate(teams):
            played = 2 if group in ("A", "B") else 1
            won = max(0, (2 if played == 2 else 1) - i)
            draw = 1 if i == 1 and played == 2 else 0
            lost = played - won - draw
            gf = won * 2 + draw
            ga = lost + draw
            group_rows.append({
                "team": team,
                "team_logo": None,
                "played": played,
                "won": won,
                "draw": draw,
                "lost": lost,
                "goals_for": gf,
                "goals_against": ga,
                "goal_diff": gf - ga,
                "points": won * 3 + draw,
                "group": group,
            })
        group_rows.sort(key=lambda r: (-r["points"], -r["goal_diff"], -r["goals_for"]))
        for rank, row in enumerate(group_rows, 1):
            row["rank"] = rank
            rows.append(row)
    return {
        "competition": competition,
        "source": "mock",
        "standings": rows,
        "updated_at": NOW.isoformat(),
    }


def mock_schedule(competition: str) -> dict:
    fixtures = []
    base = NOW.replace(hour=18, minute=0, second=0, microsecond=0)
    pairs = [
        ("France", "Netherlands", "Group A"),
        ("England", "USA", "Group B"),
        ("Argentina", "Poland", "Group C"),
        ("Belgium", "Croatia", "Group D"),
        ("Brazil", "Switzerland", "Group E"),
        ("Germany", "Spain", "Group F"),
        ("Portugal", "Uruguay", "Group G"),
        ("Italy", "Australia", "Group H"),
        ("Senegal", "Ecuador", "Group A"),
        ("Iran", "Wales", "Group B"),
        ("Mexico", "Saudi Arabia", "Group C"),
        ("Morocco", "Japan", "Group D"),
    ]
    for i, (home, away, grp) in enumerate(pairs):
        kickoff = base + timedelta(days=i // 4, hours=(i % 4) * 2 - 2)
        is_live = i < 2
        fixtures.append({
            "id": f"mock-{i + 1}",
            "home_team": home,
            "away_team": away,
            "home_logo": None,
            "away_logo": None,
            "kickoff": kickoff.isoformat(),
            "status": "1H" if is_live else ("FT" if kickoff < NOW - timedelta(hours=3) else "NS"),
            "status_label": "Live" if is_live else ("Full time" if kickoff < NOW - timedelta(hours=3) else "Scheduled"),
            "minute": 37 + i * 8 if is_live else None,
            "home_goals": (1 + (i % 2)) if is_live or kickoff < NOW - timedelta(hours=3) else 0,
            "away_goals": 1 if is_live or kickoff < NOW - timedelta(hours=3) else 0,
            "group_name": grp,
            "venue": "Stadium",
            "is_live": is_live,
        })
    fixtures.sort(key=lambda m: (not m["is_live"], m["kickoff"]))
    return {
        "competition": competition,
        "source": "mock",
        "matches": fixtures,
        "updated_at": NOW.isoformat(),
    }


def mock_live(match_id: str) -> dict:
    return {
        "id": match_id,
        "home_team": "France",
        "away_team": "Netherlands",
        "home_goals": 2,
        "away_goals": 1,
        "status": "2H",
        "status_label": "Live",
        "minute": 78,
        "kickoff": (NOW - timedelta(hours=2)).isoformat(),
        "source": "mock",
    }
