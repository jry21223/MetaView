from __future__ import annotations

import logging
from functools import lru_cache
from typing import Annotated

from fastapi import Depends

from app.application.ports.llm_provider import ILLMProvider
from app.application.ports.run_repository import IRunRepository
from app.config import Settings, get_settings
from app.infrastructure.llm.openai_provider import OpenAIProvider
from app.infrastructure.persistence.sqlite_run_repository import SqliteRunRepository

logger = logging.getLogger(__name__)


@lru_cache
def _get_run_repo(db_path: str) -> SqliteRunRepository:
    return SqliteRunRepository(db_path)


@lru_cache
def _get_openai_provider(api_key: str, base_url: str, model: str, timeout: float) -> OpenAIProvider:
    return OpenAIProvider(api_key=api_key, base_url=base_url, model=model, timeout=timeout)


def get_run_repo(settings: Annotated[Settings, Depends(get_settings)]) -> IRunRepository:
    return _get_run_repo(settings.history_db_path)


def get_llm_provider(settings: Annotated[Settings, Depends(get_settings)]) -> ILLMProvider:
    if not settings.openai_api_key:
        logger.warning("METAVIEW_OPENAI_API_KEY not set — using mock LLM provider")
        return _MockLLMProvider()
    model = settings.openai_model or "gpt-4o-mini"
    timeout = settings.openai_timeout_s or 300.0
    return _get_openai_provider(
        settings.openai_api_key, settings.openai_base_url, model, timeout
    )


class _MockLLMProvider:
    """Fallback when no API key is configured. Returns a minimal valid CIR."""

    async def complete(self, system: str, user: str) -> str:  # noqa: ARG002
        import json
        return json.dumps({
            "version": "0.1.0",
            "title": "Mock Algorithm Demo",
            "domain": "algorithm",
            "summary": "Mock response — set METAVIEW_OPENAI_API_KEY to enable real generation.",
            "steps": [
                {
                    "id": "step_01",
                    "title": "Initial State",
                    "narration": (
                        "This is a mock response."
                        " Configure an API key to generate real content."
                    ),
                    "visual_kind": "array",
                    "tokens": [
                        {"id": "t0", "label": "1", "value": "1", "emphasis": "primary"},
                        {"id": "t1", "label": "2", "value": "2", "emphasis": "secondary"},
                        {"id": "t2", "label": "3", "value": "3", "emphasis": "secondary"},
                    ],
                    "annotations": [],
                }
            ],
        })
