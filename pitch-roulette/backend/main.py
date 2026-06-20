from contextlib import asynccontextmanager
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(dotenv_path=Path(__file__).resolve().parent / ".env", override=True)

from config import reload_settings

reload_settings()

import os

from fastapi import FastAPI
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request as StarletteRequest
from starlette.responses import Response

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

ALLOWED_ORIGIN_PATTERNS = [
    "http://localhost:5173",
    "http://localhost:5174",
    "http://127.0.0.1:5173",
    "https://pitch-roulette.vercel.app",
]


def is_origin_allowed(origin: str) -> bool:
    if not origin:
        return False
    # Exact matches
    if origin in ALLOWED_ORIGIN_PATTERNS:
        return True
    # Any Vercel preview for this project
    if origin.endswith(".vercel.app") and "pitch-roulette" in origin:
        return True
    # FRONTEND_URL from env
    frontend_url = os.getenv("FRONTEND_URL", "").rstrip("/")
    if frontend_url and origin == frontend_url:
        return True
    return False


class DynamicCORSMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: StarletteRequest, call_next):
        origin = request.headers.get("origin", "")

        if request.method == "OPTIONS":
            if is_origin_allowed(origin):
                return Response(
                    status_code=200,
                    headers={
                        "Access-Control-Allow-Origin": origin,
                        "Access-Control-Allow-Credentials": "true",
                        "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS, PATCH",
                        "Access-Control-Allow-Headers": "*",
                        "Access-Control-Max-Age": "86400",
                    },
                )
            return Response(status_code=403)

        response = await call_next(request)

        if is_origin_allowed(origin):
            response.headers["Access-Control-Allow-Origin"] = origin
            response.headers["Access-Control-Allow-Credentials"] = "true"
            response.headers["Access-Control-Expose-Headers"] = "*"

        return response


app.add_middleware(DynamicCORSMiddleware)

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
