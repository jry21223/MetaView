from __future__ import annotations

import json
import logging

from app.application.dto.pipeline_dto import PipelineRequest
from app.application.ports.llm_provider import ILLMProvider
from app.application.ports.run_repository import IRunRepository
from app.domain.models.cir import CirDocument, ExecutionMap
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
            system, user = build_cir_prompt(
                request.prompt,
                domain_hint,
                source_code=request.source_code,
                language=request.language,
            )
            raw = await self._llm.complete(system, user)
            raw = _strip_markdown_fences(raw)
            cir, execution_map = _parse_combined_output(raw)
            playbook = build_playbook(
                cir,
                execution_map=execution_map,
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


def _parse_combined_output(raw: str) -> tuple[CirDocument, ExecutionMap | None]:
    """Parse LLM output as either combined `{cir, execution_map}` or legacy CIR-only.

    The new prompt asks for the combined shape; the legacy path is retained so
    the mock provider and any out-of-spec LLM responses still work (with no
    execution_map → fixed-frame timing, no code highlight).
    """
    data = json.loads(raw)
    if isinstance(data, dict) and "cir" in data:
        cir = CirDocument.model_validate(data["cir"])
        execution_map: ExecutionMap | None = None
        em_payload = data.get("execution_map")
        if em_payload:
            try:
                execution_map = ExecutionMap.model_validate(em_payload)
            except Exception as exc:  # noqa: BLE001 — log but degrade gracefully
                logger.warning("Failed to parse execution_map; degrading: %s", exc)
                execution_map = None
        return cir, execution_map
    # Legacy CIR-only payload
    return CirDocument.model_validate(data), None


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
        lines = text.splitlines()[1:]  # drop opening ```json or ```
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]  # drop closing ```
        text = "\n".join(lines).strip()
    return text
