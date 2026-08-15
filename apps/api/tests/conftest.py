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
    # Issue #227: an ops deployment must bind one admin identity. Tests that
    # opt into ops edition (``METAVIEW_APP_EDITION=ops``) without setting
    # this would otherwise fail at Settings construction. The value is
    # inert for account routes, which still gate via require_wechat_session,
    # not require_bound_admin_session.
    "METAVIEW_OPS_ADMIN_USER_ID": "ops-admin",
    # Issue #225: ops edition refuses to boot when wechat_login_success_url
    # targets localhost / 127.0.0.1. Tests that opt into ops edition above
    # (METAVIEW_APP_EDITION=ops) would otherwise fail at Settings
    # construction; pick a non-local default so they pass the new validator
    # without each setting their own success URL.
    "METAVIEW_WECHAT_LOGIN_SUCCESS_URL": "https://ops.metaview.top/",
}


def pytest_configure() -> None:
    for key, value in _TEST_ENV_DEFAULTS.items():
        os.environ.setdefault(key, value)


@pytest.fixture(autouse=True)
def _clear_settings_cache() -> Iterator[None]:
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()
