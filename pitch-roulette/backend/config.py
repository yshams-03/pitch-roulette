import os
from functools import lru_cache
from dotenv import load_dotenv

load_dotenv()


class Settings:
    SUPABASE_URL: str = os.getenv("SUPABASE_URL", "")
    SUPABASE_SERVICE_KEY: str = os.getenv("SUPABASE_SERVICE_KEY", "")
    SPORTS_API_KEY: str = os.getenv("SPORTS_API_KEY", "")
    SPORTS_API_BASE: str = os.getenv("SPORTS_API_BASE", "https://v3.football.api-sports.io")
    BIG_BALLS_API_KEY: str = os.getenv("BIG_BALLS_API_KEY", "") or os.getenv("BBS_API_KEY", "")
    # auto = API-Football first, Big Balls fallback | bigballs = Big Balls only | api-football = primary only
    SPORTS_PROVIDER: str = os.getenv("SPORTS_PROVIDER", "auto")
    SECRET_KEY: str = os.getenv("SECRET_KEY", "dev-secret-key-change-in-production")  # Reserved for future JWT signing — not active in v1
    FRONTEND_URL: str = os.getenv("FRONTEND_URL", "http://localhost:5173")

    VALID_TRANSITIONS: dict[str, list[str]] = {
        "LOBBY": ["SCOUTING"],
        "SCOUTING": ["DRAFT_LOCKED"],
        "DRAFT_LOCKED": ["LIVE"],
        "LIVE": ["FULL_TIME"],
        "FULL_TIME": ["RESULTS"],
        "RESULTS": [],
    }

    SABOTAGE_COSTS: dict[str, int] = {
        "BLINDFOLD": 150,
        "TAX_COLLECTOR": 200,
        "CHAT_SILENCER": 100,
        "JINX": 175,
        "MIRROR": 125,
    }

    SABOTAGE_DURATIONS: dict[str, int] = {
        "BLINDFOLD": 900,
        "TAX_COLLECTOR": 600,
        "CHAT_SILENCER": 180,
        "JINX": 300,
        "MIRROR": 240,
    }


@lru_cache
def get_settings() -> Settings:
    return Settings()
