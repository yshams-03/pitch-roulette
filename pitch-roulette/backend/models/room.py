from typing import Literal

from pydantic import BaseModel, Field

from config import get_settings

MatchSource = Literal["live_api", "demo_simulation", "manual"]
BotDifficulty = Literal["easy", "medium", "hard"]
RoomPhase = Literal["LOBBY", "PREDICTING", "CLOSED", "LIVE"]


class BotConfig(BaseModel):
    enabled: bool = True
    count: int = Field(default=3, ge=0, le=10)
    difficulty: BotDifficulty = "medium"


class CreateRoomRequest(BaseModel):
    """Unified room creation — real matches or simulations."""
    match_id: str | None = None
    group_id: str | None = None
    match_source: MatchSource = "live_api"
    bot_config: BotConfig | None = None
    phase: RoomPhase | None = None

    def resolved_bot_config(self) -> BotConfig:
        if self.bot_config:
            return self.bot_config
        if self.match_source == "demo_simulation":
            return BotConfig(enabled=True, count=3, difficulty=get_settings().DEFAULT_BOT_DIFFICULTY)
        return BotConfig(enabled=False, count=0, difficulty=get_settings().DEFAULT_BOT_DIFFICULTY)


class InjectEventRequest(BaseModel):
    event_type: str = Field(
        ...,
        pattern="^(GOAL_HOME|GOAL_AWAY|YELLOW_CARD|RED_CARD|PENALTY_SCORED|PENALTY_MISSED)$",
    )


class ResolveActiveBetRequest(BaseModel):
    correct_option: str = Field(..., min_length=1, max_length=100)


class StartDemoCompatRequest(BaseModel):
    """Backward-compat body for POST /api/demo/start."""
    phase: RoomPhase = "LOBBY"
