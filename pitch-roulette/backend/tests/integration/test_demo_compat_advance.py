"""Demo compat advance must assign sides when opening predictions."""


def test_advance_lobby_to_predicting_assigns_sides(client, fake_db, monkeypatch):
    monkeypatch.setattr("services.bots.on_predictions_opened", lambda *_a, **_k: None)
    fake_db.tables["rooms"][0]["state"] = "LOBBY"
    for row in fake_db.tables["room_players"]:
        row.pop("assigned_side", None)

    res = client.post("/api/demo/rooms/TEST01/advance")
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["room"]["state"] == "PREDICTING"
    players = body["room"]["players"]
    assert len(players) >= 2
    for p in players:
        assert p.get("assigned_side") in ("HOME", "AWAY")
