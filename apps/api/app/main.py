from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse

from app.config import get_settings
from app.infrastructure.persistence.db_init import init_db
from app.presentation.error_handlers import register_error_handlers
from app.presentation.middleware import BodySizeLimitMiddleware
from app.presentation.rate_limit import install_rate_limiter
from app.presentation.router_account import router as account_router
from app.presentation.router_agent import router as agent_router
from app.presentation.router_exports import router as exports_router
from app.presentation.router_mcp import router as mcp_router
from app.presentation.router_newapi_topup import router as newapi_topup_router
from app.presentation.router_ops import router as ops_router
from app.presentation.router_pipeline import router as pipeline_router
from app.presentation.router_runs import router as runs_router
from app.presentation.router_tts import router as tts_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    init_db(settings.history_db_path)
    yield


def create_app() -> FastAPI:
    settings = get_settings()

    app = FastAPI(
        title=settings.app_name,
        version=settings.app_version,
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_origin_regex=settings.cors_origin_regex,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.add_middleware(BodySizeLimitMiddleware, max_bytes=settings.max_body_bytes)
    install_rate_limiter(app, settings)

    app.include_router(pipeline_router, prefix=settings.api_prefix)
    app.include_router(runs_router, prefix=settings.api_prefix)
    app.include_router(exports_router, prefix=settings.api_prefix)
    app.include_router(tts_router, prefix=settings.api_prefix)
    app.include_router(agent_router, prefix=settings.api_prefix)
    app.include_router(mcp_router, prefix=settings.api_prefix)
    app.include_router(account_router, prefix=settings.api_prefix)
    app.include_router(newapi_topup_router, prefix=settings.api_prefix)
    app.include_router(ops_router, prefix=settings.api_prefix)

    register_error_handlers(app)

    @app.get("/health")
    async def health() -> dict:
        return {"status": "ok", "version": settings.app_version}

    @app.get("/api/query/{order_id:path}", include_in_schema=False)
    async def epay_query_subpath_compat(order_id: str, request: Request) -> RedirectResponse:
        query = f"?{request.url.query}" if request.url.query else ""
        return RedirectResponse(f"/epay/api/query/{order_id}{query}", status_code=307)

    return app


app = create_app()
