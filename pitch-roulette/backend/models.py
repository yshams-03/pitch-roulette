from typing import Any, Literal
from pydantic import BaseModel, Field, model_validator


RoomState = Literal["LOBBY", "SCOUTING", "DRAFT_LOCKED", "LIVE", "FULL_TIME", "RESULTS"]
TeamLetter = Literal["A", "B"]
SabotageType = Literal["BLINDFOLD", "TAX_COLLECTOR", "CHAT_SILENCER", "JINX", "MIRROR"]


class RoomSettings(BaseModel):
    allow_switching: bool = True
    module_fantasy: bool = True
    module_flash_bets: bool = True
    module_sabotage: bool = True
    chaos_frequency: str = "medium"
    api_buffer_seconds: int = 3
    custom_switch_penalty: int | None = None
    test_mode: bool = False
    fantasy_pick_count: int = 3
    fantasy_all_teams: bool = False
    score_predictions: dict[str, dict[str, int]] = Field(default_factory=dict)


class CreateRoomRequest(BaseModel):
    nickname: str = Field(..., min_length=1, max_length=30)
    match_id: str | None = None
    match_name: str | None = None
    team_a_name: str | None = None
    team_b_name: str | None = None


class JoinRoomRequest(BaseModel):
    code: str = Field(..., min_length=6, max_length=6)
    nickname: str = Field(..., min_length=1, max_length=30)


class UpdateSettingsRequest(BaseModel):
    session_token: str
    settings: RoomSettings


class SessionTokenRequest(BaseModel):
    session_token: str


class AdvanceStateRequest(BaseModel):
    session_token: str
    target_state: RoomState | None = None


class StartDraftRequest(BaseModel):
    session_token: str


class SwitchTeamRequest(BaseModel):
    session_token: str


class FantasyPickItem(BaseModel):
    api_player_id: int
    player_name: str
    position: str
    initial_rating: float | None = None


class FantasyPickRequest(BaseModel):
    session_token: str
    picks: list[FantasyPickItem] = Field(..., min_length=1, max_length=11)


class ScorePredictionRequest(BaseModel):
    session_token: str
    score_a: int = Field(..., ge=0, le=20)
    score_b: int = Field(..., ge=0, le=20)


class WagerRequest(BaseModel):
    session_token: str
    flash_bet_id: str
    chosen_option: str
    amount: int = Field(..., ge=10, le=500)


class SabotageDeployRequest(BaseModel):
    session_token: str
    token_type: SabotageType
    target_id: str | None = None
    target_player_id: str | None = None

    @model_validator(mode="after")
    def resolve_target(self):
        tid = self.target_id or self.target_player_id
        if not tid:
            raise ValueError("target_id or target_player_id required")
        self.target_id = tid
        return self


class ChatMessageRequest(BaseModel):
    session_token: str
    content: str = Field(..., min_length=1, max_length=200)


class ManualFlashBetRequest(BaseModel):
    session_token: str
    bet_type: str
    event_label: str
    options: dict[str, Any] = Field(default_factory=dict)


class KickPlayerRequest(BaseModel):
    session_token: str
    player_id: str | None = None
    target_player_id: str | None = None

    @model_validator(mode="after")
    def resolve_player(self):
        pid = self.player_id or self.target_player_id
        if not pid:
            raise ValueError("player_id or target_player_id required")
        self.player_id = pid
        return self


class SportsEventWebhook(BaseModel):
    fixture_id: int
    event_type: str
    event: dict[str, Any]


class ResolveFlashBetRequest(BaseModel):
    flash_bet_id: str
    winning_option: str
