"""Integration tests for rooms API (mocked Supabase)."""


def test_health_ok(client):
    res = client.get("/api/health")
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "ok"
    assert "version" in body


def test_get_room_snapshot(client):
    res = client.get("/api/rooms/TEST01")
    assert res.status_code == 200
    body = res.json()
    assert body["room_code"] == "TEST01"
    assert body["match_data"]["home_team"] == "France"
    assert "players" in body


def test_join_room_while_predicting_closed(client, fake_db):
    fake_db.tables["rooms"][0]["state"] = "LIVE"
    res = client.post("/api/rooms/TEST01/join", json={})
    assert res.status_code == 409


def test_non_host_cannot_lock(fake_db, monkeypatch):
    from auth import get_current_user_id
    from fastapi.testclient import TestClient
    from main import app

    monkeypatch.setattr("database.get_supabase", lambda: fake_db)
    monkeypatch.setattr("services.flash_bets.get_supabase", lambda: fake_db)
    monkeypatch.setattr("services.room_snapshot.get_supabase", lambda: fake_db)

    async def _player():
        return "player-2"

    app.dependency_overrides[get_current_user_id] = _player
    fake_db.tables["rooms"][0]["state"] = "PREDICTING"
    with TestClient(app) as c:
        res = c.post("/api/rooms/TEST01/lock", json={})
    app.dependency_overrides.clear()
    assert res.status_code == 403


def test_flash_bets_list_empty(client):
    res = client.get("/api/rooms/TEST01/flash-bets")
    assert res.status_code == 200
    assert res.json()["bets"] == []


def test_demo_enabled_compat(client):
    res = client.get("/api/demo/enabled")
    assert res.status_code == 200
    assert res.json()["enabled"] is True
