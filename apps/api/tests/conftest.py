from __future__ import annotations

import os
from collections.abc import Iterator

import pytest

from app.config import get_settings

_TEST_ENV_DEFAULTS = {
    "METAVIEW_APP_EDITION": "self",
    "METAVIEW_GENERATION_MODE": "single",
    "METAVIEW_OPENAI_API_KEY": "",
    "METAVIEW_TTS_API_KEY": "",
    "METAVIEW_RATE_LIMIT_ENABLED": "false",
}


def pytest_configure() -> None:
    for key, value in _TEST_ENV_DEFAULTS.items():
        os.environ.setdefault(key, value)


@pytest.fixture(autouse=True)
def _clear_settings_cache() -> Iterator[None]:
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()
