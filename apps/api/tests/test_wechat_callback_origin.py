from __future__ import annotations

from collections.abc import Iterator
from pathlib import Path
from urllib.parse import parse_qs, urlencode, urlsplit

import pytest
from fastapi.testclient import TestClient

from app.config import get_settings
from app.domain.models.account import OAuthIdentity
from app.infrastructure.persistence.db_init import init_db
from app.main import create_app
from app.presentation.dependencies import get_oauth_client


class FakeOAuthClient:
    configured = True

    def __init__(self) -> None:
        self.codes: list[str] = []

    def build_login_url(self, state: str) -> str:
        return f"https://open.weixin.qq.com/connect/qrconnect?{urlencode({'state': state})}"

    async def fetch_identity(self, code: str) -> OAuthIdentity:
        self.codes.append(code)
        return OAuthIdentity(
            provider="wechat",
            provider_user_id="callback-test-user",
            union_id=None,
            display_name="Callback test",
            avatar_url=None,
        )


@pytest.fixture
def ops_oauth(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> Iterator[tuple[TestClient, FakeOAuthClient]]:
    db = str(tmp_path / "callback.db")
    init_db(db)
    monkeypatch.setenv("METAVIEW_APP_EDITION", "ops")
    monkeypatch.setenv("METAVIEW_HISTORY_DB_PATH", db)
    monkeypatch.setenv(
        "METAVIEW_WECHAT_LOGIN_REDIRECT_URI", "https://metaview.top/api/v1/auth/wechat/callback"
    )
    monkeypatch.setenv("METAVIEW_WECHAT_LOGIN_SUCCESS_URL", "https://metaview.top/")
    get_settings.cache_clear()
    app = create_app()
    oauth = FakeOAuthClient()
    app.dependency_overrides[get_oauth_client] = lambda: oauth
    with TestClient(app, base_url="https://ops.metaview.top") as client:
        yield client, oauth


def test_apex_callback_moves_to_ops_before_consuming_state_or_setting_cookie(
    ops_oauth: tuple[TestClient, FakeOAuthClient],
) -> None:
    client, oauth = ops_oauth
    login = client.get("/api/v1/auth/wechat/login-url")
    assert login.status_code == 200
    state = login.json()["state"]
    guest_cookie = client.cookies.get("mv_session")
    params = {"code": "fake code/+&?", "state": state, "next": "https://untrusted.example/"}

    apex = client.get(
        "https://metaview.top/api/v1/auth/wechat/callback", params=params, follow_redirects=False
    )

    assert apex.status_code == 307
    target = urlsplit(apex.headers["location"])
    assert (target.scheme, target.netloc, target.path) == (
        "https",
        "ops.metaview.top",
        "/api/v1/auth/wechat/callback",
    )
    assert parse_qs(target.query) == {"code": [params["code"]], "state": [state]}
    assert "set-cookie" not in apex.headers
    assert apex.headers["cache-control"] == "no-store"
    assert apex.headers["referrer-policy"] == "no-referrer"
    assert oauth.codes == []

    completed = client.get(apex.headers["location"], follow_redirects=False)
    assert completed.status_code == 307
    assert completed.headers["location"] == "https://ops.metaview.top/"
    assert completed.headers["cache-control"] == "no-store"
    assert completed.headers["referrer-policy"] == "no-referrer"
    cookie = completed.headers["set-cookie"].lower()
    assert "domain=" not in cookie
    assert "secure" in cookie and "httponly" in cookie and "samesite=strict" in cookie
    assert oauth.codes == [params["code"]]
    assert client.cookies.get("mv_session") != guest_cookie
    assert client.get("/api/v1/account/me").json()["login_provider"] == "wechat"
    assert client.get("https://metaview.top/api/v1/account/me").status_code == 401
    # A successful WeChat login still cannot grant the configured admin identity.
    assert client.get("/api/v1/ops/dashboard").status_code == 403

    replay = client.get(apex.headers["location"], follow_redirects=False)
    assert replay.status_code == 400
    assert oauth.codes == [params["code"]]


def test_ops_callback_behind_http_proxy_does_not_loop(
    ops_oauth: tuple[TestClient, FakeOAuthClient],
) -> None:
    client, oauth = ops_oauth
    state = client.get("/api/v1/auth/wechat/login-url").json()["state"]
    response = client.get(
        "http://ops.metaview.top/api/v1/auth/wechat/callback",
        params={"code": "proxy-test", "state": state},
        follow_redirects=False,
    )
    assert response.status_code == 307
    assert response.headers["location"] == "https://ops.metaview.top/"
    assert oauth.codes == ["proxy-test"]
    assert "secure" in response.headers["set-cookie"].lower()


def test_ops_callback_keeps_configured_success_path_on_ops_origin(
    ops_oauth: tuple[TestClient, FakeOAuthClient], monkeypatch: pytest.MonkeyPatch
) -> None:
    client, _ = ops_oauth
    monkeypatch.setenv(
        "METAVIEW_WECHAT_LOGIN_SUCCESS_URL", "https://metaview.top/settings/?tab=account#login"
    )
    get_settings.cache_clear()
    state = client.get("/api/v1/auth/wechat/login-url").json()["state"]
    response = client.get(
        "/api/v1/auth/wechat/callback",
        params={"code": "success-path", "state": state},
        follow_redirects=False,
    )
    assert response.headers["location"] == "https://ops.metaview.top/settings/?tab=account#login"


@pytest.mark.parametrize("host", ["metaview.top", "untrusted.example"])
def test_callback_host_cannot_choose_redirect_destination(
    ops_oauth: tuple[TestClient, FakeOAuthClient], host: str
) -> None:
    client, oauth = ops_oauth
    response = client.get(
        f"https://{host}/api/v1/auth/wechat/callback",
        params={"code": "fake", "state": "fake", "redirect_uri": "https://untrusted.example/"},
        follow_redirects=False,
    )
    assert response.status_code == 307
    assert urlsplit(response.headers["location"]).netloc == "ops.metaview.top"
    assert oauth.codes == []


@pytest.mark.parametrize("params", [{}, {"code": "fake"}, {"state": "fake"}])
def test_callback_missing_parameters_still_fail_before_forwarding(
    ops_oauth: tuple[TestClient, FakeOAuthClient], params: dict[str, str]
) -> None:
    client, oauth = ops_oauth
    response = client.get(
        "https://metaview.top/api/v1/auth/wechat/callback", params=params, follow_redirects=False
    )
    assert response.status_code == 400
    assert "location" not in response.headers and "set-cookie" not in response.headers
    assert oauth.codes == []


def test_ops_callback_invalid_state_does_not_exchange_code(
    ops_oauth: tuple[TestClient, FakeOAuthClient],
) -> None:
    client, oauth = ops_oauth
    response = client.get(
        "/api/v1/auth/wechat/callback", params={"code": "fake", "state": "invalid"}
    )
    assert response.status_code == 400
    assert "set-cookie" not in response.headers
    assert oauth.codes == []


@pytest.mark.parametrize(
    "host",
    [
        "https://ops.metaview.top",
        "ops.metaview.top/path",
        "user@ops.metaview.top",
        "ops.metaview.top\\evil",
        "ops.metaview.top\n",
        "ops.metaview.top:invalid",
    ],
)
def test_malformed_configured_ops_host_fails_closed_without_consuming_state(
    ops_oauth: tuple[TestClient, FakeOAuthClient], monkeypatch: pytest.MonkeyPatch, host: str
) -> None:
    client, oauth = ops_oauth
    monkeypatch.setenv("METAVIEW_OPS_HOST", host)
    get_settings.cache_clear()
    response = client.get(
        "/api/v1/auth/wechat/callback",
        params={"code": "fake", "state": "fake"},
        follow_redirects=False,
    )
    assert response.status_code == 503
    assert "location" not in response.headers and "set-cookie" not in response.headers
    assert oauth.codes == []


def test_self_callback_remains_disabled(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    monkeypatch.setenv("METAVIEW_APP_EDITION", "self")
    monkeypatch.setenv("METAVIEW_HISTORY_DB_PATH", str(tmp_path / "self.db"))
    get_settings.cache_clear()
    with TestClient(create_app()) as client:
        response = client.get(
            "/api/v1/auth/wechat/callback",
            params={"code": "fake", "state": "fake"},
            follow_redirects=False,
        )
    assert response.status_code == 404
    assert "location" not in response.headers and "set-cookie" not in response.headers
