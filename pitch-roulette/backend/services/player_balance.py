from database import get_supabase


def deduct_balance(player_id: str, amount: int) -> int | None:
    """Atomically deduct PC if sufficient balance. Returns new balance or None."""
    db = get_supabase()
    player = db.table("players").select("balance").eq("id", player_id).execute()
    if not player.data:
        return None
    current = player.data[0]["balance"]
    if current < amount:
        return None
    new_balance = current - amount
    db.table("players").update({"balance": new_balance}).eq("id", player_id).eq(
        "balance", current
    ).execute()
    verify = db.table("players").select("balance").eq("id", player_id).execute()
    return verify.data[0]["balance"] if verify.data else None


def deduct_balance_floor(player_id: str, amount: int) -> int:
    """Deduct PC but never below zero. Returns new balance."""
    db = get_supabase()
    player = db.table("players").select("balance").eq("id", player_id).execute()
    if not player.data:
        return 0
    new_balance = max(0, player.data[0]["balance"] - amount)
    db.table("players").update({"balance": new_balance}).eq("id", player_id).execute()
    return new_balance


def add_balance(player_id: str, amount: int) -> int:
    """Add PC to player balance. Returns new balance."""
    db = get_supabase()
    player = db.table("players").select("balance").eq("id", player_id).execute()
    if not player.data:
        return 0
    new_balance = player.data[0]["balance"] + amount
    db.table("players").update({"balance": new_balance}).eq("id", player_id).execute()
    return new_balance
