from contextlib import asynccontextmanager
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(dotenv_path=Path(__file__).resolve().parent / ".env", override=True)

from config import reload_settings

reload_settings()

import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routers import demo_compat, groups, health, leaderboard, profiles, rooms, sports
from services.event_pipeline import start_event_pipeline


@asynccontextmanager
async def lifespan(app: FastAPI):
    reload_settings()
    start_event_pipeline()
    yield


app = FastAPI(title="Pitch Roulette API", version="3.0.0", lifespan=lifespan)

frontend_url = os.getenv("FRONTEND_URL", "http://localhost:5173")
origins = [frontend_url]
for host in ("http://localhost", "http://127.0.0.1"):
    for port in ("5173", "5174", "5175", "5176"):
        o = f"{host}:{port}"
        if o not in origins:
            origins.append(o)

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(demo_compat.router)
app.include_router(sports.router)
app.include_router(profiles.router)
app.include_router(groups.router)
app.include_router(leaderboard.router)
app.include_router(rooms.router)
