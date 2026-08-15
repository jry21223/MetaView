from __future__ import annotations

import pytest

from app.config import Settings
from app.presentation.ops_transport_policy import validate_ops_transport_allowlist


def ops_settings() -> Settings:
    return Settings(
        app_edition="ops",
        ops_admin_user_id="ops-admin",
        ops_host="ops.metaview.top",
        wechat_login_success_url="https://ops.metaview.top/",
        _env_file=None,
    )


def test_ops_transport_allowlist_is_required(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("METAVIEW_OPS_ALLOW_IPS", raising=False)
    with pytest.raises(RuntimeError, match="METAVIEW_OPS_ALLOW_IPS is required"):
        validate_ops_transport_allowlist(ops_settings())


def test_ops_transport_allowlist_rejects_invalid_entry(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("METAVIEW_OPS_ALLOW_IPS", "203.0.113.7 definitely-not-a-cidr")
    with pytest.raises(RuntimeError, match="invalid IP/CIDR"):
        validate_ops_transport_allowlist(ops_settings())


def test_ops_transport_allowlist_accepts_ips_and_cidrs(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv(
        "METAVIEW_OPS_ALLOW_IPS",
        "203.0.113.7, 198.51.100.0/24 2001:db8::/48",
    )
    assert validate_ops_transport_allowlist(ops_settings()) == (
        "203.0.113.7",
        "198.51.100.0/24",
        "2001:db8::/48",
    )


def test_self_edition_does_not_require_ops_transport_allowlist(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("METAVIEW_OPS_ALLOW_IPS", raising=False)
    settings = Settings(app_edition="self", _env_file=None)
    assert validate_ops_transport_allowlist(settings) == ()
