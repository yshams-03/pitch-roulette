import random
import re
import string

from database import get_supabase

USERNAME_RE = re.compile(r"^[a-z0-9_]{3,20}$")


def validate_username(username: str) -> str:
    u = username.strip().lower()
    if not USERNAME_RE.match(u):
        raise ValueError("invalid_username")
    return u


def generate_room_code(length: int = 6) -> str:
    chars = string.ascii_uppercase + string.digits
    return "".join(random.choices(chars, k=length))


def generate_invite_code(length: int = 8) -> str:
    chars = string.ascii_uppercase + string.digits
    return "".join(random.choices(chars, k=length))


def unique_room_code() -> str:
    db = get_supabase()
    for _ in range(20):
        code = generate_room_code()
        existing = db.table("rooms").select("id").eq("room_code", code).execute()
        if not existing.data:
            return code
    raise RuntimeError("could_not_generate_room_code")


def unique_group_invite_code() -> str:
    db = get_supabase()
    for _ in range(20):
        code = generate_invite_code()
        existing = db.table("friend_groups").select("id").eq("invite_code", code).execute()
        if not existing.data:
            return code
    raise RuntimeError("could_not_generate_invite_code")


AVATAR_COLORS = [
    "#22c55e", "#3b82f6", "#a855f7", "#f59e0b", "#ef4444",
    "#06b6d4", "#ec4899", "#84cc16", "#6366f1", "#f97316",
]


def random_avatar_color() -> str:
    return random.choice(AVATAR_COLORS)
