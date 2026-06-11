"""Run Section 2 API smoke tests against local backend."""
import asyncio
import httpx

BASE = "http://localhost:8000"


async def wait_for_bet_open(client: httpx.AsyncClient, room_id: str, bet_id: str, timeout: float = 20) -> dict:
    deadline = asyncio.get_event_loop().time() + timeout
    while asyncio.get_event_loop().time() < deadline:
        r = await client.get(f"{BASE}/flash-bets/{room_id}/active")
        bet = r.json().get("bet")
        if bet and bet["id"] == bet_id and bet["state"] == "OPEN":
            return bet
        await asyncio.sleep(0.5)
    raise TimeoutError("bet never opened")


async def test_switch_team(client: httpx.AsyncClient) -> None:
    r = await client.post(f"{BASE}/rooms/create", json={"nickname": "SwitchHost"})
    created = r.json()
    code, host_token = created["code"], created["host_token"]
    r = await client.post(f"{BASE}/rooms/join", json={"nickname": "SwitchP2", "code": code})
    p2_token = r.json()["session_token"]
    await client.post(f"{BASE}/rooms/{code}/start-draft", json={"session_token": host_token})
    r = await client.post(f"{BASE}/players/switch-team", json={"session_token": p2_token})
    assert r.status_code == 200 and r.json()["balance"] == 750, r.text
    r = await client.post(f"{BASE}/players/switch-team", json={"session_token": p2_token})
    assert r.status_code == 409, r.text
    print("OK switch-team isolated test")


async def main():
    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.get(f"{BASE}/health")
        assert r.status_code == 200, r.text
        print("OK health", r.json())

        await test_switch_team(client)

        r = await client.post(f"{BASE}/rooms/create", json={
            "nickname": "TestHost",
            "match_id": "1234567",
            "match_name": "Arsenal vs Chelsea",
            "team_a_name": "Arsenal",
            "team_b_name": "Chelsea",
        })
        assert r.status_code == 200, r.text
        created = r.json()
        code = created["code"]
        host_token = created["host_token"]
        room_id = created["room_id"]
        print("OK create", code)

        r = await client.post(f"{BASE}/rooms/join", json={"nickname": "Player2", "code": code})
        assert r.status_code == 200, r.text
        p2 = r.json()
        p2_token = p2["session_token"]
        p2_id = p2["player_id"]
        print("OK join")

        r = await client.get(f"{BASE}/rooms/{code}")
        assert r.status_code == 200 and len(r.json()["players"]) == 2
        print("OK get room")

        r = await client.patch(f"{BASE}/rooms/{code}/settings", json={
            "session_token": host_token,
            "settings": {
                "allow_switching": True,
                "module_fantasy": True,
                "module_flash_bets": True,
                "module_sabotage": True,
                "chaos_frequency": "high",
                "api_buffer_seconds": 2,
                "custom_switch_penalty": None,
            },
        })
        assert r.status_code == 200, r.text
        print("OK settings")

        r = await client.post(f"{BASE}/rooms/{code}/start-draft", json={"session_token": host_token})
        assert r.status_code == 200 and r.json()["state"] == "SCOUTING"
        print("OK start-draft")

        r = await client.post(f"{BASE}/rooms/{code}/advance-state", json={"session_token": host_token})
        assert r.status_code == 200 and r.json()["state"] == "DRAFT_LOCKED"
        print("OK draft_locked")

        r = await client.post(f"{BASE}/players/fantasy/pick", json={
            "session_token": host_token,
            "picks": [
                {"api_player_id": 101, "player_name": "Saka", "position": "Forward"},
                {"api_player_id": 102, "player_name": "Odegaard", "position": "Midfielder"},
                {"api_player_id": 103, "player_name": "Saliba", "position": "Defender"},
            ],
        })
        assert r.status_code == 200, r.text
        print("OK fantasy picks")

        r = await client.post(f"{BASE}/rooms/{code}/advance-state", json={"session_token": host_token})
        assert r.status_code == 200 and r.json()["state"] == "LIVE"
        print("OK live")

        r = await client.post(f"{BASE}/rooms/{code}/manual-flash-bet", json={
            "session_token": host_token,
            "bet_type": "PENALTY",
            "event_label": "Test Penalty",
        })
        assert r.status_code == 200, r.text
        bet_id = r.json()["id"]
        print("OK manual flash bet", bet_id)

        bet = await wait_for_bet_open(client, room_id, bet_id)
        print("OK active bet state", bet["state"])

        r = await client.post(f"{BASE}/flash-bets/wager", json={
            "session_token": host_token,
            "flash_bet_id": bet_id,
            "chosen_option": "option_a",
            "amount": 200,
        })
        assert r.status_code == 200, r.text
        print("OK wager", r.json()["new_balance"])

        r = await client.post(f"{BASE}/flash-bets/wager", json={
            "session_token": host_token,
            "flash_bet_id": bet_id,
            "chosen_option": "option_a",
            "amount": 200,
        })
        assert r.status_code == 409, r.text
        print("OK duplicate wager blocked")

        r = await client.post(f"{BASE}/sabotage/deploy", json={
            "session_token": host_token,
            "target_player_id": p2_id,
            "token_type": "CHAT_SILENCER",
        })
        assert r.status_code == 200, r.text
        print("OK sabotage")

        r = await client.post(f"{BASE}/chat/send", json={
            "session_token": p2_token,
            "content": "test",
        })
        assert r.status_code == 403, r.text
        print("OK chat silenced")

        r = await client.get(f"{BASE}/sports/search-match?q=Arsenal")
        assert r.status_code == 200, r.text
        print("OK sports search")

        r = await client.get(f"{BASE}/sports/lineups/1234567")
        assert r.status_code == 200, r.text
        print("OK lineups", r.json().get("available"))

        r = await client.post(f"{BASE}/rooms/join", json={"nickname": "Late", "code": code})
        assert r.status_code == 409, r.text
        print("OK late join blocked")

        r = await client.post(f"{BASE}/players/switch-team", json={"session_token": p2_token})
        assert r.status_code == 409, r.text
        print("OK switch blocked in LIVE")

        await asyncio.sleep(18)
        bet_row = (await client.get(f"{BASE}/flash-bets/{room_id}/active")).json().get("bet")
        print("Bet after auto-resolve window:", bet_row["state"] if bet_row else "RESOLVED/cleared")

        r = await client.post(f"{BASE}/rooms/{code}/kick", json={
            "session_token": p2_token,
            "target_player_id": p2_id,
        })
        assert r.status_code == 403, r.text
        print("OK non-host kick blocked")

        r = await client.post(f"{BASE}/rooms/{code}/kick", json={
            "session_token": host_token,
            "target_player_id": p2_id,
        })
        assert r.status_code == 200, r.text
        print("OK kick player")

        for _ in range(2):
            r = await client.post(f"{BASE}/rooms/{code}/advance-state", json={"session_token": host_token})
            assert r.status_code == 200, r.text
        print("OK full_time + results", r.json()["state"])

        r = await client.post(f"{BASE}/rooms/{code}/advance-state", json={"session_token": host_token})
        assert r.status_code == 409, r.text
        print("OK terminal state blocked")

        r = await client.post(f"{BASE}/rooms/{code}/rematch", json={"session_token": host_token})
        assert r.status_code == 200, r.text
        print("OK rematch", r.json()["code"])

        print("\nALL API SMOKE TESTS PASSED")


if __name__ == "__main__":
    asyncio.run(main())
