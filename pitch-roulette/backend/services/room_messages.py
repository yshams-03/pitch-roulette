"""Room chat with basic profanity filter."""
from __future__ import annotations

import re

from database import get_supabase

BLOCKED = re.compile(
    r"\b(fuck|shit|asshole|bitch|nigger|faggot|retard)\b",
    re.IGNORECASE,
)


def _clean(content: str) -> str:
    text = content.strip()
    if not text:
        raise ValueError("empty_message")
    if len(text) > 200:
        raise ValueError("message_too_long")
    if BLOCKED.search(text):
        raise ValueError("message_blocked")
    return text


def list_messages(room_id: str, before: str | None = None, limit: int = 50) -> list[dict]:
    db = get_supabase()
    q = db.table("room_messages").select("*").eq("room_id", room_id).eq(
        "is_deleted", False
    ).order("sent_at", desc=True).limit(min(limit, 50))
    if before:
        q = q.lt("sent_at", before)
    rows = q.execute().data or []
    return list(reversed(rows))


def post_message(room_id: str, user_id: str, content: str) -> dict:
    text = _clean(content)
    db = get_supabase()
    prof = db.table("profiles").select("username").eq("id", user_id).execute()
    username = prof.data[0]["username"] if prof.data else "player"
    return db.table("room_messages").insert({
        "room_id": room_id,
        "user_id": user_id,
        "username": username,
        "content": text,
    }).execute().data[0]


def delete_message(message_id: str, room_id: str) -> None:
    db = get_supabase()
    db.table("room_messages").update({"is_deleted": True}).eq("id", message_id).eq(
        "room_id", room_id
    ).execute()
