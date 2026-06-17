#!/usr/bin/env python3
"""Seed local Supabase with test users and sample rooms.

Usage:
  cd backend && python scripts/seed_test_data.py

Requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in backend/.env
"""
from __future__ import annotations

import asyncio
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[1] / ".env")

from database import get_supabase
from services.bots import bot_config_to_json
from services.match_engine import create_simulation_room

TEST_USERS = [
    ("test_host@pitchroulette.test", "test123", "test_host", "Test Host"),
    ("test_p2@pitchroulette.test", "test123", "test_p2", "Test Player 2"),
    ("test_p3@pitchroulette.test", "test123", "test_p3", "Test Player 3"),
    ("test_p4@pitchroulette.test", "test123", "test_p4", "Test Player 4"),
    ("test_p5@pitchroulette.test", "test123", "test_p5", "Test Player 5"),
]


def ensure_user(email: str, password: str, username: str, display_name: str) -> str:
    db = get_supabase()
    try:
        created = db.auth.admin.create_user({
            "email": email,
            "password": password,
            "email_confirm": True,
            "user_metadata": {"username": username, "display_name": display_name},
        })
        return str(created.user.id)
    except Exception:
        row = db.table("profiles").select("id").eq("username", username).execute()
        if row.data:
            return row.data[0]["id"]
        raise


async def main() -> None:
    if not os.getenv("SUPABASE_URL"):
        print("Set SUPABASE_URL in backend/.env")
        sys.exit(1)

    host_id = ensure_user(*TEST_USERS[0])
    bot_json = bot_config_to_json(True, 3, "medium")

    for phase in ("LOBBY", "PREDICTING", "LIVE", "LOBBY"):
        room = await create_simulation_room(host_id, "demo_simulation", bot_json, phase=phase)
        print(f"Created room {room['room_code']} state={phase}")

    for email, password, username, display_name in TEST_USERS[1:]:
        uid = ensure_user(email, password, username, display_name)
        print(f"User {username}: {uid}")

    print("\nDone. Login with test_host@pitchroulette.test / test123")


if __name__ == "__main__":
    asyncio.run(main())
