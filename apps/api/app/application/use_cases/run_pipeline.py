from __future__ import annotations

import asyncio
import json
import logging
import re
from dataclasses import dataclass
from datetime import datetime, timezone
from json import JSONDecodeError
from typing import Any

from pydantic import ValidationError

from app.application.agent.runtime_tool_hub import RuntimeToolHub
from app.application.agent.types import AgentConstraints, AgentRequest
from app.application.dto.pipeline_dto import PipelineRequest
from app.application.ports.agent_provider import AgentProviderError, IAgentProvider
from app.application.ports.coverage_resolver import ICoverageResolver
from app.application.ports.director_repository import IRunDirectorRepository
from app.application.ports.lesson_planner import ILessonPlanner
from app.application.ports.llm_provider import ILLMProvider
from app.application.ports.router_provider import IRouterProvider
from app.application.ports.run_repository import IRunRepository
from app.application.services.coverage_resolver import DefaultCoverageResolver
from app.application.services.lesson_planner import RuleBasedLessonPlanner
from app.config import GenerationMode, RouterMode
from app.domain.models.cir import CirDocument, ExecutionMap
from app.domain.models.coverage import CoverageDecision, CoverageMode
from app.domain.models.lesson_plan import LessonPlan
from app.domain.models.pipeline_run import PipelineRunStatus
from app.domain.models.playbook import PlaybookScript
from app.domain.models.quality_report import QualityReport
from app.domain.models.review import (
    CirReviewIssue,
    CirReviewReport,
    PlaybookIssueSeverity,
    PlaybookReviewIssue,
    PlaybookReviewStatus,
    PlaybookReviewVerdict,
    ReviewSeverity,
)
from app.domain.models.route_decision import RouteDecision
from app.domain.services.cir_prompt import build_cir_prompt
from app.domain.services.cir_quality import validate_cir_quality
from app.domain.services.director_builder import build_default_director
from app.domain.services.domain_router import SkillMode, TopicRoute, route_topic
from app.domain.services.model_router import topic_route_from_decision
from app.domain.services.playbook_builder import build_playbook
from app.domain.services.playbook_quality import (
    playbook_review_verdict_from_issues,
    quality_gate_playbook,
    self_check_playbook,
)
from app.domain.services.reviewer_prompt import (
    PipelineValidationError,
    ReviewResult,
    build_playbook_reviewer_prompt,
    build_reviewer_prompt,
    parse_playbook_reviewer_output,
)
from app.domain.skills.base import (
    SkillExecutionContext,
    SkillRouteInput,
    SkillRouteMatch,
)
from app.domain.skills.registry import SkillRegistry, build_default_skill_registry

logger = logging.getLogger(__name__)

AGENT_SELF_REPAIR_ATTEMPTS = 2
AGENT_REVIEWER_REPAIR_ATTEMPTS = 1
CANONICAL_QUALITY_REPAIR_ATTEMPTS = 1


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
    coverage_decision: CoverageDecision
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
        lesson_planner: ILessonPlanner | None = None,
        coverage_resolver: ICoverageResolver | None = None,
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
        self._lesson_planner = lesson_planner or RuleBasedLessonPlanner()
        self._coverage_resolver = coverage_resolver or DefaultCoverageResolver(
            skill_registry=self._skill_registry,
            runtime_tool_hub=RuntimeToolHub(self._skill_registry),
            min_confidence=router_min_confidence,
            refine_confidence=router_refine_confidence,
        )
        self._coverage_by_run: dict[str, CoverageDecision] = {}

    async def execute(self, run_id: str, request: PipelineRequest) -> None:
        await self._repo.update(run_id, status=PipelineRunStatus.RUNNING)
        try:
            if self._generation_mode == "agent" and self._agent_provider is not None:
                from app.application.agent.pipeline import AgentPipeline

                agent_pipeline = AgentPipeline(
                    route_request=self._route_request,
                    prepare_route_context=self._prepare_route_context,
                    can_execute_skill=lambda ctx: (
                        isinstance(ctx, RouteContext)
                        and ctx.coverage_decision.mode == "specialized"
                    ),
                    try_execute_skill=lambda rid, req, match, ctx, plan: self._try_execute_skill(
                        rid,
                        req,
                        match,
                        route_context=ctx,  # type: ignore[arg-type]
                        lesson_plan=plan,
                    ),
                    fail_skill_consistency=lambda rid, match, ctx, message: (
                        self._fail_skill_consistency(
                            rid,
                            match,
                            route_context=ctx,  # type: ignore[arg-type]
                            message=message,
                        )
                    ),
                    prepare_lesson_plan=lambda rid, req, ctx: self._prepare_lesson_plan(
                        rid,
                        req,
                        route_context=ctx,  # type: ignore[arg-type]
                    ),
                    execute_agent=lambda rid, req, ctx, plan: self._execute_agent(
                        rid,
                        req,
                        route_context=ctx,  # type: ignore[arg-type]
                        lesson_plan=plan,
                    ),
                )
                await self._run_with_total_timeout(
                    agent_pipeline.execute(run_id, request),
                    run_id=run_id,
                )
                return

            await self._run_with_total_timeout(
                self._execute_routed_single_pipeline(run_id, request),
                run_id=run_id,
            )
        except TimeoutError:
            timeout = self._pipeline_timeout_s
            logger.exception("Pipeline run %s timed out after %.1fs", run_id, timeout)
            quality_report = _terminal_quality_report(
                generator_path=("agent" if self._generation_mode == "agent" else "generic_cir"),
                coverage_mode=self._coverage_mode_for_run(run_id),
                code="pipeline.timeout",
                path="pipeline",
                message=f"Pipeline timed out after {timeout:.1f}s",
                suggestion="Retry the run or reduce generation complexity.",
            )
            await self._persist_quality_report(run_id, quality_report)
            await self._repo.update(
                run_id,
                status=PipelineRunStatus.FAILED,
                error=f"Pipeline timed out after {timeout:.1f}s",
            )
        except Exception as exc:  # noqa: BLE001 - terminal state must always be persisted.
            logger.exception("Pipeline run %s failed before candidate finalization", run_id)
            quality_report = _terminal_quality_report(
                generator_path=("agent" if self._generation_mode == "agent" else "generic_cir"),
                coverage_mode=self._coverage_mode_for_run(run_id),
                code="quality.generation_failed",
                path="pipeline",
                message=f"Pipeline failed before producing a valid candidate: {exc}",
                suggestion="Inspect the provider or SkillPack failure and retry.",
            )
            await self._persist_quality_report(run_id, quality_report)
            await self._repo.update(
                run_id,
                status=PipelineRunStatus.FAILED,
                error=str(exc),
            )
        finally:
            self._coverage_by_run.pop(run_id, None)

    async def _execute_routed_single_pipeline(
        self,
        run_id: str,
        request: PipelineRequest,
    ) -> None:
        route_match = await self._route_request(request)
        route_context = await self._prepare_route_context(run_id, request, route_match)
        if route_context is None:
            return
        lesson_plan = await self._prepare_lesson_plan(
            run_id,
            request,
            route_context=route_context,
        )
        if route_match is not None and route_context.coverage_decision.mode == "specialized":
            try:
                handled = await self._try_execute_skill(
                    run_id,
                    request,
                    route_match,
                    route_context=route_context,
                    lesson_plan=lesson_plan,
                )
            except AssertionError as exc:
                await self._fail_skill_consistency(
                    run_id,
                    route_match,
                    route_context=route_context,
                    message=str(exc),
                )
                return
            if handled:
                return
        await self._execute_single(
            run_id,
            request,
            route_context=route_context,
            lesson_plan=lesson_plan,
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

    async def _prepare_route_context(
        self,
        run_id: str,
        request: PipelineRequest,
        route_match: SkillRouteMatch | None,
    ) -> RouteContext | None:
        coverage_decision = self._coverage_resolver.resolve(
            prompt=request.prompt,
            source_code=request.source_code,
            language=request.language,
            explicit_domain=request.domain,
            skill_mode_override=request.skill_mode_override,
            route_match=route_match,
        )
        self._coverage_by_run[run_id] = coverage_decision
        update_coverage_decision = getattr(self._repo, "update_coverage_decision", None)
        if callable(update_coverage_decision):
            await update_coverage_decision(
                run_id,
                coverage_decision.model_dump_json(),
            )

        route_context = self._generic_route_context(
            request,
            route_match=route_match,
            coverage_decision=coverage_decision,
        )
        if coverage_decision.mode in {"specialized", "composable"}:
            return route_context

        actions = _coverage_review_actions(coverage_decision)
        if coverage_decision.mode == "unsupported":
            issue_code = "capability.unsupported"
            suggestion = (
                "Use a supported deterministic SkillPack or narrow the request to "
                "a capability that MetaView can validate reliably."
            )
        elif coverage_decision.fallback_policy == "text_only":
            issue_code = "capability.text_only_required"
            suggestion = (
                "Use a supported visual capability. MetaView does not yet expose a "
                "separate text-only result surface, so this request cannot enter the "
                "video pipeline safely."
            )
        else:
            issue_code = "capability.limited_visual_unavailable"
            suggestion = (
                "Restore the missing visual validators or use a fully controlled "
                "composition profile before generating a video."
            )
        report = _terminal_quality_report(
            generator_path="capability_resolution",
            coverage_mode=coverage_decision.mode,
            code=issue_code,
            path="coverage_decision",
            message=coverage_decision.reason,
            suggestion=suggestion,
            actions=actions,
        )
        await self._persist_quality_report(run_id, report)
        await self._repo.update(
            run_id,
            status=PipelineRunStatus.FAILED,
            error=coverage_decision.reason,
            review_json=PlaybookReviewVerdict(
                status=PlaybookReviewStatus.BLOCKED,
                summary=coverage_decision.reason,
                issues=list(report.issues),
                actions=actions,
            ).model_dump_json(),
        )
        return None

    def _generic_route_context(
        self,
        request: PipelineRequest,
        *,
        route_match: SkillRouteMatch | None,
        coverage_decision: CoverageDecision,
    ) -> RouteContext:
        topic_route = _resolve_route(request)
        if route_match is not None:
            route_domain = coverage_decision.domain or (
                topic_route.domain.value if topic_route.domain else None
            )
            route = RouteDecision(
                destination=(
                    "deterministic_skill"
                    if coverage_decision.mode == "specialized"
                    else "generic_cir"
                ),
                domain=route_domain,
                skill_id=route_match.skill_id,
                confidence=route_match.confidence,
                reason=coverage_decision.reason,
                matched_capability=route_match.capability_id,
                problem_spec=route_match.problem_spec,
                needs_refinement=route_match.needs_refinement,
            )
            return RouteContext(
                route,
                coverage_decision,
                fallback=(
                    "none"
                    if coverage_decision.mode == "specialized"
                    else f"coverage:{coverage_decision.fallback_policy}"
                ),
                router_model=getattr(self._router_provider, "model_name", None),
            )

        route = RouteDecision(
            destination="generic_cir",
            domain=coverage_decision.domain,
            confidence=coverage_decision.confidence,
            reason=coverage_decision.reason,
            matched_capability=",".join(topic_route.matched_keywords) or None,
        )
        fallback = "router_disabled" if self._router_mode == "off" else "none"
        return RouteContext(
            route,
            coverage_decision,
            fallback=(
                fallback
                if fallback != "none"
                else f"coverage:{coverage_decision.fallback_policy}"
            ),
            router_model=getattr(self._router_provider, "model_name", None),
        )

    async def _prepare_lesson_plan(
        self,
        run_id: str,
        request: PipelineRequest,
        *,
        route_context: RouteContext,
    ) -> LessonPlan:
        lesson_plan = await self._lesson_planner.plan(
            prompt=request.prompt,
            domain=(
                route_context.coverage_decision.domain
                or route_context.decision.domain
                or request.domain
            ),
            route_decision=route_context.decision,
            source_code=request.source_code,
            language=request.language,
        )
        update_lesson_plan = getattr(self._repo, "update_lesson_plan", None)
        if callable(update_lesson_plan):
            await update_lesson_plan(run_id, lesson_plan.model_dump_json())
        return lesson_plan

    async def _try_execute_skill(
        self,
        run_id: str,
        request: PipelineRequest,
        route_match: SkillRouteMatch,
        *,
        route_context: RouteContext,
        lesson_plan: LessonPlan,
    ) -> bool:
        if route_context.coverage_decision.mode != "specialized":
            return False
        skill = self._skill_registry.get(route_match.skill_id)
        if skill is None:
            return False

        heuristic_match = skill.heuristic_match(
            SkillRouteInput(
                prompt=request.prompt,
                source_code=request.source_code,
                language=request.language,
            )
        )
        if (
            heuristic_match is None
            or heuristic_match.skill_id != route_match.skill_id
            or heuristic_match.capability_id != route_match.capability_id
            or heuristic_match.problem_spec is None
        ):
            raise AssertionError(
                "Specialized coverage lost its independently verified SkillPack "
                "capability or ProblemSpec before execution."
            )
        problem_spec = skill.validate_problem_spec(heuristic_match.problem_spec)
        if problem_spec is None:
            raise AssertionError(
                "Specialized coverage produced an invalid independently verified "
                "ProblemSpec before execution."
            )
        spec_source = "heuristic_verified"
        verified_route_match = route_match.model_copy(
            update={"problem_spec": heuristic_match.problem_spec}
        )

        result = await skill.execute(
            SkillExecutionContext(
                run_id=run_id,
                prompt=request.prompt,
                route_match=verified_route_match,
                lesson_plan=lesson_plan,
            ),
            problem_spec,
        )
        if not result.handled or result.playbook_json is None:
            fallback_reason = result.fallback_reason or "skill_returned_no_playbook"
            actions = [
                "router:skill_pack",
                f"router:skill_id:{route_match.skill_id}",
                f"skill:execution_unhandled:{fallback_reason}",
                *_coverage_review_actions(route_context.coverage_decision),
            ]
            report = _terminal_quality_report(
                generator_path="skill_pack",
                coverage_mode=route_context.coverage_decision.mode,
                code="skill.execution_unhandled",
                path="skill_pack",
                message=(
                    f"SkillPack {route_match.skill_id!r} declined or failed to produce "
                    f"a PlaybookScript candidate: {fallback_reason}."
                ),
                suggestion=(
                    "Fix the deterministic SkillPack or resolve the capability gap before "
                    "retrying; do not continue through an unverified generic path."
                ),
                actions=actions,
            )
            await self._persist_quality_report(run_id, report)
            await self._repo.update(
                run_id,
                status=PipelineRunStatus.FAILED,
                error=report.summary,
                review_json=PlaybookReviewVerdict(
                    status=PlaybookReviewStatus.BLOCKED,
                    summary=report.summary,
                    issues=list(report.issues),
                    actions=actions,
                ).model_dump_json(),
            )
            return True
        if result.lesson_plan is not None:
            if result.lesson_plan.domain != lesson_plan.domain:
                raise AssertionError(
                    "SkillPack LessonPlan domain does not match the routed LessonPlan domain."
                )
            lesson_plan = result.lesson_plan
            update_lesson_plan = getattr(self._repo, "update_lesson_plan", None)
            if callable(update_lesson_plan):
                await update_lesson_plan(run_id, lesson_plan.model_dump_json())

        try:
            playbook = PlaybookScript.model_validate_json(result.playbook_json)
        except ValidationError as exc:
            verdict = _playbook_schema_error_verdict(
                exc,
                actions=[
                    "router:skill_pack",
                    f"router:skill_id:{route_match.skill_id}",
                    "skill:schema_validation:blocked",
                ],
            )
            failure_quality = QualityReport.from_review_verdict(
                verdict,
                generator_path="skill_pack",
                coverage_mode=route_context.coverage_decision.mode,
            )
            if failure_quality.status == "repairable":
                failure_quality = _mark_quality_repair_unavailable(
                    failure_quality,
                    message="SkillPack output did not match the PlaybookScript schema.",
                )
            await self._persist_quality_report(run_id, failure_quality)
            await self._repo.update(
                run_id,
                status=PipelineRunStatus.FAILED,
                error=humanize_issues(verdict),
                review_json=verdict.model_dump_json(),
            )
            return True
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
        quality_report = quality_gate_playbook(
            playbook,
            request.prompt,
            generator_path="skill_pack",
            coverage_mode=route_context.coverage_decision.mode,
            coverage_decision=route_context.coverage_decision,
            lesson_plan=lesson_plan,
        )
        quality_report.actions = list(review_report.actions)
        if quality_report.status == "repairable":
            quality_report = quality_report.with_issue(
                PlaybookReviewIssue(
                    code="quality.repair_unavailable",
                    severity=PlaybookIssueSeverity.ERROR,
                    path="playbook",
                    message=(
                        "Deterministic SkillPack output failed the canonical gate and "
                        "has no runtime repair path."
                    ),
                    suggestion="Fix the SkillPack compiler and rerun the deterministic skill.",
                    requires_repair=False,
                ),
                action="quality:repair_unavailable:skill_pack",
            )
        await self._finalize_candidate(
            run_id,
            playbook,
            quality_report,
            review_json=review_report.model_dump_json(),
        )
        return True

    async def _fail_skill_consistency(
        self,
        run_id: str,
        route_match: SkillRouteMatch,
        *,
        route_context: RouteContext,
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
        await self._persist_quality_report(
            run_id,
            _terminal_quality_report(
                generator_path="skill_pack",
                coverage_mode=route_context.coverage_decision.mode,
                code="skill.consistency_failed",
                path="playbook",
                message=(
                    message or "Deterministic skill output failed consistency validation."
                ),
                suggestion="Fix the deterministic SkillPack output before retrying.",
                actions=list(review_report.actions),
            ),
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
        lesson_plan: LessonPlan,
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
        review_report = PlaybookReviewVerdict(
            status=PlaybookReviewStatus.CLEAN,
            summary="Agent Playbook review pending.",
            actions=_route_review_actions(route_context, generator="agent"),
        )
        try:
            playbook, review_report = await self._generate_agent_playbook_with_self_check(
                run_id,
                request,
                request.prompt,
                provider_config=provider_config,
                route_context=route_context,
                review_report=review_report,
                lesson_plan=lesson_plan,
            )
            playbook, review_report = await self._review_agent_playbook(
                run_id,
                request,
                playbook,
                provider_config=provider_config,
                route_context=route_context,
                review_report=review_report,
                lesson_plan=lesson_plan,
            )
            quality_report = _quality_report_with_review(
                playbook,
                request.prompt,
                review_report,
                generator_path="agent",
                coverage_decision=route_context.coverage_decision,
                lesson_plan=lesson_plan,
            )
            if quality_report.status == "repairable":
                review_report = _with_playbook_review_actions(
                    review_report,
                    [*review_report.actions, "quality:repair_attempt:1"],
                )
                await self._persist_quality_report(run_id, quality_report)
                await self._repo.update(
                    run_id,
                    status=PipelineRunStatus.REVIEWING,
                    review_json=review_report.model_dump_json(),
                )
                playbook, review_report = await self._repair_agent_playbook_from_reviewer(
                    run_id,
                    request,
                    playbook,
                    [
                        issue
                        for issue in quality_report.issues
                        if issue.severity == PlaybookIssueSeverity.ERROR
                    ],
                    provider_config=provider_config,
                    route_context=route_context,
                    review_report=review_report,
                    lesson_plan=lesson_plan,
                )
                playbook, review_report = await self._review_agent_playbook(
                    run_id,
                    request,
                    playbook,
                    provider_config=provider_config,
                    route_context=route_context,
                    review_report=review_report,
                    lesson_plan=lesson_plan,
                )
                quality_report = _quality_report_with_review(
                    playbook,
                    request.prompt,
                    review_report,
                    generator_path="agent",
                    coverage_decision=route_context.coverage_decision,
                    lesson_plan=lesson_plan,
                )
            if quality_report.status == "repairable":
                quality_report = _mark_quality_repair_exhausted(quality_report)
            await self._finalize_candidate(
                run_id,
                playbook,
                quality_report,
                review_json=review_report.model_dump_json(),
            )
        except PipelineValidationError as exc:
            logger.exception("Pipeline run %s (agent mode) failed review", run_id)
            failure_quality = QualityReport.from_review_verdict(
                exc.report,
                generator_path="agent",
                coverage_mode=route_context.coverage_decision.mode,
                attempts=_playbook_repair_attempts(exc.report.actions),
            )
            if failure_quality.status == "repairable":
                failure_quality = _mark_quality_repair_exhausted(failure_quality)
            await self._persist_quality_report(
                run_id,
                failure_quality,
            )
            await self._repo.update(
                run_id,
                status=PipelineRunStatus.FAILED,
                error=humanize_issues(exc.report),
                review_json=exc.report.model_dump_json(),
            )
        except AgentProviderError as exc:
            logger.exception("Pipeline run %s (agent mode) failed in provider", run_id)
            failure_review = _agent_provider_error_verdict(
                exc,
                actions=review_report.actions,
            )
            failure_quality = QualityReport.from_review_verdict(
                failure_review,
                generator_path="agent",
                coverage_mode=route_context.coverage_decision.mode,
            )
            if failure_quality.status == "repairable":
                failure_quality = _mark_quality_repair_unavailable(
                    failure_quality,
                    message="Agent provider failed before a candidate could be repaired.",
                )
            await self._persist_quality_report(run_id, failure_quality)
            await self._repo.update(
                run_id,
                status=PipelineRunStatus.FAILED,
                error=humanize_issues(failure_review),
                review_json=failure_review.model_dump_json(),
            )
        except Exception as exc:
            logger.exception("Pipeline run %s (agent mode) failed", run_id)
            failure_review = _playbook_schema_error_verdict(
                exc,
                actions=[*review_report.actions, "agent:schema_validation:blocked"],
            )
            failure_quality = QualityReport.from_review_verdict(
                failure_review,
                generator_path="agent",
                coverage_mode=route_context.coverage_decision.mode,
            )
            if failure_quality.status == "repairable":
                failure_quality = _mark_quality_repair_unavailable(
                    failure_quality,
                    message="Unexpected agent failure prevented runtime repair.",
                )
            await self._persist_quality_report(run_id, failure_quality)
            await self._repo.update(
                run_id,
                status=PipelineRunStatus.FAILED,
                error=str(exc),
                review_json=failure_review.model_dump_json(),
            )

    async def _generate_agent_playbook_with_self_check(
        self,
        run_id: str,
        request: PipelineRequest,
        prompt: str,
        *,
        provider_config: dict[str, Any] | None,
        route_context: RouteContext,
        review_report: PlaybookReviewVerdict,
        lesson_plan: LessonPlan,
    ) -> tuple[PlaybookScript, PlaybookReviewVerdict]:
        assert self._agent_provider is not None
        generation_prompt = prompt
        last_payload: dict[str, Any] | None = None
        for attempt in range(AGENT_SELF_REPAIR_ATTEMPTS + 1):
            playbook_dict = await self._run_agent_provider(
                run_id,
                generation_prompt,
                request=request,
                provider_config=provider_config,
                route_context=route_context,
                lesson_plan=lesson_plan,
            )
            last_payload = playbook_dict
            # Validate the sidecar payload against the canonical PlaybookScript
            # schema so any malformed output is caught here, before persistence
            # or third-party review.
            try:
                playbook = PlaybookScript.model_validate(playbook_dict)
            except ValidationError as exc:
                check = _playbook_schema_error_verdict(
                    exc,
                    actions=[*review_report.actions, "agent:schema_validation:blocked"],
                )
                if attempt >= AGENT_SELF_REPAIR_ATTEMPTS:
                    raise PipelineValidationError(check) from exc
                review_report = _with_playbook_review_actions(
                    check,
                    [*check.actions, f"agent:self_repair_attempt:{attempt + 1}"],
                )
                await self._repo.update(
                    run_id,
                    status=PipelineRunStatus.REVIEWING,
                    review_json=review_report.model_dump_json(),
                )
                generation_prompt = _build_agent_self_repair_prompt(
                    prompt,
                    last_payload,
                    check.issues,
                )
                continue

            check = self_check_playbook(playbook, prompt, lesson_plan=lesson_plan)
            check = _with_playbook_review_actions(
                check,
                [*review_report.actions, *check.actions, f"agent:self_check:{check.status.value}"],
            )

            if check.status != PlaybookReviewStatus.BLOCKED:
                return playbook, check

            if attempt >= AGENT_SELF_REPAIR_ATTEMPTS:
                raise PipelineValidationError(check)

            review_report = _with_playbook_review_actions(
                check,
                [*check.actions, f"agent:self_repair_attempt:{attempt + 1}"],
            )
            await self._repo.update(
                run_id,
                status=PipelineRunStatus.REVIEWING,
                review_json=review_report.model_dump_json(),
            )
            generation_prompt = _build_agent_self_repair_prompt(
                prompt,
                last_payload,
                check.issues,
            )

        raise PipelineValidationError(review_report)

    async def _review_agent_playbook(
        self,
        run_id: str,
        request: PipelineRequest,
        playbook: PlaybookScript,
        *,
        provider_config: dict[str, Any] | None,
        route_context: RouteContext,
        review_report: PlaybookReviewVerdict,
        lesson_plan: LessonPlan,
    ) -> tuple[PlaybookScript, PlaybookReviewVerdict]:
        if self._reviewer_mode == "off":
            return playbook, _with_playbook_review_actions(
                review_report,
                [
                    *review_report.actions,
                    "reviewer:disabled",
                ],
            )

        if self._reviewer_llm is None:
            should_require_reviewer = self._reviewer_mode == "always" or (
                self._reviewer_mode == "math_always" and route_context.decision.domain == "math"
            )
            if (
                not should_require_reviewer
                and review_report.status
                in {PlaybookReviewStatus.CLEAN, PlaybookReviewStatus.WARNINGS}
            ):
                return playbook, _with_playbook_review_actions(
                    review_report,
                    [*review_report.actions, "reviewer:skipped_on_clean_self_check"],
                )
            raise PipelineValidationError(_missing_playbook_reviewer_verdict(review_report))

        review_report = _with_playbook_review_actions(
            review_report,
            [*review_report.actions, "reviewer:started"],
        )
        reviewer_model = getattr(self._reviewer_llm, "model_name", None)
        if reviewer_model:
            review_report = _with_playbook_review_actions(
                review_report,
                [*review_report.actions, f"reviewer:model:{reviewer_model}"],
            )

        attempts_allowed = AGENT_REVIEWER_REPAIR_ATTEMPTS
        for attempt in range(attempts_allowed + 1):
            result = await self._call_agent_reviewer(
                request.prompt,
                playbook,
                review_report,
            )
            result = _enforce_math_parameter_review_contract(result)
            result = _merge_playbook_reviews(review_report, result)
            result = _with_playbook_review_actions(
                result,
                [*result.actions, f"reviewer:status:{result.status.value}"],
            )
            blocking = _blocking_playbook_review_issues(result)

            if not blocking:
                return playbook, result

            if (
                attempt >= attempts_allowed
                or any(issue.code == "reviewer.invalid_output" for issue in blocking)
            ):
                raise PipelineValidationError(result)

            review_report = _with_playbook_review_actions(
                result,
                [*result.actions, f"reviewer:repair_attempt:{attempt + 1}"],
            )
            await self._repo.update(
                run_id,
                status=PipelineRunStatus.REVIEWING,
                review_json=review_report.model_dump_json(),
            )

            playbook, review_report = await self._repair_agent_playbook_from_reviewer(
                run_id,
                request,
                playbook,
                blocking,
                provider_config=provider_config,
                route_context=route_context,
                review_report=review_report,
                lesson_plan=lesson_plan,
            )

        raise PipelineValidationError(review_report)

    async def _call_agent_reviewer(
        self,
        prompt: str,
        playbook: PlaybookScript,
        self_check: PlaybookReviewVerdict,
    ) -> PlaybookReviewVerdict:
        assert self._reviewer_llm is not None
        system, user = build_playbook_reviewer_prompt(
            prompt,
            playbook,
            self_check,
        )
        raw = await self._reviewer_llm.complete(system, user)
        return parse_playbook_reviewer_output(raw)

    async def _repair_agent_playbook_from_reviewer(
        self,
        run_id: str,
        request: PipelineRequest,
        playbook: PlaybookScript,
        blocking: list[PlaybookReviewIssue],
        *,
        provider_config: dict[str, Any] | None,
        route_context: RouteContext,
        review_report: PlaybookReviewVerdict,
        lesson_plan: LessonPlan,
    ) -> tuple[PlaybookScript, PlaybookReviewVerdict]:
        assert self._agent_provider is not None
        repair_prompt = _build_agent_reviewer_repair_prompt(request.prompt, playbook, blocking)
        repaired_payload = await self._run_agent_provider(
            run_id,
            repair_prompt,
            request=request,
            provider_config=provider_config,
            route_context=route_context,
            lesson_plan=lesson_plan,
        )
        try:
            repaired = PlaybookScript.model_validate(repaired_payload)
        except ValidationError as exc:
            raise PipelineValidationError(
                _playbook_schema_error_verdict(
                    exc,
                    actions=[*review_report.actions, "agent:schema_validation:blocked"],
                )
            ) from exc
        check = self_check_playbook(
            repaired,
            request.prompt,
            lesson_plan=lesson_plan,
        )
        check = _with_playbook_review_actions(
            check,
            [*review_report.actions, *check.actions, f"agent:self_check:{check.status.value}"],
        )
        if check.status == PlaybookReviewStatus.BLOCKED:
            raise PipelineValidationError(check)
        return repaired, check

    async def _run_agent_provider(
        self,
        run_id: str,
        prompt: str,
        *,
        request: PipelineRequest,
        provider_config: dict[str, Any] | None,
        route_context: RouteContext,
        lesson_plan: LessonPlan,
    ) -> dict[str, Any]:
        assert self._agent_provider is not None
        route_decision = route_context.decision.model_dump(mode="json")
        available_tool_ids = frozenset(
            route_context.coverage_decision.available_tool_ids
        )
        available_tools = [
            tool
            for tool in RuntimeToolHub(self._skill_registry).list_tools(route_decision)
            if tool.name in available_tool_ids
        ]
        agent_request = AgentRequest(
            run_id=run_id,
            prompt=prompt,
            source_code=request.source_code,
            language=request.language,
            route_decision=route_decision,
            coverage_decision=route_context.coverage_decision,
            lesson_plan=lesson_plan,
            provider_config=provider_config,
            playbook_schema=PlaybookScript.model_json_schema(),
            constraints=AgentConstraints(
                max_self_repair_attempts=AGENT_SELF_REPAIR_ATTEMPTS,
                max_reviewer_repair_attempts=AGENT_REVIEWER_REPAIR_ATTEMPTS,
                legacy_single_enabled=True,
                executable_tools_available=True,
            ),
            available_tools=available_tools,
        )
        runner = getattr(self._agent_provider, "run", None)
        if callable(runner):
            result = await runner(agent_request)
            return result.playbook
        return await self._agent_provider.generate(
            _build_agent_generation_prompt(
                prompt,
                lesson_plan,
                route_context.coverage_decision,
            ),
            provider_config=provider_config,
            route_decision=route_decision,
        )

    async def _execute_single(
        self,
        run_id: str,
        request: PipelineRequest,
        *,
        route_context: RouteContext,
        lesson_plan: LessonPlan,
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
                coverage_decision=route_context.coverage_decision,
                lesson_plan=lesson_plan,
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
            quality_report = _quality_report_for_single(
                playbook,
                request.prompt,
                review_report,
                coverage_decision=route_context.coverage_decision,
                lesson_plan=lesson_plan,
            )

            quality_attempts_allowed = CANONICAL_QUALITY_REPAIR_ATTEMPTS
            for attempt in range(quality_attempts_allowed):
                if quality_report.status != "repairable":
                    break
                review_report.attempts += 1
                review_report.actions.append(f"quality:repair_attempt:{attempt + 1}")
                quality_report.attempts = review_report.attempts
                quality_report.actions = list(review_report.actions)
                await self._persist_quality_report(run_id, quality_report)
                await self._repo.update(
                    run_id,
                    status=PipelineRunStatus.REVIEWING,
                    review_json=review_report.model_dump_json(),
                )
                raw = await self._regenerate(
                    system,
                    user,
                    raw,
                    _quality_issues_as_cir(quality_report.issues),
                    "Repair the canonical Playbook quality issues before rebuilding the scene.",
                )
                previous_attempts = review_report.attempts
                parsed, review_report = await self._review_output(
                    run_id=run_id,
                    request=request,
                    system=system,
                    user=user,
                    raw=raw,
                    initial_actions=list(review_report.actions),
                )
                review_report.attempts += previous_attempts
                if parsed.cir is None:
                    review_report.status = "failed"
                    raise PipelineValidationError(review_report)
                playbook = build_playbook(
                    parsed.cir,
                    execution_map=parsed.execution_map,
                    source_code=request.source_code,
                    source_language=request.language,
                )
                quality_report = _quality_report_for_single(
                    playbook,
                    request.prompt,
                    review_report,
                    coverage_decision=route_context.coverage_decision,
                    lesson_plan=lesson_plan,
                )

            if quality_report.status == "repairable":
                quality_report = _mark_quality_repair_exhausted(quality_report)

            await self._finalize_candidate(
                run_id,
                playbook,
                quality_report,
                review_json=review_report.model_dump_json(),
            )
        except PipelineValidationError as exc:
            logger.exception("Pipeline run %s failed review", run_id)
            await self._persist_quality_report(
                run_id,
                _quality_report_from_cir_failure(
                    exc.report,
                    generator_path="generic_cir",
                    coverage_mode=route_context.coverage_decision.mode,
                ),
            )
            await self._repo.update(
                run_id,
                status=PipelineRunStatus.FAILED,
                error=humanize_issues(exc.report),
                review_json=exc.report.model_dump_json(),
            )
        except Exception as exc:
            logger.exception("Pipeline run %s failed", run_id)
            await self._persist_quality_report(
                run_id,
                _terminal_quality_report(
                    generator_path="generic_cir",
                    coverage_mode=route_context.coverage_decision.mode,
                    code="quality.generation_failed",
                    path="pipeline",
                    message=f"Generic CIR generation failed: {exc}",
                    suggestion="Inspect the CIR generator output and retry.",
                    actions=list(review_report.actions),
                ),
            )
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
    ) -> PlaybookReviewIssue | None:
        if self._director_repo is None:
            return None
        director = build_default_director(playbook, run_id)
        try:
            await self._director_repo.upsert(
                director,
                datetime.now(timezone.utc).isoformat(),
            )
        except Exception as exc:  # noqa: BLE001 - surfaced through the quality report.
            logger.warning("Failed to persist default director for run %s", run_id, exc_info=True)
            return PlaybookReviewIssue(
                code="director.persistence_failed",
                severity=PlaybookIssueSeverity.ERROR,
                path="director",
                message=f"Default DirectorScript could not be persisted: {exc}",
                suggestion="Retry Director persistence before declaring the run complete.",
                requires_repair=False,
            )
        return None

    async def _persist_quality_report(self, run_id: str, report: QualityReport) -> None:
        update_quality_report = getattr(self._repo, "update_quality_report", None)
        if callable(update_quality_report):
            await update_quality_report(run_id, report.model_dump_json())

    def _coverage_mode_for_run(self, run_id: str) -> CoverageMode:
        decision = self._coverage_by_run.get(run_id)
        return decision.mode if decision is not None else "experimental"

    async def _finalize_candidate(
        self,
        run_id: str,
        playbook: PlaybookScript,
        quality_report: QualityReport,
        *,
        review_json: str,
    ) -> bool:
        if quality_report.status in {"repairable", "blocked"}:
            await self._persist_quality_report(run_id, quality_report)
            await self._repo.update(
                run_id,
                status=PipelineRunStatus.FAILED,
                error=_humanize_quality_report(quality_report),
                review_json=review_json,
            )
            return False

        director_issue = await self._upsert_default_director(run_id, playbook)
        if director_issue is not None:
            quality_report = quality_report.with_issue(
                director_issue,
                action="director:persistence_failed",
            )
            await self._persist_quality_report(run_id, quality_report)
            await self._repo.update(
                run_id,
                status=PipelineRunStatus.FAILED,
                error=director_issue.message,
                review_json=review_json,
            )
            return False

        await self._persist_quality_report(run_id, quality_report)
        await self._repo.update(
            run_id,
            status=PipelineRunStatus.SUCCEEDED,
            playbook_json=playbook.model_dump_json(),
            review_json=review_json,
        )
        return True

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


def _with_playbook_review_actions(
    verdict: PlaybookReviewVerdict,
    actions: list[str],
) -> PlaybookReviewVerdict:
    seen: set[str] = set()
    unique_actions: list[str] = []
    for action in actions:
        if action not in seen:
            unique_actions.append(action)
            seen.add(action)
    return verdict.model_copy(update={"actions": unique_actions})


def _merge_playbook_reviews(
    self_check: PlaybookReviewVerdict,
    reviewer: PlaybookReviewVerdict,
) -> PlaybookReviewVerdict:
    return playbook_review_verdict_from_issues(
        [*self_check.issues, *reviewer.issues],
        clean_summary=reviewer.summary,
        warning_summary=reviewer.summary,
        blocked_summary=reviewer.summary,
        actions=[*self_check.actions, *reviewer.actions],
    )


_MATH_PARAMETER_CONTRACT_CODES = {
    "math.parameter_hardcoded",
    "math.parameter_control_missing",
    "math.parameter_control_unused",
    "math.parameter_control_invalid",
}


def _enforce_math_parameter_review_contract(
    verdict: PlaybookReviewVerdict,
) -> PlaybookReviewVerdict:
    """Parameter-contract findings are blocking even if a reviewer underspecifies them."""
    normalized_issues = [
        issue.model_copy(
            update={
                "severity": PlaybookIssueSeverity.ERROR,
                "requires_repair": True,
            }
        )
        if issue.code in _MATH_PARAMETER_CONTRACT_CODES
        else issue
        for issue in verdict.issues
    ]
    if normalized_issues == verdict.issues:
        return verdict
    return verdict.model_copy(
        update={
            "status": PlaybookReviewStatus.BLOCKED,
            "issues": normalized_issues,
        }
    )


def _playbook_schema_error_verdict(
    exc: Exception,
    *,
    actions: list[str],
) -> PlaybookReviewVerdict:
    if isinstance(exc, ValidationError):
        issues = [
            PlaybookReviewIssue(
                code="schema.invalid",
                severity=PlaybookIssueSeverity.ERROR,
                path=_format_error_path(("playbook", *error.get("loc", ()))),
                message=str(error.get("msg", "PlaybookScript schema validation failed")),
                suggestion="Return a JSON object that matches the PlaybookScript schema.",
                requires_repair=True,
            )
            for error in exc.errors()
        ]
    else:
        issues = [
            PlaybookReviewIssue(
                code="schema.invalid",
                severity=PlaybookIssueSeverity.ERROR,
                path="playbook",
                message=f"Agent did not produce a valid PlaybookScript: {exc}",
                suggestion="Return a complete PlaybookScript JSON object.",
                requires_repair=True,
            )
        ]
    return PlaybookReviewVerdict(
        status=PlaybookReviewStatus.BLOCKED,
        summary="PlaybookScript schema validation failed.",
        issues=issues,
        actions=actions,
    )


def _missing_playbook_reviewer_verdict(
    review_report: PlaybookReviewVerdict,
) -> PlaybookReviewVerdict:
    return PlaybookReviewVerdict(
        status=PlaybookReviewStatus.BLOCKED,
        summary="Agent mode requires a configured reviewer unless reviewer_mode=off.",
        issues=[
            PlaybookReviewIssue(
                code="reviewer.unconfigured",
                severity=PlaybookIssueSeverity.ERROR,
                path="reviewer",
                message=(
                    "Agent generation cannot complete because reviewer_mode is enabled "
                    "but no reviewer LLM is configured."
                ),
                suggestion=(
                    "Configure METAVIEW_OPENAI_CRITIC_MODEL with a reviewer provider, "
                    "or explicitly set METAVIEW_REVIEWER_MODE=off for local/dev use."
                ),
                requires_repair=True,
            )
        ],
        actions=[
            *review_report.actions,
            "reviewer:unconfigured",
            "reviewer:status:blocked",
        ],
    )


def _agent_provider_error_verdict(
    exc: AgentProviderError,
    *,
    actions: list[str],
) -> PlaybookReviewVerdict:
    structured = exc.structured_failure
    if isinstance(structured, dict):
        try:
            status = PlaybookReviewStatus(structured.get("status"))
            issues = [
                _playbook_issue_from_structured_failure(issue)
                for issue in structured.get("issues", [])
                if isinstance(issue, dict)
            ]
            verdict = PlaybookReviewVerdict(
                status=status,
                summary="Agent provider self-check failed.",
                issues=issues,
                actions=[
                    *actions,
                    f"agent:self_check:{status.value}",
                ],
            )
            return _with_playbook_review_actions(verdict, verdict.actions)
        except (TypeError, ValueError, ValidationError):
            logger.warning("Invalid structured agent failure: %r", structured)

    return _playbook_schema_error_verdict(
        exc,
        actions=[*actions, "agent:provider_error"],
    )


def _playbook_issue_from_structured_failure(
    issue: dict[str, Any],
) -> PlaybookReviewIssue:
    severity = PlaybookIssueSeverity(issue.get("severity"))
    return PlaybookReviewIssue(
        code=str(issue.get("code", "schema.invalid")),
        severity=severity,
        path=str(issue.get("path", "playbook")),
        message=str(issue.get("message", "Agent provider self-check failed.")),
        suggestion=(
            str(issue["suggestion"])
            if issue.get("suggestion") is not None
            else "Repair the PlaybookScript and retry generation."
        ),
        requires_repair=severity == PlaybookIssueSeverity.ERROR,
    )


def _blocking_playbook_review_issues(
    result: PlaybookReviewVerdict,
) -> list[PlaybookReviewIssue]:
    return [issue for issue in result.issues if issue.severity == PlaybookIssueSeverity.ERROR]


def _build_agent_generation_prompt(
    prompt: str,
    lesson_plan: LessonPlan,
    coverage_decision: CoverageDecision,
) -> str:
    return (
        "[MetaView coverage decision]\n"
        "BINDING read-only capability boundary. Respect mode, fallback_policy, "
        "and missing_capabilities; do not invent unexecuted tool results.\n"
        f"{coverage_decision.model_dump_json(indent=2)}\n\n"
        "[MetaView LessonPlan]\n"
        f"{lesson_plan.model_dump_json(indent=2)}\n\n"
        "[user prompt]\n"
        f"{prompt}"
    )


def _build_agent_self_repair_prompt(
    original_prompt: str,
    previous_payload: dict[str, Any] | None,
    issues: list[PlaybookReviewIssue],
) -> str:
    return _build_agent_repair_prompt(
        reason="agent self-check blocked the candidate PlaybookScript",
        original_prompt=original_prompt,
        previous_payload=previous_payload,
        issues=issues,
    )


def _build_agent_reviewer_repair_prompt(
    original_prompt: str,
    playbook: PlaybookScript,
    issues: list[PlaybookReviewIssue],
) -> str:
    return _build_agent_repair_prompt(
        reason="third-party reviewer blocked the candidate PlaybookScript",
        original_prompt=original_prompt,
        previous_payload=playbook.model_dump(mode="json"),
        issues=issues,
    )


def _build_agent_repair_prompt(
    *,
    reason: str,
    original_prompt: str,
    previous_payload: dict[str, Any] | None,
    issues: list[PlaybookReviewIssue],
) -> str:
    repair_payload = {
        "reason": reason,
        "original_prompt": original_prompt,
        "previous_playbook": previous_payload,
        "blocking_issues": [issue.model_dump(mode="json") for issue in issues],
        "instructions": [
            "Repair by returning a complete PlaybookScript JSON object.",
            "Keep PlaybookScript as the only rendering exit.",
            "Do not introduce raw HTML, iframe, Manim, or server video rendering.",
            "Use only renderer-supported snapshot kinds.",
        ],
    }
    return (
        "Your previous MetaView agent output failed review. "
        "Repair it using this structured feedback and return a complete "
        "PlaybookScript through the normal agent generation path:\n"
        f"{json.dumps(repair_payload, ensure_ascii=False, indent=2)}"
    )


def _quality_report_with_review(
    playbook: PlaybookScript,
    prompt: str,
    review: PlaybookReviewVerdict,
    *,
    generator_path: str,
    coverage_decision: CoverageDecision,
    lesson_plan: LessonPlan,
) -> QualityReport:
    canonical = quality_gate_playbook(
        playbook,
        prompt,
        generator_path=generator_path,
        coverage_mode=coverage_decision.mode,
        coverage_decision=coverage_decision,
        lesson_plan=lesson_plan,
    )
    unique: dict[tuple[str, str, str], PlaybookReviewIssue] = {}
    for issue in [*canonical.issues, *review.issues]:
        unique[(issue.code, issue.path, issue.message)] = issue
    merged = playbook_review_verdict_from_issues(
        list(unique.values()),
        clean_summary="Playbook passed the canonical backend quality gate.",
        warning_summary="Playbook passed the canonical backend quality gate with warnings.",
        blocked_summary="Playbook failed the canonical backend quality gate.",
        actions=list(review.actions),
    )
    return QualityReport.from_review_verdict(
        merged,
        generator_path=generator_path,
        coverage_mode=coverage_decision.mode,
        attempts=_playbook_repair_attempts(review.actions),
    )


def _quality_report_for_single(
    playbook: PlaybookScript,
    prompt: str,
    review: CirReviewReport,
    *,
    coverage_decision: CoverageDecision,
    lesson_plan: LessonPlan,
) -> QualityReport:
    report = quality_gate_playbook(
        playbook,
        prompt,
        generator_path="generic_cir",
        coverage_mode=coverage_decision.mode,
        coverage_decision=coverage_decision,
        lesson_plan=lesson_plan,
    )
    report.actions = list(review.actions)
    report.attempts = review.attempts
    return report


def _playbook_repair_attempts(actions: list[str]) -> int:
    return sum(
        1
        for action in actions
        if action.startswith(
            (
                "agent:self_repair_attempt:",
                "reviewer:repair_attempt:",
                "quality:repair_attempt:",
            )
        )
    )


def _quality_issues_as_cir(
    issues: list[PlaybookReviewIssue],
) -> list[CirReviewIssue]:
    return [
        CirReviewIssue(
            code=issue.code,
            severity=(
                ReviewSeverity.ERROR
                if issue.severity == PlaybookIssueSeverity.ERROR
                else ReviewSeverity.WARNING
            ),
            path=issue.path,
            message=issue.message,
            suggestion=issue.suggestion,
        )
        for issue in issues
        if issue.severity == PlaybookIssueSeverity.ERROR
    ]


def _humanize_quality_report(report: QualityReport) -> str:
    if not report.issues:
        return "Pipeline output failed the canonical quality gate."
    shown = report.issues[:5]
    details = "; ".join(
        f"{issue.code} at {issue.path}: {issue.message}" for issue in shown
    )
    suffix = "" if len(report.issues) <= 5 else f" (+{len(report.issues) - 5} more)"
    return f"Canonical quality gate {report.status}: {details}{suffix}"


def _mark_quality_repair_exhausted(report: QualityReport) -> QualityReport:
    return report.with_issue(
        PlaybookReviewIssue(
            code="quality.repair_exhausted",
            severity=PlaybookIssueSeverity.ERROR,
            path="playbook",
            message="Canonical quality repair attempts were exhausted.",
            suggestion="Regenerate from a corrected prompt or fix the generator/compiler.",
            requires_repair=False,
        ),
        action="quality:repair_exhausted",
    )


def _mark_quality_repair_unavailable(
    report: QualityReport,
    *,
    message: str,
) -> QualityReport:
    return report.with_issue(
        PlaybookReviewIssue(
            code="quality.repair_unavailable",
            severity=PlaybookIssueSeverity.ERROR,
            path="playbook",
            message=message,
            suggestion="Fix the provider or generator failure before retrying.",
            requires_repair=False,
        ),
        action="quality:repair_unavailable",
    )


def _terminal_quality_report(
    *,
    generator_path: str,
    coverage_mode: CoverageMode,
    code: str,
    path: str,
    message: str,
    suggestion: str,
    actions: list[str] | None = None,
) -> QualityReport:
    verdict = PlaybookReviewVerdict(
        status=PlaybookReviewStatus.BLOCKED,
        summary=message,
        issues=[
            PlaybookReviewIssue(
                code=code,
                severity=PlaybookIssueSeverity.ERROR,
                path=path,
                message=message,
                suggestion=suggestion,
                requires_repair=False,
            )
        ],
        actions=list(actions or []),
    )
    return QualityReport.from_review_verdict(
        verdict,
        generator_path=generator_path,
        coverage_mode=coverage_mode,
    )


def _quality_report_from_cir_failure(
    report: CirReviewReport,
    *,
    generator_path: str,
    coverage_mode: CoverageMode,
) -> QualityReport:
    issues = [
        PlaybookReviewIssue(
            code=_canonical_cir_quality_code(issue.code),
            severity=(
                PlaybookIssueSeverity.ERROR
                if issue.severity == ReviewSeverity.ERROR
                else PlaybookIssueSeverity.WARNING
            ),
            path=issue.path or "playbook",
            message=issue.message,
            suggestion=issue.suggestion,
            requires_repair=False,
        )
        for issue in report.issues
    ]
    if not any(issue.severity == PlaybookIssueSeverity.ERROR for issue in issues):
        issues.append(
            PlaybookReviewIssue(
                code="quality.generation_failed",
                severity=PlaybookIssueSeverity.ERROR,
                path="pipeline",
                message="Generic CIR generation ended without a valid Playbook candidate.",
                suggestion="Inspect the CIR output and retry generation.",
                requires_repair=False,
            )
        )
    verdict = playbook_review_verdict_from_issues(
        issues,
        clean_summary="Generic CIR generation failed.",
        warning_summary="Generic CIR generation failed with warnings.",
        blocked_summary="Generic CIR generation failed before candidate finalization.",
        actions=list(report.actions),
    )
    return QualityReport.from_review_verdict(
        verdict,
        generator_path=generator_path,
        coverage_mode=coverage_mode,
        attempts=report.attempts,
    )


def _canonical_cir_quality_code(code: str) -> str:
    normalized = re.sub(r"[^a-z0-9_]+", "_", code.strip().lower()).strip("_")
    if "." in code and re.fullmatch(
        r"[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+",
        code,
    ):
        return code
    return f"cir.{normalized or 'generation_failed'}"


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


def humanize_issues(report: CirReviewReport | PlaybookReviewVerdict) -> str:
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
    attempts = getattr(report, "attempts", 0)
    prefix = f"Pipeline output failed review after {attempts} repair attempt(s): "
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
        *_coverage_review_actions(route_context.coverage_decision),
    ]
    if route_context.router_model:
        actions.append(f"router:model:{route_context.router_model}")
    if route.domain:
        actions.append(f"router:domain:{route.domain}")
    if generator == "agent":
        actions.append(f"agent_skill:{route.domain or 'generic'}")
    if route.skill_id:
        actions.append(f"router:skill_id:{route.skill_id}")
    if route.matched_capability:
        actions.append(f"router:matched_capability:{route.matched_capability}")
    if route.needs_refinement:
        actions.append("router:needs_refinement:true")
    if route.unsupported_reason:
        actions.append(f"router:unsupported:{route.unsupported_reason}")
    return actions


def _coverage_review_actions(decision: CoverageDecision) -> list[str]:
    actions = [
        f"coverage:mode:{decision.mode}",
        f"coverage:fallback:{decision.fallback_policy}",
        f"coverage:confidence:{decision.confidence:.2f}",
    ]
    if decision.domain:
        actions.append(f"coverage:domain:{decision.domain}")
    actions.extend(f"coverage:skill:{skill_id}" for skill_id in decision.matched_skill_ids)
    actions.extend(f"coverage:missing:{item}" for item in decision.missing_capabilities)
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
