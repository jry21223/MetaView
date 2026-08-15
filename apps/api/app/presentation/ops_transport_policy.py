from __future__ import annotations

import ipaddress
import os

from app.config import Settings


def validate_ops_transport_allowlist(settings: Settings) -> tuple[str, ...]:
    """Fail closed when an ops deployment has no valid IP/CIDR pre-gate.

    The actual nginx allow rules are rendered by the deployment host, but the
    versioned API must not boot an ops edition that silently omitted the
    transport boundary. Self edition intentionally ignores this setting.
    """

    if settings.app_edition != "ops":
        return ()

    raw = os.getenv("METAVIEW_OPS_ALLOW_IPS", "")
    entries = tuple(part for part in raw.replace(",", " ").split() if part)
    if not entries:
        raise RuntimeError(
            "METAVIEW_OPS_ALLOW_IPS is required when app_edition='ops'; "
            "configure at least one trusted IP/CIDR before starting the ops API"
        )

    for entry in entries:
        try:
            ipaddress.ip_network(entry, strict=False)
        except ValueError as exc:
            raise RuntimeError(
                f"METAVIEW_OPS_ALLOW_IPS contains an invalid IP/CIDR: {entry}"
            ) from exc

    return entries
