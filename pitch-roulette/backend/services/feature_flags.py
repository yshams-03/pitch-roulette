"""Runtime feature flags — env-based kill switches for match-day safety."""
from __future__ import annotations

import os
from functools import lru_cache


def _flag(key: str, default: str = "true") -> bool:
    return os.getenv(key, default).strip().lower() in ("1", "true", "yes", "on")


@lru_cache
def get_feature_flags() -> dict[str, bool]:
    return {
        "sabotage_shop": _flag("FEATURE_SABOTAGE", "true"),
        "fantasy_draft": _flag("FEATURE_DRAFT", "true"),
        "side_assignment": _flag("FEATURE_SIDES", "true"),
        "flash_bets": _flag("FEATURE_FLASH_BETS", "true"),
        "demo_mode": _flag("DEMO_MODE", "false"),
    }


def require_flag(name: str) -> None:
    from fastapi import HTTPException

    flags = get_feature_flags()
    if not flags.get(name, True):
        raise HTTPException(503, detail={"error": "feature_disabled", "feature": name})
