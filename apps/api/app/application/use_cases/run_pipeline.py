from __future__ import annotations

import asyncio
import json
import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from json import JSONDecodeError
from typing import Any

from pydantic import ValidationError

from app.application.dto.pipeline_dto import PipelineRequest
from app.application.ports.agent_provider import IAgentProvider
from app.application.ports.director_repository import IRunDirectorRepository
from app.application.ports.llm_provider import ILLMProvider
from app.application.ports.router_provider import IRouterProvider
from app.application.ports.run_repository import IRunRepository
from app.config import GenerationMode, RouterMode
from app.domain.models.cir import CirDocument, ExecutionMap
from app.domain.models.pipeline_run import PipelineRunStatus
from app.domain.models.playbook import PlaybookScript
from app.domain.models.review import CirReviewIssue, CirReviewReport, ReviewSeverity
from app.domain.models.route_decision import RouteDecision
from app.domain.services.cir_prompt import build_cir_prompt
from app.domain.services.cir_quality import validate_cir_quality
from app.domain.services.director_builder import build_default_director
from app.domain.services.domain_router import SkillMode, TopicRoute, route_topic
from app.domain.services.model_router import topic_route_from_decision
from app.domain.services.playbook_builder import build_playbook
from app.domain.services.reviewer_prompt import (
    PipelineValidationError,
    ReviewResult,
    build_reviewer_prompt,
)
from app.domain.skills.base import (
    SkillExecutionContext,
    SkillRouteInput,
    SkillRouteMatch,
)
from app.domain.skills.registry import SkillRegistry, build_default_skill_registry

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class ParseResult:
    ok: bool
    raw_data: dict[str, Any] | None = None
    cir: CirDocument | None = None
    execution_map: ExecutionMap | None = None
    issues: list[CirReviewIssue] | None = None


@dataclass(frozen=True)
class RouteContext:
    decision: RouteDecision
    fallback: str = "none"
    router_model: str | None = None


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
        director_repo: IRunDirectorRepository | None = None,
        skill_registry: SkillRegistry | None = None,
        router_provider: IRouterProvider | None = None,
        router_mode: RouterMode | str = "hybrid",
        router_min_confidence: float = 0.72,
        router_refine_confidence: float = 0.55,
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
        self._director_repo = director_repo
        self._skill_registry = skill_registry or build_default_skill_registry()
        self._router_provider = router_provider
        self._router_mode: RouterMode = (
            router_mode if router_mode in {"off", "heuristic", "llm", "hybrid"} else "hybrid"
        )
        self._router_min_confidence = router_min_confidence
        self._router_refine_confidence = router_refine_confidence

    async def execute(self, run_id: str, request: PipelineRequest) -> None:
        await self._repo.update(run_id, status=PipelineRunStatus.RUNNING)
        try:
            route_match = await self._route_request(request)
            if route_match is not None:
                try:
                    handled = await self._try_execute_skill(run_id, request, route_match)
                except AssertionError as exc:
                    await self._fail_skill_consistency(run_id, route_match, str(exc))
                    return
                if handled:
                    return

            route_context = self._generic_route_context(request, route_match=route_match)
            if self._generation_mode == "agent" and self._agent_provider is not None:
                await self._run_with_total_timeout(
                    self._execute_agent(run_id, request, route_context=route_context),
                    run_id=run_id,
                )
                return

            await self._run_with_total_timeout(
                self._execute_single(run_id, request, route_context=route_context),
                run_id=run_id,
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

    async def _route_request(self, request: PipelineRequest) -> SkillRouteMatch | None:
        if request.skill_mode_override == "generic":
            return None

        mode = self._router_mode

        if mode in {"llm", "hybrid"} and self._router_provider is not None:
            try:
                route_input = SkillRouteInput(
                    prompt=request.prompt,
                    source_code=request.source_code,
                    language=request.language,
                )
                model_match = await self._router_provider.route(
                    request=route_input,
                    manifests=self._skill_registry.manifests(),
                )
                if (
                    model_match is not None
                    and model_match.confidence >= self._router_min_confidence
                ):
                    return model_match
                if (
                    model_match is not None
                    and model_match.confidence >= self._router_refine_confidence
                ):
                    logger.info(
                        "Skill router requested refinement; falling back: confidence=%.2f",
                        model_match.confidence,
                    )
            except Exception as exc:  # noqa: BLE001 - route fallback is intentional.
                logger.warning("Skill router failed; falling back to registry heuristic: %s", exc)

        if mode in {"heuristic", "hybrid"}:
            return self._skill_registry.heuristic_match(
                SkillRouteInput(
                    prompt=request.prompt,
                    source_code=request.source_code,
                    language=request.language,
                )
            )

        return None

    def _generic_route_context(
        self,
        request: PipelineRequest,
        *,
        route_match: SkillRouteMatch | None,
    ) -> RouteContext:
        topic_route = _resolve_route(request)
        if route_match is not None:
            route_domain = (
                route_match.domain
                or (topic_route.domain.value if topic_route.domain else None)
            )
            route = RouteDecision(
                destination="generic_cir",
                domain=route_domain,
                skill_id=route_match.skill_id,
                confidence=route_match.confidence,
                reason=route_match.reason or "skill_not_handled",
                matched_capability=route_match.capability_id,
                problem_spec=route_match.problem_spec,
                needs_refinement=route_match.needs_refinement,
            )
            return RouteContext(
                route,
                fallback=f"skill_not_handled:{route_match.skill_id}",
                router_model=getattr(self._router_provider, "model_name", None),
            )

        confidence = 0.62 if topic_route.domain is not None else 0.0
        route = RouteDecision(
            destination="generic_cir",
            domain=topic_route.domain.value if topic_route.domain else None,
            confidence=confidence,
            reason=topic_route.reason or "topic_route",
            matched_capability=",".join(topic_route.matched_keywords) or None,
        )
        fallback = "router_disabled" if self._router_mode == "off" else "none"
        return RouteContext(
            route,
            fallback=fallback,
            router_model=getattr(self._router_provider, "model_name", None),
        )

    async def _try_execute_skill(
        self,
        run_id: str,
        request: PipelineRequest,
        route_match: SkillRouteMatch,
    ) -> bool:
        skill = self._skill_registry.get(route_match.skill_id)
        if skill is None:
            return False

        problem_spec = None
        spec_source = "none"
        if route_match.problem_spec:
            problem_spec = skill.validate_problem_spec(route_match.problem_spec)
            if problem_spec is not None:
                spec_source = "model"
        if problem_spec is None:
            heuristic_match = skill.heuristic_match(
                SkillRouteInput(
                    prompt=request.prompt,
                    source_code=request.source_code,
                    language=request.language,
                )
            )
            if heuristic_match and heuristic_match.problem_spec:
                problem_spec = skill.validate_problem_spec(heuristic_match.problem_spec)
                if problem_spec is not None:
                    spec_source = "heuristic"

        result = await skill.execute(
            SkillExecutionContext(
                run_id=run_id,
                prompt=request.prompt,
                route_match=route_match,
            ),
            problem_spec,
        )
        if not result.handled or result.playbook_json is None:
            return False

        playbook = PlaybookScript.model_validate_json(result.playbook_json)
        review_report = CirReviewReport(status="clean")
        review_report.actions.extend([
            "router:skill_pack",
            f"router:skill_id:{route_match.skill_id}",
            f"router:confidence:{route_match.confidence}",
            f"router:spec_source:{spec_source}",
            *(
                [f"router:capability:{route_match.capability_id}"]
                if route_match.capability_id
                else []
            ),
            *result.review_actions,
        ])
        await self._repo.update(
            run_id,
            status=PipelineRunStatus.SUCCEEDED,
            playbook_json=result.playbook_json,
            review_json=review_report.model_dump_json(),
        )
        await self._upsert_default_director(run_id, playbook)
        return True

    async def _fail_skill_consistency(
        self,
        run_id: str,
        route_match: SkillRouteMatch,
        message: str,
    ) -> None:
        review_report = CirReviewReport(
            status="failed",
            actions=[
                "router:skill_pack",
                f"router:skill_id:{route_match.skill_id}",
                f"router:confidence:{route_match.confidence}",
                "router:fallback:fail_closed_consistency",
            ],
            issues=[
                CirReviewIssue(
                    code="skill.consistency_failed",
                    severity=ReviewSeverity.ERROR,
                    path="playbook",
                    message=message or "Deterministic skill output failed consistency validation.",
                )
            ],
        )
        await self._repo.update(
            run_id,
            status=PipelineRunStatus.FAILED,
            error=message or "Deterministic skill output failed consistency validation.",
            review_json=review_report.model_dump_json(),
        )

    async def _execute_agent(
        self,
        run_id: str,
        request: PipelineRequest,
        *,
        route_context: RouteContext,
    ) -> None:
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
                request.prompt,
                provider_config=provider_config,
                route_decision=route_context.decision.model_dump(mode="json"),
            )
            # Validate the sidecar payload against the canonical PlaybookScript
            # schema so any malformed output is caught here (not at render time).
            playbook = PlaybookScript.model_validate(playbook_dict)
            await self._repo.update(
                run_id,
                status=PipelineRunStatus.SUCCEEDED,
                playbook_json=playbook.model_dump_json(),
                review_json=CirReviewReport(
                    status="clean",
                    actions=_route_review_actions(route_context, generator="agent"),
                ).model_dump_json(),
            )
            await self._upsert_default_director(run_id, playbook)
        except Exception as exc:
            logger.exception("Pipeline run %s (agent mode) failed", run_id)
            await self._repo.update(
                run_id,
                status=PipelineRunStatus.FAILED,
                error=str(exc),
                review_json=CirReviewReport(
                    status="failed",
                    actions=_route_review_actions(route_context, generator="agent"),
                ).model_dump_json(),
            )

    async def _execute_single(
        self,
        run_id: str,
        request: PipelineRequest,
        *,
        route_context: RouteContext,
    ) -> None:
        """Original single-shot pipeline: prompt → LLM → CIR JSON → builder."""
        review_report = CirReviewReport(
            actions=_route_review_actions(route_context, generator="generic_cir")
        )
        try:
            route = topic_route_from_decision(route_context.decision)
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
                route_decision=route_context.decision,
            )
            raw = await self._llm.complete(system, user)
            parsed, review_report = await self._review_output(
                run_id=run_id,
                request=request,
                system=system,
                user=user,
                raw=raw,
                initial_actions=_route_review_actions(route_context, generator="generic_cir"),
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
            await self._upsert_default_director(run_id, playbook)
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

    async def _upsert_default_director(
        self,
        run_id: str,
        playbook: PlaybookScript,
    ) -> None:
        if self._director_repo is None:
            return
        director = build_default_director(playbook, run_id)
        try:
            await self._director_repo.upsert(
                director,
                datetime.now(timezone.utc).isoformat(),
            )
        except Exception:  # noqa: BLE001 - hidden metadata must not fail generation.
            logger.warning("Failed to persist default director for run %s", run_id, exc_info=True)

    async def _review_output(
        self,
        *,
        run_id: str,
        request: PipelineRequest,
        system: str,
        user: str,
        raw: str,
        initial_actions: list[str] | None = None,
    ) -> tuple[ParseResult, CirReviewReport]:
        report = CirReviewReport(actions=list(initial_actions or []))
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


def _route_review_actions(route_context: RouteContext, *, generator: str) -> list[str]:
    route = route_context.decision
    actions = [
        f"router:destination:{route.destination}",
        f"router:confidence:{route.confidence:.2f}",
        f"router:fallback:{route_context.fallback}",
        f"generator:{generator}",
    ]
    if route_context.router_model:
        actions.append(f"router:model:{route_context.router_model}")
    if route.domain:
        actions.append(f"router:domain:{route.domain}")
    if route.skill_id:
        actions.append(f"router:skill_id:{route.skill_id}")
    if route.matched_capability:
        actions.append(f"router:matched_capability:{route.matched_capability}")
    if route.needs_refinement:
        actions.append("router:needs_refinement:true")
    if route.unsupported_reason:
        actions.append(f"router:unsupported:{route.unsupported_reason}")
    return actions


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
