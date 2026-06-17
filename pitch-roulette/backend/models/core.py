from typing import Literal

from pydantic import BaseModel, Field


class UpdateProfileRequest(BaseModel):
    display_name: str = Field(..., min_length=1, max_length=50)


class CreateGroupRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=60)
    emoji: str = Field(default="⚽", max_length=4)


class JoinGroupRequest(BaseModel):
    invite_code: str = Field(..., min_length=6, max_length=12)


class JoinRoomRequest(BaseModel):
    room_code: str = Field(..., min_length=6, max_length=6)


class PredictRequest(BaseModel):
    home_goals: int = Field(..., ge=0, le=20)
    away_goals: int = Field(..., ge=0, le=20)
    predicted_outcome: Literal["HOME_WIN", "DRAW", "AWAY_WIN"]


class CloseRoomRequest(BaseModel):
    actual_home_goals: int | None = None
    actual_away_goals: int | None = None


class CreateFlashBetRequest(BaseModel):
    question: str = Field(..., min_length=3, max_length=200)
    options: list[str] = Field(..., min_length=2, max_length=4)
    wager_tier: Literal["LOW", "MEDIUM", "HIGH"] = "MEDIUM"


class FlashBetAnswerRequest(BaseModel):
    chosen_option: str


class ResolveFlashBetRequest(BaseModel):
    correct_option: str


class RoomMessageRequest(BaseModel):
    content: str = Field(..., min_length=1, max_length=200)


class ToggleChatRequest(BaseModel):
    enabled: bool


class KickPlayerRequest(BaseModel):
    user_id: str


class DraftPickRequest(BaseModel):
    player_id: str


class PurchaseSabotageRequest(BaseModel):
    sabotage_type: Literal[
        "BLINDFOLD", "TAX", "SILENCE", "JINX", "MIRROR", "DOUBLE_OR_NOTHING"
    ]
    target_user_id: str
