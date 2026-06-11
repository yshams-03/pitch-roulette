import asyncio
import random
import secrets
import string
from datetime import datetime, timedelta, timezone
from typing import Any

from config import get_settings
from database import get_supabase

VALID_TRANSITIONS = get_settings().VALID_TRANSITIONS

_polling_tasks: dict[str, asyncio.Task] = {}
_bet_transition_tasks: dict[str, list[asyncio.Task]] = {}
_pending_event_bets: dict[str, dict[str, Any]] = {}

DEFAULT_MANUAL_OPTIONS: dict[str, dict] = {
    "PENALTY": {
        "option_a": {"label": "Goal", "multiplier": 1.3},
        "option_b": {"label": "Goalkeeper Save", "multiplier": 3.5},
        "option_c": {"label": "Miss / Off Target / Post", "multiplier": 5.0},
    },
    "MANUAL": {
        "option_a": {"label": "Yes", "multiplier": 2.0},
        "option_b": {"label": "No", "multiplier": 1.5},
    },
    "PULSE": {
        "option_a": {"label": "Next Goal", "multiplier": 2.5},
        "option_b": {"label": "No More Goals", "multiplier": 1.5},
    },
}


def generate_room_code() -> str:
    chars = string.ascii_uppercase + string.digits
    return "".join(secrets.choice(chars) for _ in range(6))


def generate_session_token() -> str:
    return secrets.token_hex(32)


def calculate_switch_penalty(lobby_size: int, custom_override: int | None) -> int:
    if custom_override:
        return max(50, min(500, custom_override))
    if lobby_size <= 4:
        return 250
    elif lobby_size <= 8:
        return 200
    elif lobby_size <= 16:
        return 150
    else:
        return 100


def calculate_underdog_multiplier(count_a: int, count_b: int) -> tuple[str | None, float]:
    total = count_a + count_b
    if total == 0:
        return None, 1.0
    ratio = max(count_a, count_b) / total
    minority_team = "B" if count_a >= count_b else "A"
    if ratio >= 0.70:
        return minority_team, 2.0
    elif ratio >= 0.65:
        return minority_team, 1.7
    elif ratio >= 0.60:
        return minority_team, 1.4
    elif ratio >= 0.55:
        return minority_team, 1.2
    return None, 1.0


def compute_ssr(lineup_players: list[dict]) -> float:
    ratings = []
    for p in lineup_players:
        stats = p.get("statistics", [{}])
        if stats:
            rating = stats[0].get("games", {}).get("rating")
            if rating:
                ratings.append(float(rating))
    return round(sum(ratings) / len(ratings), 1) if ratings else 6.5


def apply_handicap_if_needed(ssr_a: float, ssr_b: float) -> dict:
    diff = abs(ssr_a - ssr_b)
    if diff >= 10:
        weaker = "B" if ssr_a > ssr_b else "A"
        return {"active": True, "team": weaker, "bonus": 0.5}
    return {"active": False, "team": None, "bonus": 0.0}


async def get_player_by_token(session_token: str) -> dict | None:
    db = get_supabase()
    result = db.table("players").select("*").eq("session_token", session_token).execute()
    return result.data[0] if result.data else None


async def get_room_by_code(code: str) -> dict | None:
    db = get_supabase()
    result = db.table("rooms").select("*").eq("code", code.upper()).execute()
    if not result.data:
        return None
    room = result.data[0]
    expires = room.get("expires_at")
    if expires:
        exp_dt = datetime.fromisoformat(expires.replace("Z", "+00:00"))
        if exp_dt < datetime.now(timezone.utc):
            return None
    return room


async def get_room_by_id(room_id: str) -> dict | None:
    db = get_supabase()
    result = db.table("rooms").select("*").eq("id", room_id).execute()
    return result.data[0] if result.data else None


async def validate_host(session_token: str, room_id: str) -> dict:
    player = await get_player_by_token(session_token)
    if not player:
        raise ValueError("unauthorized")
    if player["room_id"] != room_id or not player.get("is_host"):
        raise ValueError("not_host")
    return player


async def validate_state(room: dict, required_states: list[str]) -> None:
    if room["state"] not in required_states:
        raise ValueError(f"invalid_state:{room['state']}:{required_states[0]}")


async def advance_room_state(room_id: str, target_state: str) -> dict:
    db = get_supabase()
    room = await get_room_by_id(room_id)
    if not room:
        raise ValueError("room_not_found")

    current = room["state"]
    allowed = VALID_TRANSITIONS.get(current, [])
    if target_state not in allowed:
        raise ValueError(f"invalid_transition:{current}:{target_state}")

    result = db.table("rooms").update({"state": target_state}).eq("id", room_id).eq(
        "state", current
    ).execute()
    if not result.data:
        fresh = await get_room_by_id(room_id)
        if fresh and fresh["state"] == target_state:
            updated = fresh
        else:
            raise ValueError(f"invalid_transition:{current}:{target_state}")
    else:
        updated = result.data[0]

    if target_state == "LIVE" and room.get("match_id"):
        match_id = str(room["match_id"])
        settings = room.get("settings") or {}
        is_test_match = match_id == "TEST_EGY_BEL" or settings.get("test_mode")
        if not is_test_match:
            from services.sports_api import start_live_polling
            if room_id not in _polling_tasks or _polling_tasks[room_id].done():
                _polling_tasks[room_id] = asyncio.create_task(
                    start_live_polling(room_id, room["match_id"])
                )

    if target_state in ("FULL_TIME", "RESULTS"):
        task = _polling_tasks.pop(room_id, None)
        if task and not task.done():
            task.cancel()

    await send_system_message(room_id, f"Room advanced to {target_state}")
    return updated


async def allocate_teams(room_id: str) -> None:
    db = get_supabase()
    players_result = db.table("players").select("*").eq("room_id", room_id).execute()
    players = players_result.data or []
    if not players:
        return

    random.shuffle(players)
    half = len(players) // 2
    for i, player in enumerate(players):
        team = "A" if i < half else "B"
        if len(players) % 2 == 1 and i == len(players) - 1:
            team = "A" if random.random() < 0.5 else "B"
        db.table("players").update({"assigned_team": team}).eq("id", player["id"]).execute()

    players_result = db.table("players").select("assigned_team").eq("room_id", room_id).execute()
    count_a = sum(1 for p in players_result.data if p.get("assigned_team") == "A")
    count_b = sum(1 for p in players_result.data if p.get("assigned_team") == "B")
    underdog_team, multiplier = calculate_underdog_multiplier(count_a, count_b)

    db.table("rooms").update({
        "underdog_team": underdog_team,
        "underdog_multiplier": multiplier,
    }).eq("id", room_id).execute()

    await send_system_message(room_id, "Teams have been assigned!")


async def send_system_message(room_id: str, content: str) -> None:
    db = get_supabase()
    db.table("chat_messages").insert({
        "room_id": room_id,
        "content": content,
        "is_system": True,
        "nickname": "System",
    }).execute()


def _map_event_to_winning_option(bet_type: str, event: dict) -> str | None:
    event_type = event.get("type", "")
    detail = event.get("detail", "")

    if bet_type in ("MANUAL", "PENALTY"):
        if event_type == "Goal" and "Penalty" in detail:
            return "option_a"
        if detail in ("Missed Penalty", "Penalty missed"):
            return "option_c"
        if "Save" in detail:
            return "option_b"

    if bet_type == "PULSE" and event_type == "Goal":
        return "option_a"

    if bet_type == "SUPER_SUB" and event_type == "Goal":
        return "option_a"

    if bet_type == "VAR_REVIEW" and event_type == "Var":
        return "option_b"

    if bet_type == "MOMENTUM":
        return "option_a"

    return None


async def try_resolve_bets_from_event(room_id: str, event: dict) -> None:
    from services.bet_resolver import resolve_flash_bet

    db = get_supabase()
    pending = [
        (bet_id, meta)
        for bet_id, meta in _pending_event_bets.items()
        if meta["room_id"] == room_id
    ]

    for bet_id, meta in pending:
        winning = _map_event_to_winning_option(meta["bet_type"], event)
        if not winning:
            continue

        bet = db.table("flash_bets").select("state").eq("id", bet_id).execute()
        if not bet.data or bet.data[0]["state"] != "CLOSED":
            continue

        try:
            await resolve_flash_bet(bet_id, winning)
            _pending_event_bets.pop(bet_id, None)
        except ValueError:
            pass


async def _auto_resolve_manual_bet(flash_bet_id: str) -> None:
    from services.bet_resolver import resolve_flash_bet, refund_flash_bet

    db = get_supabase()
    bet = db.table("flash_bets").select("*").eq("id", flash_bet_id).execute()
    if not bet.data or bet.data[0]["state"] != "CLOSED":
        return

    bet_row = bet.data[0]
    wagers = db.table("wagers").select("id").eq("flash_bet_id", flash_bet_id).execute()
    if not wagers.data:
        db.table("flash_bets").update({
            "state": "RESOLVED",
            "winning_option": "NONE",
            "resolved_at": datetime.now(timezone.utc).isoformat(),
        }).eq("id", flash_bet_id).execute()
        _pending_event_bets.pop(flash_bet_id, None)
        return

    if bet_row["bet_type"] in ("MANUAL", "PENALTY", "SUPER_SUB", "VAR_REVIEW", "MOMENTUM"):
        try:
            await resolve_flash_bet(flash_bet_id, "option_a")
            _pending_event_bets.pop(flash_bet_id, None)
        except ValueError:
            pass


async def _timeout_refund_bet(flash_bet_id: str) -> None:
    from services.bet_resolver import refund_flash_bet

    await asyncio.sleep(300)
    db = get_supabase()
    bet = db.table("flash_bets").select("state").eq("id", flash_bet_id).execute()
    if bet.data and bet.data[0]["state"] == "CLOSED":
        await refund_flash_bet(flash_bet_id)
        _pending_event_bets.pop(flash_bet_id, None)


async def schedule_bet_transitions(
    flash_bet_id: str,
    room_id: str,
    bet_type: str,
    buffer_seconds: int,
    frozen_until: datetime,
    closes_at: datetime,
) -> None:
    async def transition_to_open():
        now = datetime.now(timezone.utc)
        wait = (frozen_until - now).total_seconds()
        if wait > 0:
            await asyncio.sleep(wait)
        db = get_supabase()
        db.table("flash_bets").update({"state": "OPEN"}).eq("id", flash_bet_id).execute()

    async def transition_to_closed():
        now = datetime.now(timezone.utc)
        wait = (closes_at - now).total_seconds()
        if wait > 0:
            await asyncio.sleep(wait)
        db = get_supabase()
        db.table("flash_bets").update({"state": "CLOSED"}).eq("id", flash_bet_id).execute()
        _pending_event_bets[flash_bet_id] = {
            "room_id": room_id,
            "bet_type": bet_type,
            "closed_at": datetime.now(timezone.utc),
        }

    async def auto_resolve_after_close():
        await asyncio.sleep(buffer_seconds + 12 + 2)
        await _auto_resolve_manual_bet(flash_bet_id)

    tasks = [
        asyncio.create_task(transition_to_open()),
        asyncio.create_task(transition_to_closed()),
        asyncio.create_task(auto_resolve_after_close()),
        asyncio.create_task(_timeout_refund_bet(flash_bet_id)),
    ]
    _bet_transition_tasks[flash_bet_id] = tasks


async def process_jinx_for_event(
    room_id: str,
    event: dict,
    api_player_id: int | None = None,
    trigger: str = "event",
) -> None:
    """Apply JINX penalty when a jinxed player's drafted player misbehaves."""
    from services.player_balance import deduct_balance

    db = get_supabase()
    now = datetime.now(timezone.utc).isoformat()
    jinxes = db.table("sabotages").select("*").eq("room_id", room_id).eq(
        "token_type", "JINX"
    ).eq("active", True).gte("expires_at", now).execute()

    if not jinxes.data:
        return

    player_name = event.get("player", {}).get("name", "")
    detail = event.get("detail", "")

    for jinx in jinxes.data:
        target_id = jinx["target_id"]
        picks_query = db.table("fantasy_picks").select("*").eq("room_id", room_id).eq(
            "player_id", target_id
        )
        if api_player_id:
            picks_query = picks_query.eq("api_player_id", api_player_id)
        elif player_name:
            picks_query = picks_query.ilike("player_name", f"%{player_name}%")
        else:
            continue

        picks = picks_query.execute()
        if not picks.data:
            continue

        should_trigger = False
        if trigger == "card" and detail in ("Yellow Card", "Red Card", "Foul"):
            should_trigger = True
        elif trigger == "rating_drop":
            should_trigger = True

        if not should_trigger:
            continue

        target = db.table("players").select("nickname, balance").eq("id", target_id).execute()
        if not target.data:
            continue

        new_bal = deduct_balance(target_id, 75)
        if new_bal is None and target.data[0]["balance"] >= 75:
            db.table("players").update({
                "balance": max(0, target.data[0]["balance"] - 75),
            }).eq("id", target_id).execute()
        elif new_bal is None:
            continue

        db.table("sabotages").update({"active": False}).eq("id", jinx["id"]).execute()
        await send_system_message(
            room_id,
            f"🪄 JINX activated! {target.data[0]['nickname']}'s player cost them 75 PC.",
        )


async def create_flash_bet(
    room_id: str,
    bet_type: str,
    options: dict,
    event_label: str,
) -> dict | None:
    db = get_supabase()
    room = await get_room_by_id(room_id)
    if not room:
        return None

    settings = room.get("settings", {})
    if not settings.get("module_flash_bets", True):
        return None

    chaos = settings.get("chaos_frequency", "medium")
    chaos_chance = {"low": 0.3, "medium": 0.6, "high": 0.9}.get(chaos, 0.6)
    if bet_type not in ("MANUAL", "VAR_REVIEW", "PENALTY", "SUPER_SUB") and random.random() > chaos_chance:
        return None

    if not options:
        options = DEFAULT_MANUAL_OPTIONS.get(bet_type, DEFAULT_MANUAL_OPTIONS["MANUAL"])

    now = datetime.now(timezone.utc)
    buffer_seconds = settings.get("api_buffer_seconds", 3)
    frozen_until = now + timedelta(seconds=buffer_seconds)
    closes_at = frozen_until + timedelta(seconds=12)

    result = db.table("flash_bets").insert({
        "room_id": room_id,
        "bet_type": bet_type,
        "event_label": event_label,
        "options": options,
        "frozen_until": frozen_until.isoformat(),
        "closes_at": closes_at.isoformat(),
        "state": "FROZEN",
    }).execute()

    bet = result.data[0]
    asyncio.create_task(schedule_bet_transitions(
        bet["id"], room_id, bet_type, buffer_seconds, frozen_until, closes_at
    ))
    await send_system_message(room_id, f"Flash bet: {event_label}")
    return bet


async def handle_event(room_id: str, event: dict) -> None:
    await try_resolve_bets_from_event(room_id, event)

    event_type = event.get("type", "")

    if event_type == "Goal":
        team_name = event.get("team", {}).get("name", "Unknown")
        await create_flash_bet(room_id, "PULSE", {
            "option_a": {"label": "Next Goal", "multiplier": 2.5},
            "option_b": {"label": "No More Goals", "multiplier": 1.5},
        }, event_label=f"Goal! {team_name} scores")

    elif event_type == "Var":
        await create_flash_bet(room_id, "VAR_REVIEW", {
            "option_a": {"label": "Decision Stands", "multiplier": 1.8},
            "option_b": {"label": "Overturned", "multiplier": 2.1},
        }, event_label="VAR Review in Progress")

    elif event_type == "Penalty":
        team_name = event.get("team", {}).get("name", "Unknown")
        await create_flash_bet(room_id, "PENALTY", {
            "option_a": {"label": "Goal", "multiplier": 1.3},
            "option_b": {"label": "Goalkeeper Save", "multiplier": 3.5},
            "option_c": {"label": "Miss / Off Target / Post", "multiplier": 5.0},
        }, event_label=f"Penalty awarded to {team_name}")

    elif event_type == "subst":
        await create_super_sub_alert(room_id, event)

    elif event_type == "Card":
        from services.fantasy import update_fantasy_scores_from_event
        await update_fantasy_scores_from_event(room_id, event)
        await process_jinx_for_event(room_id, event, trigger="card")


async def create_super_sub_alert(room_id: str, event: dict) -> None:
    player_name = event.get("player", {}).get("name", "Substitute")
    await create_flash_bet(room_id, "SUPER_SUB", {
        "option_a": {"label": f"{player_name} Scores", "multiplier": 5.0},
        "option_b": {"label": "No Impact", "multiplier": 1.2},
    }, event_label=f"Super Sub: {player_name} enters the pitch!")


_momentum_cache: dict[str, dict] = {}


async def update_momentum(room_id: str, stats: dict) -> None:
    if not stats:
        return
    possession_a = 50
    possession_b = 50
    for team_stat in stats.get("response", []):
        for stat in team_stat.get("statistics", []):
            if stat.get("type") == "Ball Possession":
                val = stat.get("value", "50%").replace("%", "")
                try:
                    pct = int(val)
                    if team_stat == stats["response"][0]:
                        possession_a = pct
                    else:
                        possession_b = pct
                except ValueError:
                    pass

    prev = _momentum_cache.get(room_id, {"a": 50, "b": 50})
    shift = abs(possession_a - prev.get("a", 50))
    _momentum_cache[room_id] = {"a": possession_a, "b": possession_b}

    if shift >= 15:
        leader = "Team A" if possession_a > possession_b else "Team B"
        await create_flash_bet(room_id, "MOMENTUM", {
            "option_a": {"label": f"{leader} Dominates", "multiplier": 1.6},
            "option_b": {"label": "Momentum Shifts", "multiplier": 2.4},
        }, event_label="Momentum shift detected!")
