import os
from functools import lru_cache
from pathlib import Path

from dotenv import load_dotenv

# Load backend/.env regardless of current working directory (uvicorn reload spawns subprocesses).
_DOTENV_PATH = Path(__file__).resolve().parent / ".env"
load_dotenv(dotenv_path=_DOTENV_PATH)

COMPETITION_MAP = {
    "WC": {"code": "WC", "season": 2026, "name": "World Cup"},
    "WORLD_CUP": {"code": "WC", "season": 2026, "name": "World Cup"},
}


def _env_bool(key: str, default: str = "false") -> bool:
    return os.getenv(key, default).strip().lower() == "true"


class Settings:
    def __init__(self) -> None:
        load_dotenv(dotenv_path=_DOTENV_PATH, override=True)
        self.SUPABASE_URL: str = os.getenv("SUPABASE_URL", "")
        self.SUPABASE_SERVICE_ROLE_KEY: str = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "") or os.getenv(
            "SUPABASE_SERVICE_KEY", ""
        )
        self.FOOTBALL_DATA_API_KEY: str = os.getenv("FOOTBALL_DATA_API_KEY", "") or os.getenv(
            "FOOTBALL_DATA_TOKEN", ""
        )
        self.FOOTBALL_DATA_BASE_URL: str = os.getenv(
            "FOOTBALL_DATA_BASE_URL", "https://api.football-data.org/v4"
        )
        self.SPORTS_COMPETITION: str = os.getenv("SPORTS_COMPETITION", "WC")
        self.SPORTS_COMPETITION_CODE: str = os.getenv("SPORTS_COMPETITION_CODE", "")
        self.SPORTS_SEASON: int = int(os.getenv("SPORTS_SEASON", "0") or "0")
        self.MOCK_MODE: bool = _env_bool("MOCK_MODE")
        self.DEMO_MODE: bool = _env_bool("DEMO_MODE")
        self.FRONTEND_URL: str = os.getenv("FRONTEND_URL", "http://localhost:5173")
        self.ESPN_ENABLED: bool = _env_bool("ESPN_ENABLED", "true")
        self.ESPN_LEAGUE_SLUG: str = os.getenv("ESPN_LEAGUE_SLUG", "fifa.world")
        self.ESPN_BASE_URL: str = os.getenv("ESPN_BASE_URL", "https://site.api.espn.com")
        self.DEFAULT_BOT_DIFFICULTY: str = os.getenv("DEFAULT_BOT_DIFFICULTY", "medium")
        self.MAX_BOTS_PER_ROOM: int = int(os.getenv("MAX_BOTS_PER_ROOM", "10"))
        self.ENVIRONMENT: str = os.getenv("ENVIRONMENT", "development")
        self.SENTRY_DSN: str = os.getenv("SENTRY_DSN", "")
        self.ESPN_SSL_VERIFY: bool = _env_bool("ESPN_SSL_VERIFY", "true")
        self.CACHE_TTL_STANDINGS: int = 300
        self.CACHE_TTL_SCHEDULE: int = 120
        self.CACHE_TTL_LIVE: int = 30
        self.CACHE_TTL_ESPN_LIVE: int = 15
        self.CACHE_TTL_LINEUPS: int = 600
        self.STALE_MAX_AGE: int = 1800

    @property
    def competition(self) -> dict:
        base = COMPETITION_MAP.get(self.SPORTS_COMPETITION.upper(), COMPETITION_MAP["WC"])
        return {
            "code": self.SPORTS_COMPETITION_CODE or base["code"],
            "season": self.SPORTS_SEASON or base["season"],
            "name": base["name"],
        }


@lru_cache
def get_settings() -> Settings:
    return Settings()


def reload_settings() -> Settings:
    get_settings.cache_clear()
    return get_settings()
