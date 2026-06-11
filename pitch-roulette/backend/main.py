import os
from datetime import datetime, timezone

from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

from contextlib import asynccontextmanager

from routers import rooms, players, flash_bets, sabotage, chat, sports, webhooks, test_mode
from services.presence import start_presence_monitor

load_dotenv()


@asynccontextmanager
async def lifespan(app: FastAPI):
    start_presence_monitor()
    yield

limiter = Limiter(key_func=get_remote_address)

app = FastAPI(title="Pitch Roulette API", version="1.0.0", lifespan=lifespan)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

frontend_url = os.getenv("FRONTEND_URL", "http://localhost:5173")
extra_origins = os.getenv("EXTRA_CORS_ORIGINS", "").split(",")
allowed_origins = [frontend_url] + [o.strip() for o in extra_origins if o.strip()]
# Vite may be opened as localhost or 127.0.0.1 — both must be allowed for CORS preflight
for origin in list(allowed_origins):
    if "localhost" in origin:
        alt = origin.replace("localhost", "127.0.0.1")
        if alt not in allowed_origins:
            allowed_origins.append(alt)
    elif "127.0.0.1" in origin:
        alt = origin.replace("127.0.0.1", "localhost")
        if alt not in allowed_origins:
            allowed_origins.append(alt)

# Vite falls back to 5174+ when 5173 is busy — allow common dev ports
for port in ("5173", "5174", "5175", "5176"):
    for host in ("http://localhost", "http://127.0.0.1"):
        origin = f"{host}:{port}"
        if origin not in allowed_origins:
            allowed_origins.append(origin)

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(ValueError)
async def value_error_handler(request: Request, exc: ValueError):
    return JSONResponse(status_code=400, content={"error": str(exc)})


@app.get("/health")
async def health():
    return {"status": "ok", "timestamp": datetime.now(timezone.utc).isoformat()}


app.include_router(rooms.router)
app.include_router(players.router)
app.include_router(flash_bets.router)
app.include_router(sabotage.router)
app.include_router(chat.router)
app.include_router(sports.router)
app.include_router(webhooks.router)
app.include_router(test_mode.router)
