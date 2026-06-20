from contextlib import asynccontextmanager
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(dotenv_path=Path(__file__).resolve().parent / ".env", override=True)

from config import reload_settings

reload_settings()

import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routers import demo_compat, draft, groups, health, leaderboard, ops, profiles, rooms, sabotages, sports
from services.event_pipeline import start_event_pipeline


def _init_sentry() -> None:
    dsn = os.getenv("SENTRY_DSN", "").strip()
    if not dsn:
        return
    try:
        import sentry_sdk
        from sentry_sdk.integrations.fastapi import FastApiIntegration

        sentry_sdk.init(
            dsn=dsn,
            environment=os.getenv("ENVIRONMENT", "development"),
            traces_sample_rate=float(os.getenv("SENTRY_TRACES_SAMPLE_RATE", "0.1")),
            integrations=[FastApiIntegration()],
        )
    except Exception:
        pass


_init_sentry()


@asynccontextmanager
async def lifespan(app: FastAPI):
    reload_settings()
    start_event_pipeline()
    yield


app = FastAPI(title="Pitch Roulette API", version="3.0.0", lifespan=lifespan)

# Build allowed origins list
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173").rstrip("/")

allowed_origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:3000",
]

# Add production URL if set
if FRONTEND_URL and FRONTEND_URL not in allowed_origins:
    allowed_origins.append(FRONTEND_URL)

# Also allow www variant if it exists
if FRONTEND_URL.startswith("https://") and not FRONTEND_URL.startswith("https://www."):
    www_variant = FRONTEND_URL.replace("https://", "https://www.", 1)
    allowed_origins.append(www_variant)

staging = os.getenv("STAGING_FRONTEND_URL", "").rstrip("/")
if staging and staging not in allowed_origins:
    allowed_origins.append(staging)

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    allow_headers=["*"],
    expose_headers=["*"],
)

app.include_router(health.router)
app.include_router(ops.router)
app.include_router(demo_compat.router)
app.include_router(sports.router)
app.include_router(profiles.router)
app.include_router(groups.router)
app.include_router(leaderboard.router)
app.include_router(rooms.router)
app.include_router(sabotages.router)
app.include_router(draft.router)
