from services.flash_bet_scheduler import (
    FLASH_BET_SCHEDULE,
    DEMO_FLASH_BET_SCHEDULE,
    maybe_fire_flash_bet,
)
from services.event_pipeline import start_event_pipeline

start_flash_bet_scheduler = start_event_pipeline
start_flash_bet_generator = start_event_pipeline
