from __future__ import annotations

import pytest
from pydantic import ValidationError
from starlette.responses import Response

from app.config import Settings
from app.domain.models.account import Account, SessionAccount
from app.presentation.router_account import _set_session_cookie


def _session_account() -> SessionAccount:
    account = Account(
        user_id="user-1",
        display_name="微信用户",
        avatar_url=None,
        login_provider="wechat",
        status="enabled",
        role="admin",
        balance_cents=0,
        wechat_openid="openid-1",
        wechat_unionid="union-1",
    )
    return SessionAccount(token="tok-123", token_hash="hash-123", account=account)


def _cookie_header(settings: Settings) -> str:
    response = Response()
    _set_session_cookie(response, settings, _session_account())
    return response.headers.get("set-cookie", "")


def test_set_session_cookie_ops_edition_forces_secure_and_strict_samesite() -> None:
    # Issue #225: an ops deployment must ship the admin session cookie over
    # Secure + SameSite=strict even when account_session_secure keeps its loose
    # False default (that default only stays loose for local self-edition dev).
    settings = Settings(
        app_edition="ops",
        ops_admin_user_id="ops-admin",
        wechat_login_success_url="https://ops.metaview.top/",
        account_session_secure=False,
        _env_file=None,
    )
    cookie = _cookie_header(settings)
    assert "secure" in cookie.lower()
    assert "samesite=strict" in cookie.lower()
    assert "samesite=lax" not in cookie.lower()


def test_set_session_cookie_self_edition_honors_loose_defaults() -> None:
    # No regression for local self-edition dev: SameSite stays lax and the
    # Secure flag tracks account_session_secure rather than being forced.
    settings_insecure = Settings(
        app_edition="self",
        account_session_secure=False,
        _env_file=None,
    )
    cookie_insecure = _cookie_header(settings_insecure)
    assert "samesite=lax" in cookie_insecure.lower()
    assert "secure" not in cookie_insecure.lower()

    settings_secure = Settings(
        app_edition="self",
        account_session_secure=True,
        _env_file=None,
    )
    cookie_secure = _cookie_header(settings_secure)
    assert "samesite=lax" in cookie_secure.lower()
    assert "secure" in cookie_secure.lower()


def test_ops_settings_reject_localhost_wechat_login_success_url(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # ops_admin_user_id is set so the #226 validator is not the one firing
    # here; only the new #225 URL validator should reject localhost.
    monkeypatch.setenv("METAVIEW_OPS_ADMIN_USER_ID", "ops-admin")
    with pytest.raises(ValidationError, match="wechat_login_success_url"):
        Settings(
            app_edition="ops",
            ops_admin_user_id="ops-admin",
            wechat_login_success_url="http://localhost:5173/",
            _env_file=None,
        )


def test_ops_settings_reject_loopback_ip_wechat_login_success_url(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("METAVIEW_OPS_ADMIN_USER_ID", "ops-admin")
    with pytest.raises(ValidationError, match="wechat_login_success_url"):
        Settings(
            app_edition="ops",
            ops_admin_user_id="ops-admin",
            wechat_login_success_url="http://127.0.0.1:5173/",
            _env_file=None,
        )


def test_ops_settings_accept_https_wechat_login_success_url(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("METAVIEW_OPS_ADMIN_USER_ID", "ops-admin")
    settings = Settings(
        app_edition="ops",
        ops_admin_user_id="ops-admin",
        wechat_login_success_url="https://ops.metaview.top/",
        _env_file=None,
    )
    assert settings.app_edition == "ops"
    assert settings.wechat_login_success_url == "https://ops.metaview.top/"


def test_self_settings_accept_loopback_wechat_login_success_url(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # The #225 validator only restricts ops edition; self edition keeps the
    # localhost default working so local dev / `just dev` does not regress.
    monkeypatch.delenv("METAVIEW_APP_EDITION", raising=False)
    settings = Settings(
        app_edition="self",
        wechat_login_success_url="http://127.0.0.1:5173/",
        _env_file=None,
    )
    assert settings.app_edition == "self"
    assert settings.wechat_login_success_url == "http://127.0.0.1:5173/"