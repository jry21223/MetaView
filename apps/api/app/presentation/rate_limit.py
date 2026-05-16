from __future__ import annotations

from fastapi import FastAPI
from fastapi.responses import JSONResponse
from slowapi import Limiter
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from slowapi.util import get_remote_address
from starlette.requests import Request

from app.config import Settings, get_settings

_limiter: Limiter | None = None


def get_limiter() -> Limiter:
    """Return the singleton ``Limiter`` so route decorators can reference it.

    The limiter is created lazily (on first import of this module by a route
    file). It uses an in-memory store, which is sufficient for single-process
    deployments; multi-worker deployments should swap to a Redis backend.
    """
    global _limiter
    if _limiter is None:
        _limiter = Limiter(key_func=get_remote_address, enabled=True)
    return _limiter


def install_rate_limiter(app: FastAPI, settings: Settings) -> None:
    """Wire the slowapi limiter and exception handler onto ``app``."""
    limiter = get_limiter()
    limiter.enabled = settings.rate_limit_enabled
    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_handler)
    app.add_middleware(SlowAPIMiddleware)


async def _rate_limit_handler(request: Request, exc: Exception) -> JSONResponse:
    if not isinstance(exc, RateLimitExceeded):
        raise exc
    return JSONResponse(
        status_code=429,
        content={"detail": f"rate limit exceeded: {exc.detail}"},
    )


def _write_limit_value() -> str:
    return get_settings().rate_limit_write


def _read_limit_value() -> str:
    return get_settings().rate_limit_read


def write_limit():
    """Decorator factory for cost-sensitive write endpoints (LLM/export).

    Passes the limit *expression* as a callable so slowapi resolves the current
    settings on each request — this keeps tests able to monkey-patch the env
    after the routes are imported.
    """
    return get_limiter().limit(_write_limit_value)


def read_limit():
    """Decorator factory for cheap read endpoints."""
    return get_limiter().limit(_read_limit_value)


__all__ = ["get_limiter", "install_rate_limiter", "read_limit", "write_limit"]
