"""Unit tests for host transfer and orphan room cleanup."""
from datetime import datetime, timedelta, timezone

import pytest

from services.host_management import cleanup_orphan_host_rooms, promote_next_host, transfer_host


@pytest.fixture
def host_db(fake_db, monkeypatch):
    monkeypatch.setattr("services.host_management.get_supabase", lambda: fake_db)
    return fake_db


class TestTransferHost:
    def test_transfer_success(self, host_db):
        room = host_db.tables["rooms"][0]
        updated = transfer_host(room, "host-user", "player-2")
        assert updated["host_id"] == "player-2"
        host_row = next(p for p in host_db.tables["room_players"] if p["user_id"] == "player-2")
        assert host_row["is_host"] is True

    def test_rejects_non_host(self, host_db):
        room = host_db.tables["rooms"][0]
        with pytest.raises(PermissionError, match="not_host"):
            transfer_host(room, "player-2", "host-user")

    def test_promote_next_host(self, host_db):
        room = host_db.tables["rooms"][0]
        updated = promote_next_host(room)
        assert updated is not None
        assert updated["host_id"] == "player-2"


class TestOrphanCleanup:
    def test_promotes_when_host_missing(self, host_db):
        host_db.tables["room_players"] = [
            p for p in host_db.tables["room_players"] if p["user_id"] != "host-user"
        ]
        n = cleanup_orphan_host_rooms()
        assert n >= 1
        assert host_db.tables["rooms"][0]["host_id"] == "player-2"

    def test_deletes_stale_solo_lobby(self, host_db):
        old = datetime.now(timezone.utc) - timedelta(minutes=30)
        host_db.tables["rooms"] = [{
            "id": "room-solo",
            "room_code": "SOLO01",
            "host_id": "host-user",
            "state": "LOBBY",
            "created_at": old.isoformat(),
        }]
        host_db.tables["room_players"] = [
            {"id": "rp-solo", "room_id": "room-solo", "user_id": "host-user", "is_host": True},
        ]
        n = cleanup_orphan_host_rooms(max_lobby_minutes=20)
        assert n == 1
        assert host_db.tables["rooms"] == []
