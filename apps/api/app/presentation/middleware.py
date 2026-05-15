from __future__ import annotations

from collections.abc import Awaitable, Callable

from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.types import ASGIApp


class BodySizeLimitMiddleware(BaseHTTPMiddleware):
    """Reject requests whose Content-Length exceeds ``max_bytes``.

    Reading the body to enforce the limit is intentionally avoided — Starlette
    streams the body to downstream handlers, and we want the rejection to
    happen before any handler is invoked. Clients that omit Content-Length
    (e.g. chunked uploads) fall through; the handlers themselves are still
    protected by Pydantic field constraints.
    """

    def __init__(self, app: ASGIApp, max_bytes: int) -> None:
        super().__init__(app)
        self._max_bytes = max_bytes

    async def dispatch(
        self,
        request: Request,
        call_next: Callable[[Request], Awaitable[JSONResponse]],
    ) -> JSONResponse:
        if request.method in {"POST", "PUT", "PATCH"}:
            content_length = request.headers.get("content-length")
            if content_length is not None:
                try:
                    length = int(content_length)
                except ValueError:
                    return JSONResponse(
                        status_code=400,
                        content={"detail": "invalid Content-Length header"},
                    )
                if length > self._max_bytes:
                    return JSONResponse(
                        status_code=413,
                        content={
                            "detail": f"request body exceeds {self._max_bytes} bytes"
                        },
                    )
        return await call_next(request)
