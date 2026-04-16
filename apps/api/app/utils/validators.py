"""Shared field validators for Pydantic models."""

from typing import Any


def normalize_optional_str(value: str | None) -> str | None:
    """Strip whitespace from optional strings; return None for empty."""
    if value is None:
        return None
    normalized = value.strip()
    return normalized or None


def normalize_optional_timeout(value: float | str | None) -> float | str | None:
    """Normalize optional timeout values; strip whitespace from string inputs."""
    if value is None:
        return None
    if isinstance(value, str):
        normalized = value.strip()
        return normalized or None
    return value


def normalize_optional_any(value: Any) -> Any:
    """Generic normalizer for optional values; strip strings, return others unchanged."""
    if value is None:
        return None
    if isinstance(value, str):
        return value.strip() or None
    return value