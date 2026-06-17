"""Unit tests for runtime feature flags."""
import os

import pytest
from fastapi import HTTPException

from services import feature_flags


@pytest.fixture(autouse=True)
def _clear_flag_cache():
    feature_flags.get_feature_flags.cache_clear()
    yield
    feature_flags.get_feature_flags.cache_clear()


class TestFeatureFlags:
    def test_defaults_all_enabled(self, monkeypatch):
        for key in ("FEATURE_SABOTAGE", "FEATURE_DRAFT", "FEATURE_SIDES", "FEATURE_FLASH_BETS"):
            monkeypatch.delenv(key, raising=False)
        flags = feature_flags.get_feature_flags()
        assert flags["sabotage_shop"] is True
        assert flags["fantasy_draft"] is True
        assert flags["side_assignment"] is True
        assert flags["flash_bets"] is True

    def test_env_disable(self, monkeypatch):
        monkeypatch.setenv("FEATURE_SABOTAGE", "false")
        feature_flags.get_feature_flags.cache_clear()
        assert feature_flags.get_feature_flags()["sabotage_shop"] is False

    def test_require_flag_raises(self, monkeypatch):
        monkeypatch.setenv("FEATURE_DRAFT", "off")
        feature_flags.get_feature_flags.cache_clear()
        with pytest.raises(HTTPException) as exc:
            feature_flags.require_flag("fantasy_draft")
        assert exc.value.status_code == 503
        assert exc.value.detail["error"] == "feature_disabled"
