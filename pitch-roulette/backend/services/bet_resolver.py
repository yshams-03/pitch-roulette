import logging
from datetime import datetime, timezone

from database import get_supabase
from services.game_engine import get_room_by_id, send_system_message
from services.player_balance import add_balance, deduct_balance

logger = logging.getLogger(__name__)


async def apply_tax_collector(winner_id: str, room_id: str, payout: int) -> int:
    """If winner has active TAX_COLLECTOR, siphon 20% to the sender."""
    if payout <= 0:
        return payout

    db = get_supabase()
    now = datetime.now(timezone.utc).isoformat()
    taxes = db.table("sabotages").select("*").eq("room_id", room_id).eq(
        "target_id", winner_id
    ).eq("token_type", "TAX_COLLECTOR").eq("active", True).gte("expires_at", now).execute()

    if not taxes.data:
        return payout

    sabotage = taxes.data[0]
    tax_amount = max(1, int(payout * 0.2))
    net_payout = payout - tax_amount

    sender = db.table("players").select("nickname, balance").eq("id", sabotage["sender_id"]).execute()
    winner = db.table("players").select("nickname").eq("id", winner_id).execute()
    if sender.data:
        add_balance(sabotage["sender_id"], tax_amount)
        host_name = sender.data[0]["nickname"]
        winner_name = winner.data[0]["nickname"] if winner.data else "Player"
        await send_system_message(
            room_id,
            f"🏦 {host_name} taxed {winner_name} for {tax_amount} PC",
        )

    return net_payout


async def refund_flash_bet(flash_bet_id: str) -> dict | None:
    db = get_supabase()
    bet_result = db.table("flash_bets").select("*").eq("id", flash_bet_id).execute()
    if not bet_result.data:
        return None

    bet = bet_result.data[0]
    if bet["state"] == "RESOLVED":
        return bet

    wagers = db.table("wagers").select("*").eq("flash_bet_id", flash_bet_id).execute()
    for wager in wagers.data or []:
        add_balance(wager["player_id"], wager["amount"])
        db.table("wagers").update({
            "payout": wager["amount"],
            "resolved": True,
        }).eq("id", wager["id"]).execute()

    db.table("flash_bets").update({
        "state": "RESOLVED",
        "winning_option": "REFUNDED",
        "resolved_at": datetime.now(timezone.utc).isoformat(),
    }).eq("id", flash_bet_id).execute()

    await send_system_message(bet["room_id"], "⏰ Bet expired — all wagers refunded.")
    updated = db.table("flash_bets").select("*").eq("id", flash_bet_id).execute()
    return updated.data[0]


async def resolve_flash_bet(flash_bet_id: str, winning_option: str) -> dict:
    db = get_supabase()

    bet_result = db.table("flash_bets").select("*").eq("id", flash_bet_id).execute()
    if not bet_result.data:
        raise ValueError("bet_not_found")

    bet = bet_result.data[0]
    if bet["state"] == "RESOLVED":
        raise ValueError("already_resolved")

    room = await get_room_by_id(bet["room_id"])
    underdog_team = room.get("underdog_team") if room else None
    underdog_multiplier = float(room.get("underdog_multiplier", 1.0)) if room else 1.0

    db.table("flash_bets").update({
        "state": "RESOLVED",
        "winning_option": winning_option,
        "resolved_at": datetime.now(timezone.utc).isoformat(),
    }).eq("id", flash_bet_id).execute()

    wagers_result = db.table("wagers").select("*, players(*)").eq("flash_bet_id", flash_bet_id).execute()
    options = bet.get("options", {})

    for wager in wagers_result.data or []:
        player = wager.get("players", {})
        chosen = wager["chosen_option"]
        amount = wager["amount"]
        payout = 0

        if chosen == winning_option:
            option_data = options.get(chosen, {})
            multiplier = float(option_data.get("multiplier", 1.5))

            if underdog_team and player.get("assigned_team") == underdog_team:
                multiplier *= underdog_multiplier

            payout = int(amount * multiplier)
            payout = await apply_tax_collector(wager["player_id"], bet["room_id"], payout)
            add_balance(wager["player_id"], payout)

        db.table("wagers").update({
            "payout": payout,
            "resolved": True,
        }).eq("id", wager["id"]).execute()

    winner_label = options.get(winning_option, {}).get("label", winning_option)
    await send_system_message(
        bet["room_id"],
        f"Flash bet resolved! Winner: {winner_label}",
    )

    updated = db.table("flash_bets").select("*").eq("id", flash_bet_id).execute()
    return updated.data[0]
