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

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        # Local development
        "http://localhost:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
        # Production Vercel — add ALL variants
        "https://pitch-roulette.vercel.app",
        "https://www.pitch-roulette.vercel.app",
        # Allow any Vercel preview deploy for this project
        "https://pitch-roulette-git-main-yshams-03.vercel.app",
        # Catch-all for any Vercel preview URL for this project
        *(
            [os.getenv("FRONTEND_URL").rstrip("/")]
            if os.getenv("FRONTEND_URL")
            else []
        ),
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
    max_age=86400,
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
