from __future__ import annotations

import logging

from app.application.dto.pipeline_dto import PipelineRequest
from app.application.ports.llm_provider import ILLMProvider
from app.application.ports.run_repository import IRunRepository
from app.domain.models.cir import CirDocument
from app.domain.models.pipeline_run import PipelineRunStatus
from app.domain.models.topic import TopicDomain
from app.domain.services.cir_prompt import build_cir_prompt
from app.domain.services.domain_router import keyword_hint
from app.domain.services.playbook_builder import build_playbook

logger = logging.getLogger(__name__)


class RunPipelineUseCase:
    def __init__(self, run_repo: IRunRepository, llm: ILLMProvider) -> None:
        self._repo = run_repo
        self._llm = llm

    async def execute(self, run_id: str, request: PipelineRequest) -> None:
        self._repo.update(run_id, status=PipelineRunStatus.RUNNING)
        try:
            domain_hint = _resolve_domain(request.domain, request.prompt)
            system, user = build_cir_prompt(request.prompt, domain_hint)
            raw = await self._llm.complete(system, user)
            raw = _strip_markdown_fences(raw)
            cir = CirDocument.model_validate_json(raw)
            playbook = build_playbook(
                cir,
                execution_map=None,
                source_code=request.source_code,
                source_language=request.language,
            )
            self._repo.update(
                run_id,
                status=PipelineRunStatus.SUCCEEDED,
                playbook_json=playbook.model_dump_json(),
            )
        except Exception as exc:
            logger.exception("Pipeline run %s failed", run_id)
            self._repo.update(
                run_id,
                status=PipelineRunStatus.FAILED,
                error=str(exc),
            )


def _resolve_domain(explicit: str | None, prompt: str) -> TopicDomain:
    if explicit:
        try:
            return TopicDomain(explicit.lower())
        except ValueError:
            pass
    return keyword_hint(prompt)


def _strip_markdown_fences(text: str) -> str:
    """Remove ```json ... ``` wrappers that some LLMs add despite instructions."""
    text = text.strip()
    if text.startswith("```"):
        lines = text.splitlines()
        # drop first line (```json or ```) and last line (```)
        inner = lines[1:] if lines[-1].strip() == "```" else lines[1:]
        if inner and inner[-1].strip() == "```":
            inner = inner[:-1]
        text = "\n".join(inner).strip()
    return text
