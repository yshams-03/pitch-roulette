"""Unit tests for room chat."""
import pytest

from services.room_messages import _clean


class TestProfanityFilter:
    def test_blocks_profanity(self):
        with pytest.raises(ValueError, match="message_blocked"):
            _clean("what the fuck")

    def test_allows_clean_message(self):
        assert _clean("  Great goal!  ") == "Great goal!"

    def test_rejects_empty(self):
        with pytest.raises(ValueError, match="empty_message"):
            _clean("   ")

    def test_rejects_too_long(self):
        with pytest.raises(ValueError, match="message_too_long"):
            _clean("x" * 201)
