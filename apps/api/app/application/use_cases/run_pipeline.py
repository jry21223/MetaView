from __future__ import annotations

import asyncio
import json
import logging
from dataclasses import dataclass
from json import JSONDecodeError
from typing import Any

from pydantic import ValidationError

from app.application.dto.pipeline_dto import PipelineRequest
from app.application.ports.agent_provider import IAgentProvider
from app.application.ports.llm_provider import ILLMProvider
from app.application.ports.run_repository import IRunRepository
from app.config import GenerationMode
from app.domain.models.cir import CirDocument, ExecutionMap
from app.domain.models.pipeline_run import PipelineRunStatus
from app.domain.models.playbook import PlaybookScript
from app.domain.models.review import CirReviewIssue, CirReviewReport, ReviewSeverity
from app.domain.services.cir_prompt import build_cir_prompt
from app.domain.services.cir_quality import validate_cir_quality
from app.domain.services.domain_router import SkillMode, TopicRoute, route_topic
from app.domain.services.playbook_builder import build_playbook
from app.domain.services.reviewer_prompt import (
    PipelineValidationError,
    ReviewResult,
    build_reviewer_prompt,
)

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class ParseResult:
    ok: bool
    raw_data: dict[str, Any] | None = None
    cir: CirDocument | None = None
    execution_map: ExecutionMap | None = None
    issues: list[CirReviewIssue] | None = None


class RunPipelineUseCase:
    def __init__(
        self,
        run_repo: IRunRepository,
        llm: ILLMProvider,
        reviewer_llm: ILLMProvider | None = None,
        max_repair_attempts: int = 0,
        reviewer_mode: str = "on_failure",
        agent_provider: IAgentProvider | None = None,
        generation_mode: GenerationMode | str = "single",
        pipeline_timeout_s: float | None = None,
    ) -> None:
        self._repo = run_repo
        self._llm = llm
        self._reviewer_llm = reviewer_llm
        self._max_repair_attempts = max(0, max_repair_attempts)
        self._reviewer_mode = _normalize_reviewer_mode(reviewer_mode)
        self._agent_provider = agent_provider
        self._generation_mode: GenerationMode = (
            generation_mode if generation_mode == "agent" else "single"
        )
        self._pipeline_timeout_s = pipeline_timeout_s

    async def execute(self, run_id: str, request: PipelineRequest) -> None:
        await self._repo.update(run_id, status=PipelineRunStatus.RUNNING)
        try:
            if self._generation_mode == "agent" and self._agent_provider is not None:
                await self._run_with_total_timeout(
                    self._execute_agent(run_id, request), run_id=run_id
                )
                return
            await self._run_with_total_timeout(
                self._execute_single(run_id, request), run_id=run_id
            )
        except TimeoutError:
            timeout = self._pipeline_timeout_s
            logger.exception("Pipeline run %s timed out after %.1fs", run_id, timeout)
            await self._repo.update(
                run_id,
                status=PipelineRunStatus.FAILED,
                error=f"Pipeline timed out after {timeout:.1f}s",
            )

    async def _run_with_total_timeout(self, operation, *, run_id: str) -> None:
        timeout = self._pipeline_timeout_s
        if timeout is None or timeout <= 0:
            await operation
            return
        try:
            await asyncio.wait_for(operation, timeout=timeout)
        except TimeoutError:
            logger.warning("Pipeline run %s exceeded total timeout %.1fs", run_id, timeout)
            raise

    async def _execute_agent(self, run_id: str, request: PipelineRequest) -> None:
        """Generate via the Node sidecar (pi-agent-core) and persist the
        resulting PlaybookScript verbatim. Skips CIR parsing / playbook_builder
        because the agent has already emitted the final shape via the Drawing
        CLI commit_step / finalize_playbook tools.
        """
        assert self._agent_provider is not None  # for type-checkers
        provider_config: dict[str, Any] | None = None
        if request.provider_api_key:
            provider_config = {
                "api_key": request.provider_api_key,
                "base_url": request.provider_base_url,
                "model": request.provider_model,
            }
        try:
            playbook_dict = await self._agent_provider.generate(
                request.prompt, provider_config=provider_config
            )
            # Validate the sidecar payload against the canonical PlaybookScript
            # schema so any malformed output is caught here (not at render time).
            playbook = PlaybookScript.model_validate(playbook_dict)
            await self._repo.update(
                run_id,
                status=PipelineRunStatus.SUCCEEDED,
                playbook_json=playbook.model_dump_json(),
            )
        except Exception as exc:
            logger.exception("Pipeline run %s (agent mode) failed", run_id)
            await self._repo.update(
                run_id,
                status=PipelineRunStatus.FAILED,
                error=str(exc),
            )

    async def _execute_single(self, run_id: str, request: PipelineRequest) -> None:
        """Original single-shot pipeline: prompt → LLM → CIR JSON → builder."""
        review_report = CirReviewReport()
        try:
            route = _resolve_route(request)
            logger.info(
                "Pipeline route: skill_mode=%s domain=%s reason=%s matched=%s",
                route.skill_mode,
                route.domain.value if route.domain else None,
                route.reason,
                route.matched_keywords,
            )
            system, user = build_cir_prompt(
                request.prompt,
                route.domain,
                source_code=request.source_code,
                language=request.language,
                skill_mode=route.skill_mode,
            )
            raw = await self._llm.complete(system, user)
            parsed, review_report = await self._review_output(
                run_id=run_id,
                request=request,
                system=system,
                user=user,
                raw=raw,
            )
            if parsed.cir is None:
                review_report.status = "failed"
                raise PipelineValidationError(review_report)

            playbook = build_playbook(
                parsed.cir,
                execution_map=parsed.execution_map,
                source_code=request.source_code,
                source_language=request.language,
            )
            await self._repo.update(
                run_id,
                status=PipelineRunStatus.SUCCEEDED,
                playbook_json=playbook.model_dump_json(),
                review_json=review_report.model_dump_json(),
            )
        except PipelineValidationError as exc:
            logger.exception("Pipeline run %s failed review", run_id)
            await self._repo.update(
                run_id,
                status=PipelineRunStatus.FAILED,
                error=humanize_issues(exc.report),
                review_json=exc.report.model_dump_json(),
            )
        except Exception as exc:
            logger.exception("Pipeline run %s failed", run_id)
            await self._repo.update(
                run_id,
                status=PipelineRunStatus.FAILED,
                error=str(exc),
                review_json=review_report.model_dump_json(),
            )

    async def _review_output(
        self,
        *,
        run_id: str,
        request: PipelineRequest,
        system: str,
        user: str,
        raw: str,
    ) -> tuple[ParseResult, CirReviewReport]:
        report = CirReviewReport()
        parsed = try_parse_combined_output(_strip_markdown_fences(raw))
        attempts_allowed = 0 if self._reviewer_mode == "off" else self._max_repair_attempts

        for attempt in range(attempts_allowed + 1):
            issues = _issues_for_parse_result(parsed, request.prompt)
            blocking = [issue for issue in issues if issue.severity == ReviewSeverity.ERROR]

            if not blocking:
                report.issues.extend(issues)
                if report.attempts > 0:
                    report.status = "repaired"
                elif any(issue.severity == ReviewSeverity.WARNING for issue in issues):
                    report.status = "warnings"
                else:
                    report.status = "clean"
                return parsed, report

            if attempt >= attempts_allowed:
                report.status = "failed"
                report.issues.extend(blocking)
                raise PipelineValidationError(report)

            # Update bookkeeping BEFORE the long-running repair call so the
            # frontend polling the run during REVIEWING sees a meaningful
            # attempts count + the blocking issues (drives the stepper UI).
            report.attempts += 1
            report.issues.extend(blocking)
            report.actions.append(f"repair_attempt_{attempt + 1}")
            await self._repo.update(
                run_id,
                status=PipelineRunStatus.REVIEWING,
                review_json=report.model_dump_json(),
            )

            raw = await self._repair_once(system, user, raw, blocking)
            parsed = try_parse_combined_output(_strip_markdown_fences(raw))

        report.status = "failed"
        raise PipelineValidationError(report)

    async def _repair_once(
        self,
        system: str,
        user: str,
        raw: str,
        blocking: list[CirReviewIssue],
    ) -> str:
        if self._reviewer_llm is not None:
            try:
                reviewer_system, reviewer_user = build_reviewer_prompt(user, raw, blocking)
                review_raw = await self._reviewer_llm.complete(reviewer_system, reviewer_user)
                result = ReviewResult.model_validate_json(_strip_markdown_fences(review_raw))
                if result.action == "correct" and result.corrected is not None:
                    return json.dumps(result.corrected, ensure_ascii=False)
                if result.action == "regenerate" and result.fix_instructions:
                    return await self._regenerate(
                        system, user, raw, blocking, result.fix_instructions
                    )
            except Exception as exc:  # noqa: BLE001 - reviewer fails → fall back to generator.
                logger.warning("Reviewer LLM failed; falling back to generator repair: %s", exc)
        return await self._regenerate(system, user, raw, blocking, None)

    async def _regenerate(
        self,
        system: str,
        user: str,
        raw: str,
        blocking: list[CirReviewIssue],
        fix_instructions: str | None,
    ) -> str:
        issue_lines = "\n".join(
            f"- {issue.code} at {issue.path}: {issue.message}"
            for issue in blocking
        )
        instruction_text = fix_instructions or "Fix every listed issue and return valid JSON only."
        repair_system = f"""{system}

You are repairing your previous CIR JSON output. Return the complete corrected
combined JSON object only. Do not include markdown fences or explanation."""
        repair_user = f"""Original request:
{user}

Previous output:
{raw}

Blocking issues:
{issue_lines}

Repair instructions:
{instruction_text}"""
        return await self._llm.complete(repair_system, repair_user)


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


def try_parse_combined_output(raw: str) -> ParseResult:
    try:
        data = json.loads(raw)
    except JSONDecodeError as exc:
        return ParseResult(
            ok=False,
            issues=[
                CirReviewIssue(
                    code="parse.invalid_json",
                    severity=ReviewSeverity.ERROR,
                    path="",
                    message=f"Output is not valid JSON: {exc.msg}",
                    suggestion="Return one JSON object with no markdown or prose.",
                )
            ],
        )

    if not isinstance(data, dict):
        return ParseResult(
            ok=False,
            raw_data=None,
            issues=[
                CirReviewIssue(
                    code="parse.invalid_shape",
                    severity=ReviewSeverity.ERROR,
                    path="",
                    message="Output must be a JSON object.",
                    suggestion="Return a combined JSON object or legacy CIR object.",
                )
            ],
        )

    try:
        cir, execution_map = _parse_combined_output(raw)
    except ValidationError as exc:
        return ParseResult(
            ok=False,
            raw_data=data,
            issues=_issues_from_validation_error(exc, "cir"),
        )
    return ParseResult(ok=True, raw_data=data, cir=cir, execution_map=execution_map, issues=[])


def humanize_issues(report: CirReviewReport) -> str:
    if not report.issues:
        return "Pipeline output failed review."
    shown = report.issues[:5]
    parts = [
        f"{issue.code} at {issue.path or '<root>'}: {issue.message}"
        for issue in shown
    ]
    suffix = (
        ""
        if len(report.issues) <= len(shown)
        else f" (+{len(report.issues) - len(shown)} more)"
    )
    prefix = f"Pipeline output failed review after {report.attempts} repair attempt(s): "
    return prefix + "; ".join(parts) + suffix


def _issues_for_parse_result(parsed: ParseResult, prompt: str) -> list[CirReviewIssue]:
    if not parsed.ok:
        return list(parsed.issues or [])
    if parsed.cir is None:
        return [
            CirReviewIssue(
                code="parse.missing_cir",
                severity=ReviewSeverity.ERROR,
                path="cir",
                message="Parsed output did not contain a CIR document.",
            )
        ]
    return validate_cir_quality(parsed.cir, parsed.execution_map, prompt)


def _issues_from_validation_error(
    exc: ValidationError,
    root: str,
) -> list[CirReviewIssue]:
    issues: list[CirReviewIssue] = []
    for error in exc.errors():
        issues.append(
            CirReviewIssue(
                code="parse.validation_error",
                severity=ReviewSeverity.ERROR,
                path=_format_error_path((root, *error.get("loc", ()))),
                message=str(error.get("msg", "Validation failed")),
                suggestion="Correct this field to match the CIR schema.",
            )
        )
    return issues


def _format_error_path(loc: tuple[Any, ...]) -> str:
    out = ""
    for item in loc:
        if isinstance(item, int):
            out += f"[{item}]"
        else:
            out += f".{item}" if out else str(item)
    return out


def _resolve_route(request: PipelineRequest) -> TopicRoute:
    route = route_topic(
        request.prompt,
        explicit_domain=request.domain,
        source_code=request.source_code,
    )
    override = (request.skill_mode_override or "auto").lower()

    if override == "generic":
        return TopicRoute(
            skill_mode=SkillMode.GENERIC,
            domain=None,
            reason="skill_mode_override_generic",
        )

    if override == "specialized":
        if route.domain is not None:
            return TopicRoute(
                skill_mode=SkillMode.SPECIALIZED,
                domain=route.domain,
                matched_keywords=route.matched_keywords,
                explicit=route.explicit,
                reason="skill_mode_override_specialized",
            )
        return TopicRoute(
            skill_mode=SkillMode.GENERIC,
            domain=None,
            matched_keywords=route.matched_keywords,
            explicit=route.explicit,
            reason="skill_mode_override_specialized_no_domain",
        )

    return route


def _strip_markdown_fences(text: str) -> str:
    """Remove ```json ... ``` wrappers that some LLMs add despite instructions."""
    text = text.strip()
    if text.startswith("```"):
        lines = text.splitlines()[1:]  # drop opening ```json or ```
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]  # drop closing ```
        text = "\n".join(lines).strip()
    return text


def _normalize_reviewer_mode(value: str) -> str:
    normalized = (value or "on_failure").strip().lower()
    if normalized not in {"off", "on_failure", "math_always", "always"}:
        return "on_failure"
    return normalized
