"""Quick sports API connection diagnostic."""
import asyncio
import os

import httpx
from dotenv import load_dotenv

load_dotenv()

KEY = os.getenv("SPORTS_API_KEY", "")
BBS_KEY = os.getenv("BIG_BALLS_API_KEY", "") or os.getenv("BBS_API_KEY", "")
PROVIDER = os.getenv("SPORTS_PROVIDER", "auto")
BASE = os.getenv("SPORTS_API_BASE", "https://v3.football.api-sports.io")


def _team(match: dict, side: str) -> str:
    team = match.get(side, "")
    if isinstance(team, dict):
        return str(team.get("name", "")).lower()
    return str(team).lower()


async def main():
    print("=== Sports API Connection Check ===")
    print(f"Provider mode: {PROVIDER}")
    print(f"API-Football key: {bool(KEY)} (length={len(KEY)})")
    print(f"Big Balls key: {bool(BBS_KEY)} (length={len(BBS_KEY)})")
    print(f"API-Football base: {BASE}")
    print()

    if KEY and PROVIDER != "bigballs":
        print("--- API-Football: search Arsenal ---")
        try:
            async with httpx.AsyncClient(timeout=20) as client:
                r = await client.get(
                    f"{BASE}/fixtures",
                    headers={"x-apisports-key": KEY},
                    params={"search": "Arsenal", "status": "NS"},
                )
                print(f"HTTP {r.status_code}")
                data = r.json()
                errors = data.get("errors", {})
                if errors:
                    print(f"  API errors: {errors}")
                results = data.get("response", [])
                print(f"  Matches found: {len(results)}")
                for f in results[:3]:
                    teams = f.get("teams", {})
                    print(f"    - {teams.get('home', {}).get('name')} vs {teams.get('away', {}).get('name')}")
        except Exception as e:
            print(f"  ERROR: {type(e).__name__}: {e}")

    if BBS_KEY:
        print()
        print("--- Big Balls: search Arsenal (epl scheduled) ---")
        try:
            async with httpx.AsyncClient(timeout=20) as client:
                r = await client.get(
                    "https://api.bigballsdata.com/v1/stored/matches",
                    headers={"Authorization": f"Bearer {BBS_KEY}", "x-api-key": BBS_KEY},
                    params={"sport": "football", "status": "scheduled", "limit": 200},
                )
                print(f"HTTP {r.status_code}")
                if r.status_code == 200:
                    matches = r.json().get("data", [])
                    if not isinstance(matches, list):
                        matches = []
                    arsenal = [
                        m for m in matches
                        if isinstance(m, dict) and (
                            "arsenal" in _team(m, "home") or "arsenal" in _team(m, "away")
                        )
                    ]
                    print(f"  Scheduled matches: {len(matches)}")
                    print(f"  Arsenal-related: {len(arsenal)}")
                    for m in arsenal[:3]:
                        home = m.get("home", {})
                        away = m.get("away", {})
                        hname = home.get("name") if isinstance(home, dict) else home
                        aname = away.get("name") if isinstance(away, dict) else away
                        print(f"    - {hname} vs {aname} (id={m.get('id')})")
                else:
                    print(f"  Response: {r.text[:300]}")
        except Exception as e:
            print(f"  ERROR: {type(e).__name__}: {e}")
    else:
        print()
        print("--- Big Balls: SKIPPED ---")
        print("  Get a free key at https://bigballsdata.com - add BIG_BALLS_API_KEY to .env")

    print()
    print("--- Backend proxy (localhost:8000) ---")
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            h = await client.get("http://localhost:8000/health")
            print(f"Backend health: HTTP {h.status_code}")
            r = await client.get("http://localhost:8000/sports/search-match?q=Arsenal")
            print(f"search-match: HTTP {r.status_code}")
            if r.status_code == 200:
                matches = r.json().get("matches", [])
                print(f"  Matches via proxy: {len(matches)}")
                for m in matches[:3]:
                    print(f"    - {m.get('team_a')} vs {m.get('team_b')} (id={m.get('id')})")
    except Exception as e:
        print(f"  Backend ERROR: {type(e).__name__}: {e}")

    print()
    print("=== Done ===")


if __name__ == "__main__":
    asyncio.run(main())
