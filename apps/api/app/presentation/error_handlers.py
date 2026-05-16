from __future__ import annotations

import logging

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from pydantic import ValidationError

logger = logging.getLogger(__name__)


def register_error_handlers(app: FastAPI) -> None:
    """Map common exception families to deliberate HTTP status codes.

    The previous version routed everything through ``ValueError → 422`` /
    ``Exception → 500``, which made it impossible for clients to tell apart
    "your request was malformed" from "we crashed". Issue #51.
    """

    @app.exception_handler(ValidationError)
    async def validation_error_handler(
        request: Request, exc: ValidationError
    ) -> JSONResponse:
        # Pydantic validation: surface the offending fields so the client can
        # fix its payload without trawling logs.
        return JSONResponse(
            status_code=422,
            content={"detail": "validation error", "errors": exc.errors()},
        )

    @app.exception_handler(ValueError)
    async def value_error_handler(request: Request, exc: ValueError) -> JSONResponse:
        # Domain-level invariant violation raised by use cases. 422 keeps the
        # historical contract: the request was syntactically OK but its
        # contents didn't satisfy a business rule.
        return JSONResponse(status_code=422, content={"detail": str(exc)})

    @app.exception_handler(KeyError)
    async def key_error_handler(request: Request, exc: KeyError) -> JSONResponse:
        # KeyError almost always means the caller referenced a missing
        # resource (run_id, job_id, …). 400 is more informative than 500.
        return JSONResponse(
            status_code=400,
            content={"detail": f"missing key: {exc.args[0]!r}" if exc.args else "missing key"},
        )

    @app.exception_handler(LookupError)
    async def lookup_error_handler(
        request: Request, exc: LookupError
    ) -> JSONResponse:
        # Covers IndexError + custom LookupError descendants. Same intent as
        # KeyError — the caller asked for something we don't have.
        return JSONResponse(status_code=400, content={"detail": str(exc) or "lookup error"})

    @app.exception_handler(TypeError)
    async def type_error_handler(request: Request, exc: TypeError) -> JSONResponse:
        # TypeError usually means the request body had the wrong shape after
        # Pydantic accepted it (e.g. wrong tagged-union branch). 400 fits.
        logger.warning("TypeError on %s %s: %s", request.method, request.url, exc)
        return JSONResponse(status_code=400, content={"detail": str(exc)})

    @app.exception_handler(Exception)
    async def generic_error_handler(request: Request, exc: Exception) -> JSONResponse:
        logger.exception("Unhandled error on %s %s", request.method, request.url)
        return JSONResponse(status_code=500, content={"detail": "Internal server error"})
