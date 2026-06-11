"""
Test Scenario: Egypt vs Belgium
Full match simulation for solo developer testing.
"""
from __future__ import annotations

from typing import Optional

DEFAULT_SPEED = 5.0

EGYPT_LINEUP = [
    {"api_player_id": 901, "name": "Mohamed El-Shenawy", "position": "Goalkeeper", "number": 1, "rating": 7.1, "threat": 2},
    {"api_player_id": 902, "name": "Ahmed Hegazi", "position": "Defender", "number": 3, "rating": 6.8, "threat": 2},
    {"api_player_id": 903, "name": "Omar Kamal", "position": "Defender", "number": 5, "rating": 6.7, "threat": 2},
    {"api_player_id": 904, "name": "Mohamed Abdel-Shafy", "position": "Defender", "number": 2, "rating": 6.5, "threat": 1},
    {"api_player_id": 905, "name": "Ahmed Sayed", "position": "Defender", "number": 22, "rating": 6.4, "threat": 1},
    {"api_player_id": 906, "name": "Tarek Hamed", "position": "Midfielder", "number": 8, "rating": 7.0, "threat": 3},
    {"api_player_id": 907, "name": "Amr El-Sulaya", "position": "Midfielder", "number": 18, "rating": 6.9, "threat": 2},
    {"api_player_id": 908, "name": "Omar Marmoush", "position": "Midfielder", "number": 7, "rating": 8.1, "threat": 5},
    {"api_player_id": 909, "name": "Trezeguet", "position": "Forward", "number": 11, "rating": 7.4, "threat": 4},
    {"api_player_id": 910, "name": "Mohamed Salah", "position": "Forward", "number": 10, "rating": 9.2, "threat": 5},
    {"api_player_id": 911, "name": "Mostafa Mohamed", "position": "Forward", "number": 9, "rating": 7.1, "threat": 3},
]

BELGIUM_LINEUP = [
    {"api_player_id": 801, "name": "Koen Casteels", "position": "Goalkeeper", "number": 1, "rating": 7.4, "threat": 3},
    {"api_player_id": 802, "name": "Timothy Castagne", "position": "Defender", "number": 2, "rating": 7.1, "threat": 3},
    {"api_player_id": 803, "name": "Wout Faes", "position": "Defender", "number": 4, "rating": 6.9, "threat": 2},
    {"api_player_id": 804, "name": "Jan Vertonghen", "position": "Defender", "number": 5, "rating": 7.0, "threat": 2},
    {"api_player_id": 805, "name": "Alexis Saelemaekers", "position": "Defender", "number": 15, "rating": 6.8, "threat": 2},
    {"api_player_id": 806, "name": "Amadou Onana", "position": "Midfielder", "number": 8, "rating": 7.6, "threat": 4},
    {"api_player_id": 807, "name": "Youri Tielemans", "position": "Midfielder", "number": 6, "rating": 7.8, "threat": 4},
    {"api_player_id": 808, "name": "Johan Bakayoko", "position": "Midfielder", "number": 11, "rating": 7.5, "threat": 4},
    {"api_player_id": 809, "name": "Kevin De Bruyne", "position": "Forward", "number": 7, "rating": 9.0, "threat": 5},
    {"api_player_id": 810, "name": "Romelu Lukaku", "position": "Forward", "number": 9, "rating": 8.4, "threat": 5},
    {"api_player_id": 811, "name": "Lois Openda", "position": "Forward", "number": 19, "rating": 7.7, "threat": 4},
]

SQUAD_STRENGTH_EGYPT = 7.2
SQUAD_STRENGTH_BELGIUM = 7.7
HANDICAP_ACTIVE = True
TEST_MATCH_ID = "TEST_EGY_BEL"
FINAL_SCORE_A = 1
FINAL_SCORE_B = 2

ALL_PLAYERS = EGYPT_LINEUP + BELGIUM_LINEUP
PLAYER_RATINGS = {p["api_player_id"]: p["rating"] for p in ALL_PLAYERS}


def top_fantasy_player_ids(count: int = 11) -> list[int]:
    ranked = sorted(ALL_PLAYERS, key=lambda p: p["rating"], reverse=True)
    return [p["api_player_id"] for p in ranked[:count]]


def picks_for_ids(ids: list[int]) -> list[dict]:
    player_map = {p["api_player_id"]: p for p in ALL_PLAYERS}
    return [
        {
            "api_player_id": pid,
            "player_name": player_map[pid]["name"],
            "position": player_map[pid]["position"],
            "initial_rating": player_map[pid]["rating"],
        }
        for pid in ids
        if pid in player_map
    ]

BOTS = [
    {
        "nickname": "KingFarouk_Bot",
        "team": "A",
        "personality": "aggressive",
        "fantasy_picks": [910, 908, 909],
    },
    {
        "nickname": "BrusselsBot",
        "team": "B",
        "personality": "conservative",
        "fantasy_picks": [809, 810, 807],
    },
    {
        "nickname": "ChaosAgent_Bot",
        "team": "B",
        "personality": "chaotic",
        "fantasy_picks": [809, 808, 811],
    },
]

MATCH_SCRIPT = [
    {"delay_seconds": 30, "type": "system_message", "payload": {"content": "KICKOFF! Egypt vs Belgium - The Pharaohs vs The Red Devils. Let's go!"}},
    {"delay_seconds": 60, "type": "card", "payload": {"team": "Belgium", "team_key": "B", "player_id": 804, "player_name": "Jan Vertonghen", "card": "Yellow", "minute": 7}},
    {"delay_seconds": 62, "type": "flash_bet", "payload": {"bet_type": "PULSE", "event_label": "Yellow Card issued! Will another follow in the next 10 minutes?", "options": {"option_a": {"label": "Yes - another yellow", "multiplier": 2.5}, "option_b": {"label": "No yellow", "multiplier": 1.5}}, "winning_option": "option_b", "resolve_after_seconds": 18}, "bot_bets": {"KingFarouk_Bot": {"option": "option_a", "amount": 300}, "BrusselsBot": {"option": "option_b", "amount": 100}, "ChaosAgent_Bot": {"option": "option_a", "amount": 450}}},
    {"delay_seconds": 180, "type": "var_review", "payload": {"minute": 18, "description": "VAR review - possible offside in Egypt attack", "result": "stands"}},
    {"delay_seconds": 182, "type": "flash_bet", "payload": {"bet_type": "VAR_REVIEW", "event_label": "VAR Review - Possible Egypt offside. What's the call?", "options": {"option_a": {"label": "Decision Stands", "multiplier": 1.8}, "option_b": {"label": "Overturned", "multiplier": 2.1}}, "winning_option": "option_a", "resolve_after_seconds": 18}, "bot_bets": {"KingFarouk_Bot": {"option": "option_b", "amount": 200}, "BrusselsBot": {"option": "option_a", "amount": 150}, "ChaosAgent_Bot": {"option": "option_b", "amount": 350}}},
    {"delay_seconds": 300, "type": "goal", "payload": {"team": "Belgium", "team_key": "B", "player_id": 810, "player_name": "Romelu Lukaku", "assist_player_id": 809, "assist_name": "Kevin De Bruyne", "minute": 27, "score_a": 0, "score_b": 1}},
    {"delay_seconds": 303, "type": "flash_bet", "payload": {"bet_type": "PULSE", "event_label": "GOAL Belgium! Will Egypt respond before half time?", "options": {"option_a": {"label": "Egypt score before HT", "multiplier": 2.5}, "option_b": {"label": "Belgium lead at HT", "multiplier": 1.5}}, "winning_option": "option_b", "resolve_after_seconds": 18}, "bot_bets": {"KingFarouk_Bot": {"option": "option_a", "amount": 400}, "BrusselsBot": {"option": "option_b", "amount": 200}, "ChaosAgent_Bot": {"option": "option_a", "amount": 250}}},
    {"delay_seconds": 400, "type": "momentum_shift", "payload": {"minute": 35, "possession_a": 65, "possession_b": 35, "description": "Egypt have completely taken over possession"}},
    {"delay_seconds": 402, "type": "flash_bet", "payload": {"bet_type": "MOMENTUM", "event_label": "Momentum Shift! Egypt dominating (65% possession). Will they score in the next 15 mins?", "options": {"option_a": {"label": "Egypt score", "multiplier": 2.2}, "option_b": {"label": "Momentum fades", "multiplier": 2.0}}, "winning_option": "option_a", "resolve_after_seconds": 18}, "bot_bets": {"KingFarouk_Bot": {"option": "option_a", "amount": 200}, "BrusselsBot": {"option": "option_b", "amount": 100}, "ChaosAgent_Bot": {"option": "option_b", "amount": 200}}},
    {"delay_seconds": 490, "type": "penalty_awarded", "payload": {"team": "Egypt", "team_key": "A", "taker_id": 910, "taker_name": "Mohamed Salah", "minute": 41}},
    {"delay_seconds": 492, "type": "flash_bet", "payload": {"bet_type": "PENALTY", "event_label": "PENALTY to Egypt! Mohamed Salah steps up...", "options": {"option_a": {"label": "GOAL", "multiplier": 1.3}, "option_b": {"label": "Goalkeeper Save", "multiplier": 3.5}, "option_c": {"label": "Miss / Post / Bar", "multiplier": 5.0}}, "winning_option": "option_a", "resolve_after_seconds": 18}, "bot_bets": {"KingFarouk_Bot": {"option": "option_a", "amount": 300}, "BrusselsBot": {"option": "option_b", "amount": 150}, "ChaosAgent_Bot": {"option": "option_c", "amount": 500}}},
    {"delay_seconds": 515, "type": "goal", "payload": {"team": "Egypt", "team_key": "A", "player_id": 910, "player_name": "Mohamed Salah", "assist_player_id": None, "assist_name": "Penalty", "minute": 41, "score_a": 1, "score_b": 1}},
    {"delay_seconds": 540, "type": "half_time", "payload": {"score_a": 1, "score_b": 1, "minute": 45}},
    {"delay_seconds": 570, "type": "system_message", "payload": {"content": "SECOND HALF UNDERWAY! Egypt 1-1 Belgium. Everything to play for."}},
    {"delay_seconds": 640, "type": "substitution", "payload": {"team": "Belgium", "team_key": "B", "player_out_id": 811, "player_out_name": "Lois Openda", "player_in_id": 820, "player_in_name": "Jeremy Doku", "minute": 52}},
    {"delay_seconds": 642, "type": "flash_bet", "payload": {"bet_type": "SUPER_SUB", "event_label": "Super Sub Alert! Jeremy Doku enters for Belgium. Shot on target in 10 mins?", "options": {"option_a": {"label": "Shot on target", "multiplier": 5.0}, "option_b": {"label": "No impact", "multiplier": 1.2}}, "winning_option": "option_b", "resolve_after_seconds": 20}, "bot_bets": {"KingFarouk_Bot": {"option": "option_b", "amount": 150}, "BrusselsBot": {"option": "option_a", "amount": 100}, "ChaosAgent_Bot": {"option": "option_a", "amount": 400}}},
    {"delay_seconds": 700, "type": "card", "payload": {"team": "Egypt", "team_key": "A", "player_id": 906, "player_name": "Tarek Hamed", "card": "Red", "minute": 58}},
    {"delay_seconds": 780, "type": "substitution", "payload": {"team": "Egypt", "team_key": "A", "player_out_id": 909, "player_out_name": "Trezeguet", "player_in_id": 921, "player_in_name": "Emam Ashour", "minute": 65}},
    {"delay_seconds": 782, "type": "flash_bet", "payload": {"bet_type": "SUPER_SUB", "event_label": "Super Sub Alert! Emam Ashour enters for Egypt (down to 10 men). Assist or goal in 10 mins?", "options": {"option_a": {"label": "Direct contribution", "multiplier": 5.0}, "option_b": {"label": "No impact", "multiplier": 1.2}}, "winning_option": "option_b", "resolve_after_seconds": 20}, "bot_bets": {"KingFarouk_Bot": {"option": "option_a", "amount": 200}, "BrusselsBot": {"option": "option_b", "amount": 100}, "ChaosAgent_Bot": {"option": "option_a", "amount": 100}}},
    {"delay_seconds": 870, "type": "goal", "payload": {"team": "Belgium", "team_key": "B", "player_id": 809, "player_name": "Kevin De Bruyne", "assist_player_id": None, "assist_name": "Free Kick", "minute": 72, "score_a": 1, "score_b": 2}},
    {"delay_seconds": 873, "type": "flash_bet", "payload": {"bet_type": "PULSE", "event_label": "GOAL Belgium! Can Egypt equalise with 10 men?", "options": {"option_a": {"label": "Egypt equalise", "multiplier": 4.0}, "option_b": {"label": "Belgium hold the lead", "multiplier": 1.3}}, "winning_option": "option_b", "resolve_after_seconds": 18}, "bot_bets": {"KingFarouk_Bot": {"option": "option_a", "amount": 250}, "BrusselsBot": {"option": "option_b", "amount": 200}, "ChaosAgent_Bot": {"option": "option_a", "amount": 300}}},
    {"delay_seconds": 960, "type": "var_review", "payload": {"minute": 78, "description": "VAR reviewing possible Belgium handball - penalty appeal", "result": "overturned"}},
    {"delay_seconds": 962, "type": "flash_bet", "payload": {"bet_type": "VAR_REVIEW", "event_label": "VAR - Possible Belgium handball in the box. Penalty to Egypt?", "options": {"option_a": {"label": "Decision Stands (no pen)", "multiplier": 1.8}, "option_b": {"label": "Penalty to Egypt!", "multiplier": 2.1}}, "winning_option": "option_b", "resolve_after_seconds": 18}, "bot_bets": {"KingFarouk_Bot": {"option": "option_b", "amount": 200}, "BrusselsBot": {"option": "option_a", "amount": 150}, "ChaosAgent_Bot": {"option": "option_b", "amount": 200}}},
    {"delay_seconds": 982, "type": "penalty_awarded", "payload": {"team": "Egypt", "team_key": "A", "taker_id": 910, "taker_name": "Mohamed Salah", "minute": 79}},
    {"delay_seconds": 984, "type": "flash_bet", "payload": {"bet_type": "PENALTY", "event_label": "SECOND PENALTY for Egypt! Salah again - can he make it 2-2?", "options": {"option_a": {"label": "GOAL", "multiplier": 1.3}, "option_b": {"label": "Goalkeeper Save", "multiplier": 3.5}, "option_c": {"label": "Miss / Post / Bar", "multiplier": 5.0}}, "winning_option": "option_c", "resolve_after_seconds": 18}, "bot_bets": {"KingFarouk_Bot": {"option": "option_a", "amount": 300}, "BrusselsBot": {"option": "option_b", "amount": 100}, "ChaosAgent_Bot": {"option": "option_c", "amount": 150}}},
    {"delay_seconds": 1005, "type": "penalty_missed", "payload": {"team": "Egypt", "team_key": "A", "player_id": 910, "player_name": "Mohamed Salah", "minute": 79, "score_a": 1, "score_b": 2}},
    {"delay_seconds": 1050, "type": "substitution", "payload": {"team": "Belgium", "team_key": "B", "player_out_id": 809, "player_out_name": "Kevin De Bruyne", "player_in_id": 821, "player_in_name": "Yannick Carrasco", "minute": 85}},
    {"delay_seconds": 1090, "type": "flash_bet", "payload": {"bet_type": "PULSE", "event_label": "90 minutes up! Will there be 3+ minutes of stoppage time?", "options": {"option_a": {"label": "3+ mins stoppage", "multiplier": 1.4}, "option_b": {"label": "Under 3 mins", "multiplier": 2.8}}, "winning_option": "option_a", "resolve_after_seconds": 15}, "bot_bets": {"KingFarouk_Bot": {"option": "option_a", "amount": 100}, "BrusselsBot": {"option": "option_a", "amount": 100}, "ChaosAgent_Bot": {"option": "option_b", "amount": 200}}},
    {"delay_seconds": 1140, "type": "full_time", "payload": {"score_a": 1, "score_b": 2, "winner": "Belgium"}},
]

BOT_SABOTAGE_SCRIPT = [
    {"delay_seconds": 210, "sender": "KingFarouk_Bot", "target": "BrusselsBot", "token_type": "BLINDFOLD"},
    {"delay_seconds": 410, "sender": "ChaosAgent_Bot", "target": "REAL_PLAYER", "token_type": "TAX_COLLECTOR"},
    {"delay_seconds": 620, "sender": "BrusselsBot", "target": "KingFarouk_Bot", "token_type": "CHAT_SILENCER"},
    {"delay_seconds": 790, "sender": "KingFarouk_Bot", "target": "BrusselsBot", "token_type": "JINX"},
    {"delay_seconds": 940, "sender": "ChaosAgent_Bot", "target": "REAL_PLAYER", "token_type": "MIRROR"},
]


def get_bot_wager(bot: dict, bet: dict) -> Optional[dict]:
    bot_bets = bet.get("bot_bets", {})
    if bot["nickname"] not in bot_bets:
        return None
    return bot_bets[bot["nickname"]]


def _format_team_lineup(players: list[dict], team_name: str) -> dict:
    return {
        "team": team_name,
        "formation": "4-3-3",
        "players": [
            {
                "id": p["api_player_id"],
                "name": p["name"],
                "number": p["number"],
                "pos": p["position"][0].upper(),
                "rating": p["rating"],
            }
            for p in players
        ],
    }


def get_test_lineups_response() -> dict:
    return {
        "available": True,
        "lineups": [
            _format_team_lineup(EGYPT_LINEUP, "Egypt"),
            _format_team_lineup(BELGIUM_LINEUP, "Belgium"),
        ],
        "ssr_a": SQUAD_STRENGTH_EGYPT,
        "ssr_b": SQUAD_STRENGTH_BELGIUM,
        "handicap": {"active": HANDICAP_ACTIVE, "team": "A", "bonus": 0.5},
    }
