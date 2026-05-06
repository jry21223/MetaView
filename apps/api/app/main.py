from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.infrastructure.persistence.db_init import init_db
from app.presentation.error_handlers import register_error_handlers
from app.presentation.router_exports import router as exports_router
from app.presentation.router_pipeline import router as pipeline_router
from app.presentation.router_runs import router as runs_router


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

    app.include_router(pipeline_router, prefix=settings.api_prefix)
    app.include_router(runs_router, prefix=settings.api_prefix)
    app.include_router(exports_router, prefix=settings.api_prefix)

    register_error_handlers(app)

    @app.get("/health")
    async def health() -> dict:
        return {"status": "ok", "version": settings.app_version}

    return app


app = create_app()
