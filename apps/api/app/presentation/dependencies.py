from __future__ import annotations

import logging
from functools import lru_cache
from typing import Annotated

from fastapi import Depends

from app.application.ports.account_repository import IAccountRepository
from app.application.ports.agent_provider import IAgentProvider
from app.application.ports.export_repository import IExportJobRepository
from app.application.ports.llm_provider import ILLMProvider
from app.application.ports.oauth_client import IOAuthClient
from app.application.ports.payment_gateway import IPaymentGateway
from app.application.ports.run_repository import IRunRepository
from app.application.use_cases.account import AccountUseCase
from app.application.use_cases.newapi_topup import NewApiTopupUseCase
from app.config import Settings, get_settings
from app.infrastructure.agent.codex_agent_provider import CodexAgentProvider
from app.infrastructure.agent.http_agent_provider import HttpAgentProvider
from app.infrastructure.auth.wechat_oauth import WeChatOAuthClient
from app.infrastructure.llm.openai_provider import OpenAIProvider
from app.infrastructure.payment.wechat_pay import WeChatPayClient
from app.infrastructure.persistence.in_memory_export_repository import (
    InMemoryExportJobRepository,
)
from app.infrastructure.persistence.sqlite_account_repository import SqliteAccountRepository
from app.infrastructure.persistence.sqlite_newapi_topup_repository import (
    SqliteNewApiTopupRepository,
)
from app.infrastructure.persistence.sqlite_run_repository import SqliteRunRepository

logger = logging.getLogger(__name__)


@lru_cache
def _get_run_repo(db_path: str) -> SqliteRunRepository:
    return SqliteRunRepository(db_path)


@lru_cache(maxsize=4)
def _get_account_repo(db_path: str) -> SqliteAccountRepository:
    return SqliteAccountRepository(db_path)


@lru_cache(maxsize=4)
def _get_newapi_topup_repo(db_path: str) -> SqliteNewApiTopupRepository:
    return SqliteNewApiTopupRepository(db_path)


@lru_cache
def _get_openai_provider(
    api_key: str,
    base_url: str,
    model: str,
    timeout: float,
    max_tokens: int | None,
    reasoning_effort: str | None,
) -> OpenAIProvider:
    return OpenAIProvider(
        api_key=api_key,
        base_url=base_url,
        model=model,
        timeout=timeout,
        max_tokens=max_tokens,
        reasoning_effort=reasoning_effort,
    )


def get_run_repo(settings: Annotated[Settings, Depends(get_settings)]) -> IRunRepository:
    return _get_run_repo(settings.history_db_path)


def get_account_repo(
    settings: Annotated[Settings, Depends(get_settings)],
) -> IAccountRepository:
    return _get_account_repo(settings.history_db_path)


def get_newapi_topup_repo(
    settings: Annotated[Settings, Depends(get_settings)],
) -> SqliteNewApiTopupRepository:
    return _get_newapi_topup_repo(settings.history_db_path)


def get_payment_gateway(
    settings: Annotated[Settings, Depends(get_settings)],
) -> IPaymentGateway:
    return WeChatPayClient(settings)


def get_oauth_client(
    settings: Annotated[Settings, Depends(get_settings)],
) -> IOAuthClient:
    return WeChatOAuthClient(settings)


def get_account_use_case(
    settings: Annotated[Settings, Depends(get_settings)],
    repo: Annotated[IAccountRepository, Depends(get_account_repo)],
    payment: Annotated[IPaymentGateway, Depends(get_payment_gateway)],
    oauth: Annotated[IOAuthClient, Depends(get_oauth_client)],
) -> AccountUseCase:
    return AccountUseCase(settings=settings, repo=repo, payment=payment, oauth=oauth)


def get_newapi_topup_use_case(
    settings: Annotated[Settings, Depends(get_settings)],
    repo: Annotated[SqliteNewApiTopupRepository, Depends(get_newapi_topup_repo)],
    payment: Annotated[IPaymentGateway, Depends(get_payment_gateway)],
) -> NewApiTopupUseCase:
    return NewApiTopupUseCase(settings=settings, repo=repo, payment=payment)


@lru_cache
def _get_export_repo() -> InMemoryExportJobRepository:
    return InMemoryExportJobRepository()


def get_export_repo() -> IExportJobRepository:
    return _get_export_repo()


def get_llm_provider(settings: Annotated[Settings, Depends(get_settings)]) -> ILLMProvider:
    if not settings.openai_api_key:
        logger.warning("METAVIEW_OPENAI_API_KEY not set — using mock LLM provider")
        return _MockLLMProvider()
    model = settings.openai_model or "gpt-4o-mini"
    timeout = settings.openai_timeout_s or 300.0
    return _get_openai_provider(
        settings.openai_api_key,
        settings.openai_base_url,
        model,
        timeout,
        settings.openai_max_tokens,
        settings.openai_reasoning_effort,
    )


@lru_cache
def _get_agent_provider(base_url: str, timeout_s: float) -> HttpAgentProvider:
    return HttpAgentProvider(base_url=base_url, timeout_s=timeout_s)


@lru_cache
def _get_codex_agent_provider(
    cwd: str,
    model: str | None,
    effort: str | None,
    timeout_s: float,
) -> CodexAgentProvider:
    return CodexAgentProvider(
        cwd=cwd,
        model=model,
        effort=effort,
        timeout_s=timeout_s,
    )


def get_agent_provider(
    settings: Annotated[Settings, Depends(get_settings)],
) -> IAgentProvider | None:
    """Return the configured agent sidecar client when generation_mode=agent.

    Returns ``None`` in single-shot mode so the use-case never accidentally
    calls into the sidecar (and so unit tests can construct without a
    network-bound provider).
    """
    if settings.generation_mode != "agent":
        return None
    if settings.agent_provider == "codex":
        return _get_codex_agent_provider(
            settings.codex_cwd,
            settings.codex_model,
            settings.codex_effort,
            settings.agent_timeout_s,
        )
    return _get_agent_provider(settings.agent_base_url, settings.agent_timeout_s)


def get_reviewer_llm_provider(
    settings: Annotated[Settings, Depends(get_settings)],
) -> ILLMProvider | None:
    """Return a separate provider for the reviewer/critic LLM, if configured."""
    if not settings.openai_api_key or not settings.openai_critic_model:
        return None
    timeout = settings.openai_timeout_s or 300.0
    return _get_openai_provider(
        settings.openai_api_key,
        settings.openai_base_url,
        settings.openai_critic_model,
        timeout,
        settings.openai_max_tokens,
        settings.openai_reasoning_effort,
    )


_MOCK_NOTE = "Mock response — set METAVIEW_OPENAI_API_KEY to enable real generation."

_MOCK_ALGORITHM_CIR: dict = {
    "version": "0.1.0",
    "title": "Mock Algorithm Demo",
    "domain": "algorithm",
    "summary": _MOCK_NOTE,
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
}

# Domain-aware mock for math prompts — exercises the function-plot renderer.
_MOCK_MATH_CIR: dict = {
    "version": "0.1.0",
    "title": "定积分与曲线下面积",
    "domain": "math",
    "summary": _MOCK_NOTE + " 这是一个数学函数图示例。",
    "steps": [
        {
            "id": "step_01",
            "title": "认识曲线 f(x) = x²",
            "narration": ["先画出抛物线 f(x) = x²，它在 x ≥ 0 时单调上升。"],
            "visual_kind": "function",
            "tokens": [],
            "plot": {
                "curves": [{"expression": "x^2", "label": "f(x)", "emphasis": "primary"}],
                "x_min": -1.0,
                "x_max": 3.0,
                "formula_latex": "f(x) = x^2",
            },
            "annotations": [],
        },
        {
            "id": "step_02",
            "title": "锁定区间 [0, 2]",
            "narration": ["我们关心 x 从 0 到 2 这段曲线下方的面积。"],
            "visual_kind": "function",
            "tokens": [],
            "plot": {
                "curves": [{"expression": "x^2", "label": "f(x)", "emphasis": "primary"}],
                "x_min": -1.0,
                "x_max": 3.0,
                "shade_from": 0.0,
                "shade_to": 2.0,
                "marker_x": 2.0,
                "formula_latex": "\\int_0^2 x^2\\,dx",
            },
            "annotations": [],
        },
        {
            "id": "step_03",
            "title": "用矩形逼近",
            "narration": ["把区间分成若干小段，每段用一个矩形近似——段越多越精确。"],
            "visual_kind": "function",
            "tokens": [],
            "plot": {
                "curves": [{"expression": "x^2", "label": "f(x)", "emphasis": "primary"}],
                "x_min": -1.0,
                "x_max": 3.0,
                "shade_from": 0.0,
                "shade_to": 2.0,
                "formula_latex": "\\sum f(x_i)\\,\\Delta x",
            },
            "annotations": [],
        },
        {
            "id": "step_04",
            "title": "结论：面积 = 8/3",
            "narration": ["取极限后，矩形面积之和收敛到 8/3 ≈ 2.667，这就是定积分的几何意义。"],
            "visual_kind": "function",
            "tokens": [],
            "plot": {
                "curves": [{"expression": "x^2", "label": "f(x)", "emphasis": "accent"}],
                "x_min": -1.0,
                "x_max": 3.0,
                "shade_from": 0.0,
                "shade_to": 2.0,
                "formula_latex": "\\int_0^2 x^2\\,dx = \\tfrac{8}{3}",
            },
            "annotations": [],
        },
    ],
}


class _MockLLMProvider:
    """Fallback when no API key is configured. Returns a minimal valid CIR.

    The payload is domain-aware so that math prompts still demonstrate the
    function-plot renderer even without a real LLM configured.
    """

    async def complete(self, system: str, user: str) -> str:  # noqa: ARG002
        import json

        # Lazy import to keep this module free of domain-service import cycles.
        from app.domain.models.topic import TopicDomain
        from app.domain.services.domain_router import keyword_hint

        payload = (
            _MOCK_MATH_CIR
            if keyword_hint(user or "") == TopicDomain.MATH
            else _MOCK_ALGORITHM_CIR
        )
        return json.dumps(payload)
