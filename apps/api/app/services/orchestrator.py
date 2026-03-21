from uuid import uuid4
from typing import Optional, Dict, Any
from pathlib import Path

from app.config import Settings
from app.schemas import (
    AgentDiagnostic,
    AgentTrace,
    CirValidationReport,
    CustomProviderUpsertRequest,
    PipelineRequest,
    PipelineResponse,
    PipelineRunDetail,
    PipelineRunSummary,
    PipelineRuntime,
    ProviderDescriptor,
    RuntimeCatalog,
    SandboxMode,
    ValidationStatus,
)
from app.services.agents import CoderAgent, CriticAgent, PlannerAgent
from app.services.concept_design import ConceptDesigner
from app.services.code_generation import CodeGenerator
from app.services.domain_router import infer_domain
from app.services.history import CustomProviderRepository, RunRepository
from app.services.manim_executor import ManimExecutor, ExecutionConfig
from app.services.manim_script import ManimScriptError, prepare_manim_script
from app.services.preview_video_renderer import (
    PreviewVideoRenderer,
    PreviewVideoRenderError,
)
from app.services.process_registry import ProcessRegistry
from app.services.providers.registry import ProviderRegistry
from app.services.queue_processors import QueueProcessor, ProcessorConfig
from app.services.repair import PipelineRepairService
from app.services.sandbox import PreviewDryRunSandbox
from app.services.skill_catalog import SubjectSkillRegistry
from app.services.validation import CirValidator
from app.services.video_narration import VideoNarrationService


class PipelineOrchestrator:
    def __init__(self, settings: Settings) -> None:
        self.repository = RunRepository(db_path=settings.history_db_path)
        self.custom_provider_repository = CustomProviderRepository(
            db_path=settings.history_db_path
        )
        self.provider_registry = ProviderRegistry(
            custom_provider_repository=self.custom_provider_repository,
            openai_api_key=settings.openai_api_key,
            openai_base_url=settings.openai_base_url,
            openai_model=settings.openai_model,
            openai_router_model=settings.openai_router_model,
            openai_planning_model=settings.openai_planning_model,
            openai_coding_model=settings.openai_coding_model,
            openai_critic_model=settings.openai_critic_model,
            openai_test_model=settings.openai_test_model,
            openai_supports_vision=settings.openai_supports_vision,
            openai_timeout_s=settings.openai_timeout_s,
        )
        self.default_router_provider = (
            settings.default_router_provider or settings.default_provider
        )
        self.default_generation_provider = (
            settings.default_generation_provider or settings.default_provider
        )
        self.sandbox = PreviewDryRunSandbox(timeout_ms=settings.sandbox_timeout_ms)
        self.validator = CirValidator()
        self.repair_service = PipelineRepairService()
        self.max_repair_attempts = settings.max_repair_attempts
        self.skill_registry = SubjectSkillRegistry(
            enabled_domains=settings.enabled_topic_domains
        )
        self.planner = PlannerAgent()
        self.coder = CoderAgent()
        self.critic = CriticAgent()
        self.preview_video_renderer = PreviewVideoRenderer(
            output_root=settings.preview_media_root,
            url_prefix=settings.preview_media_url_prefix,
            enabled=settings.preview_video_enabled,
            backend_mode=settings.preview_render_backend,
            manim_python_path=settings.manim_python_path,
            manim_cli_module=settings.manim_cli_module,
            manim_quality=settings.manim_quality,
            manim_format=settings.manim_format,
            manim_disable_caching=settings.manim_disable_caching,
            manim_render_timeout_s=settings.manim_render_timeout_s,
        )
        # ⚠️ 配音功能已禁用（皇上旨意 2026-03-21）
        self.video_narration_service = None  # 原：VideoNarrationService()
        
        # ManimCat 风格架构模块
        self.concept_designer = ConceptDesigner()
        self.code_generator = CodeGenerator()
        self.manim_executor = ManimExecutor(
            config=ExecutionConfig(
                python_path=settings.manim_python_path,
                quality=settings.manim_quality,
                format=settings.manim_format,
                disable_caching=settings.manim_disable_caching,
                timeout_seconds=int(settings.manim_render_timeout_s or 180)
            )
        )
        self.process_registry = ProcessRegistry(
            storage_path=settings.process_storage_path
        )
        self.queue_processor = QueueProcessor(
            config=ProcessorConfig(
                max_concurrent_tasks=settings.max_concurrent_tasks,
                max_queue_size=settings.max_queue_size,
                task_timeout_seconds=settings.task_timeout_s
            )
        )
        
        # 语音讲解服务
        self.video_narration_service = VideoNarrationService()

    def runtime_catalog(self) -> RuntimeCatalog:
        return RuntimeCatalog(
            default_provider=self.default_generation_provider,
            default_router_provider=self.default_router_provider,
            default_generation_provider=self.default_generation_provider,
            sandbox_engine=self.sandbox.engine_name,
            providers=self.provider_registry.list_descriptors(),
            skills=self.skill_registry.list_descriptors(),
            sandbox_modes=[SandboxMode.DRY_RUN, SandboxMode.OFF],
        )

    def run(self, request: PipelineRequest) -> PipelineResponse:
        router_provider_name = request.router_provider or self.default_router_provider
        generation_provider_name = (
            request.generation_provider or request.provider or self.default_generation_provider
        )
        router_provider = self.provider_registry.get(router_provider_name)
        generation_provider = self.provider_registry.get(generation_provider_name)
        if request.domain is None:
            try:
                effective_domain, route_trace = router_provider.route(
                    request.prompt,
                    source_image=request.source_image,
                    source_code=request.source_code,
                )
            except Exception:
                effective_domain = infer_domain(request.prompt, request.source_image)
                route_trace = self._fallback_route_trace(effective_domain)
        else:
            effective_domain = request.domain
            route_trace = self._explicit_route_trace(effective_domain)

        skill = self.skill_registry.get(effective_domain)
        effective_request = request.model_copy(
            update={
                "domain": effective_domain,
                "provider": generation_provider_name,
                "router_provider": router_provider_name,
                "generation_provider": generation_provider_name,
            }
        )
        repair_actions: list[str] = []
        repair_count = 0
        request_id = str(uuid4())
        agent_traces: list[AgentTrace] = [route_trace]
        preview_video_url: str | None = None
        preview_video_backend: str | None = None
        render_error_message: str | None = None

        planning_hints, planning_trace = generation_provider.plan(
            prompt=effective_request.prompt,
            domain=effective_domain.value,
            skill_brief=skill.planning_brief(has_image=bool(request.source_image)),
            source_image=request.source_image,
            source_code=request.source_code,
            source_code_language=request.source_code_language,
        )
        agent_traces.append(planning_trace)
        cir = self.planner.run(effective_request, skill=skill, hints=planning_hints)
        validation_report = self.validator.validate(cir)

        if (
            validation_report.status == ValidationStatus.INVALID
            and repair_count < self.max_repair_attempts
        ):
            cir, new_actions = self.repair_service.repair_cir(cir, validation_report)
            repair_actions.extend(new_actions)
            repair_count += 1
            validation_report = self.validator.validate(cir)

        coding_hints, coding_trace = generation_provider.code(cir)
        agent_traces.append(coding_trace)
        if coding_hints.renderer_script:
            prepared_script, prepare_error = self._prepare_provider_script(
                coding_hints.renderer_script
            )
            if prepared_script is not None:
                renderer_script = prepared_script.code
                detail = (
                    f"；{prepared_script.diagnostics[0]}"
                    if prepared_script.diagnostics
                    else ""
                )
                renderer_diagnostic_message = (
                    f"{generation_provider.descriptor.label} 已返回 Python Manim 脚本，"
                    f"并完成脚本化清洗与补全{detail}"
                )
            else:
                renderer_script = coding_hints.renderer_script
                renderer_diagnostic_message = (
                    "generation provider 返回的脚本未通过脚本化适配，"
                    f"准备按错误反馈继续修复：{prepare_error}"
                )
                if repair_count < self.max_repair_attempts:
                    repaired_script, repair_message = self._attempt_remote_script_repair(
                        generation_provider=generation_provider,
                        cir=cir,
                        renderer_script=renderer_script,
                        issues=[f"脚本化适配失败：{prepare_error}"],
                        agent_traces=agent_traces,
                        repair_actions=repair_actions,
                        stage_label="script-prepare",
                    )
                    repair_count += 1
                    if repaired_script is not None:
                        renderer_script = repaired_script
                        renderer_diagnostic_message = repair_message
                    else:
                        renderer_script = self.coder.run(cir, hints=coding_hints)
                        renderer_diagnostic_message = (
                            "generation provider 返回的脚本未通过脚本化适配，"
                            f"且远程修复失败，已回退到本地 Python Manim 模板：{prepare_error}"
                        )
                else:
                    renderer_script = self.coder.run(cir, hints=coding_hints)
                    renderer_diagnostic_message = (
                        "generation provider 返回的脚本未通过脚本化适配，"
                        f"已回退到本地 Python Manim 模板：{prepare_error}"
                    )
        else:
            renderer_script = self.coder.run(cir, hints=coding_hints)
            renderer_diagnostic_message = (
                "generation provider 未直接返回脚本；"
                "当前系统直接使用本地 Python Manim 模板和后端视频预览。"
            )

        critique_hints, critique_trace, diagnostics = self._run_provider_critique(
            generation_provider=generation_provider,
            cir=cir,
            renderer_script=renderer_script,
        )
        agent_traces.append(critique_trace)
        blocking_issues = self.repair_service.collect_blocking_script_issues(
            renderer_script=renderer_script,
            critique_hints=critique_hints,
        )
        if blocking_issues and repair_count < self.max_repair_attempts:
            repaired_script, repair_message = self._attempt_remote_script_repair(
                generation_provider=generation_provider,
                cir=cir,
                renderer_script=renderer_script,
                issues=blocking_issues,
                agent_traces=agent_traces,
                repair_actions=repair_actions,
                stage_label="critic-review",
            )
            repair_count += 1
            if repaired_script is not None:
                renderer_script = repaired_script
                renderer_diagnostic_message = repair_message
                critique_hints, critique_trace, diagnostics = self._run_provider_critique(
                    generation_provider=generation_provider,
                    cir=cir,
                    renderer_script=renderer_script,
                )
                agent_traces.append(critique_trace)
        sandbox_report = self.sandbox.run(
            script=renderer_script, cir=cir, mode=request.sandbox_mode
        )

        if (
            sandbox_report.status.value == "failed"
            and repair_count < self.max_repair_attempts
            and request.sandbox_mode != SandboxMode.OFF
        ):
            repair_actions.extend(self.repair_service.repair_script(cir, sandbox_report))
            repaired_script, repair_message = self._attempt_remote_script_repair(
                generation_provider=generation_provider,
                cir=cir,
                renderer_script=renderer_script,
                issues=self.repair_service.collect_blocking_script_issues(
                    renderer_script=renderer_script,
                    critique_hints=critique_hints,
                    extra_issues=sandbox_report.errors,
                ),
                agent_traces=agent_traces,
                repair_actions=repair_actions,
                stage_label="sandbox",
            )
            repair_count += 1
            if repaired_script is not None:
                renderer_script = repaired_script
                renderer_diagnostic_message = repair_message
                critique_hints, critique_trace, diagnostics = self._run_provider_critique(
                    generation_provider=generation_provider,
                    cir=cir,
                    renderer_script=renderer_script,
                )
                agent_traces.append(critique_trace)
                sandbox_report = self.sandbox.run(
                    script=renderer_script, cir=cir, mode=request.sandbox_mode
                )
            elif coding_hints.renderer_script:
                renderer_script = self.coder.run(cir, hints=coding_hints)
                renderer_diagnostic_message = (
                    "generation provider 已返回原始脚本，但其结果未通过 dry-run；"
                    "远程修复失败后已回退到本地 Python Manim 模板。"
                )
                sandbox_report = self.sandbox.run(
                    script=renderer_script, cir=cir, mode=request.sandbox_mode
                )

        try:
            preview_video = self.preview_video_renderer.render(
                script=renderer_script,
                request_id=request_id,
                cir=cir,
            )
            preview_video_url = preview_video.url
            preview_video_backend = preview_video.backend
            
            # ✅ TTS 已启用 - 视频渲染正常，现在可以添加配音
            # 使用新的分段解说词生成功能
            if preview_video.file_path and cir:
                try:
                    import logging
                    # 检查视频时长
                    import subprocess
                    result = subprocess.run(
                        ['ffprobe', '-v', 'error', '-show_entries', 'format=duration',
                         '-of', 'default=noprint_wrappers=1:nokey=1', str(preview_video.file_path)],
                        capture_output=True, text=True
                    )
                    video_duration = float(result.stdout.strip()) if result.stdout.strip() else 0
                    logging.info(f"视频时长：{video_duration}秒")
                    
                    # ⚠️ 配音功能已禁用（皇上旨意 2026-03-21）
                    # if video_duration >= 5:  # 视频至少 5 秒才添加配音
                    #     narration_result = self.video_narration_service.add_segmented_narration_to_video(...)
                    logging.info("⚠️ 配音功能已禁用，跳过 TTS 配音")
                except Exception as e:
                    import logging
                    logging.error(f"TTS 配音失败：{e}")
        except PreviewVideoRenderError as exc:
            render_error_message = str(exc)
            if repair_count < self.max_repair_attempts:
                repaired_script, repair_message = self._attempt_remote_script_repair(
                    generation_provider=generation_provider,
                    cir=cir,
                    renderer_script=renderer_script,
                    issues=self.repair_service.collect_blocking_script_issues(
                        renderer_script=renderer_script,
                        critique_hints=critique_hints,
                        extra_issues=[render_error_message],
                    ),
                    agent_traces=agent_traces,
                    repair_actions=repair_actions,
                    stage_label="real-render",
                )
                repair_count += 1
                if repaired_script is not None:
                    renderer_script = repaired_script
                    renderer_diagnostic_message = repair_message
                    critique_hints, critique_trace, diagnostics = self._run_provider_critique(
                        generation_provider=generation_provider,
                        cir=cir,
                        renderer_script=renderer_script,
                    )
                    agent_traces.append(critique_trace)
                    sandbox_report = self.sandbox.run(
                        script=renderer_script, cir=cir, mode=request.sandbox_mode
                    )
                    try:
                        preview_video = self.preview_video_renderer.render(
                            script=renderer_script,
                            request_id=request_id,
                            cir=cir,
                        )
                        preview_video_url = preview_video.url
                        preview_video_backend = preview_video.backend
                    except PreviewVideoRenderError as retry_exc:
                        render_error_message = str(retry_exc)

        response = PipelineResponse(
            request_id=request_id,
            cir=cir,
            renderer_script=renderer_script,
            preview_video_url=preview_video_url,
            diagnostics=[
                AgentDiagnostic(
                    agent="router",
                    message=(
                        f"已自动路由到 {skill.descriptor.label}。"
                        if request.domain is None
                        else f"使用显式 domain：{skill.descriptor.label}。"
                    ),
                )
            ]
            + [AgentDiagnostic(agent="coder", message=renderer_diagnostic_message)]
            + self._validation_diagnostics(validation_report)
            + diagnostics
            + self._sandbox_diagnostics(sandbox_report)
            + self._repair_diagnostics(repair_actions)
            + (
                [
                    AgentDiagnostic(
                        agent="video",
                        message=(
                            f"已在后端完成 {preview_video_backend} 渲染，主页将优先播放该视频。"
                        ),
                    )
                ]
                if preview_video_url and preview_video_backend
                else []
            )
            + (
                [
                    AgentDiagnostic(
                        agent="video",
                        message=f"后端视频渲染失败：{render_error_message}",
                    )
                ]
                if not preview_video_url and render_error_message
                else []
            ),
            runtime=PipelineRuntime(
                skill=skill.descriptor,
                provider=generation_provider.descriptor,
                router_provider=router_provider.descriptor,
                generation_provider=generation_provider.descriptor,
                sandbox=sandbox_report,
                validation=validation_report,
                agent_traces=agent_traces,
                repair_count=repair_count,
                repair_actions=repair_actions,
            ),
        )

        if effective_request.persist_run:
            self.repository.save_run(request=effective_request, response=response)

        return response

    def _prepare_provider_script(
        self,
        renderer_script: str,
    ) -> tuple[object | None, str | None]:
        try:
            return prepare_manim_script(renderer_script), None
        except ManimScriptError as exc:
            return None, str(exc)

    def _run_provider_critique(
        self,
        *,
        generation_provider,
        cir,
        renderer_script: str,
    ):
        critique_hints, critique_trace = generation_provider.critique(
            title=cir.title,
            renderer_script=renderer_script,
            domain=cir.domain,
        )
        diagnostics = self.critic.run(cir, hints=critique_hints)
        return critique_hints, critique_trace, diagnostics

    def _attempt_remote_script_repair(
        self,
        *,
        generation_provider,
        cir,
        renderer_script: str,
        issues: list[str],
        agent_traces: list[AgentTrace],
        repair_actions: list[str],
        stage_label: str,
    ) -> tuple[str | None, str]:
        if not issues:
            return None, "未收集到可用于修复的错误信息。"
        if not hasattr(generation_provider, "repair_code"):
            return None, "当前 provider 不支持脚本修复。"

        repair_actions.append(
            f"已将 {stage_label} 阶段发现的 {len(issues)} 条问题回传给 generation provider 修复。"
        )
        try:
            repair_hints, repair_trace = generation_provider.repair_code(
                cir=cir,
                renderer_script=renderer_script,
                issues=issues,
            )
        except Exception as exc:
            message = f"远程修复调用失败：{exc}"
            repair_actions.append(message)
            return None, message

        agent_traces.append(repair_trace)
        if not repair_hints.renderer_script:
            message = "远程修复未返回可执行脚本。"
            repair_actions.append(message)
            return None, message

        prepared_script, prepare_error = self._prepare_provider_script(
            repair_hints.renderer_script
        )
        if prepared_script is None:
            message = f"远程修复返回的脚本仍不可执行：{prepare_error}"
            repair_actions.append(message)
            return None, message

        detail = (
            f"；{prepared_script.diagnostics[0]}"
            if prepared_script.diagnostics
            else ""
        )
        message = (
            f"{generation_provider.descriptor.label} 已根据 {stage_label} 阶段的错误反馈修复脚本"
            f"{detail}"
        )
        repair_actions.append(f"{stage_label} 阶段脚本修复成功。")
        return prepared_script.code, message

    def list_runs(self, limit: int = 20) -> list[PipelineRunSummary]:
        return self.repository.list_runs(limit=limit)

    def get_run(self, request_id: str) -> PipelineRunDetail | None:
        return self.repository.get_run(request_id=request_id)

    def upsert_custom_provider(
        self, payload: CustomProviderUpsertRequest
    ) -> ProviderDescriptor:
        return self.provider_registry.upsert_custom_provider(payload)

    def test_custom_provider(self, payload: CustomProviderUpsertRequest):
        return self.provider_registry.test_custom_provider(payload)

    def delete_custom_provider(self, name: str) -> bool:
        return self.provider_registry.delete_custom_provider(name)
    
    def generate_video_with_narration(
        self,
        video_path: str,
        narration_text: str,
        output_dir: str,
        voice: str = "female",
        bgm_path: Optional[str] = None,
        bgm_volume: float = 0.3
    ) -> Dict[str, Any]:
        """
        为视频生成语音讲解并合成
        
        Args:
            video_path: 输入视频路径
            narration_text: 讲解文本
            output_dir: 输出目录
            voice: 音色（female/male）
            bgm_path: 背景音乐路径
            bgm_volume: 背景音乐音量
        
        Returns:
            dict: 结果字典
        """
        return self.video_narration_service.add_narration_to_video(
            video_path=video_path,
            narration_text=narration_text,
            output_dir=output_dir,
            voice=voice,
            bgm_path=bgm_path,
            bgm_volume=bgm_volume
        )

    def _sandbox_diagnostics(self, sandbox_report) -> list[AgentDiagnostic]:
        diagnostics: list[AgentDiagnostic] = []

        for warning in sandbox_report.warnings:
            diagnostics.append(AgentDiagnostic(agent="sandbox", message=warning))

        for error in sandbox_report.errors:
            diagnostics.append(AgentDiagnostic(agent="sandbox", message=error))

        return diagnostics

    def _validation_diagnostics(
        self, validation_report: CirValidationReport
    ) -> list[AgentDiagnostic]:
        diagnostics: list[AgentDiagnostic] = []
        for issue in validation_report.issues:
            diagnostics.append(
                AgentDiagnostic(
                    agent="validator",
                    message=f"[{issue.severity.value}] {issue.message}",
                )
            )
        return diagnostics

    def _repair_diagnostics(self, repair_actions: list[str]) -> list[AgentDiagnostic]:
        return [AgentDiagnostic(agent="repair", message=action) for action in repair_actions]

    def _fallback_route_trace(self, domain) -> AgentTrace:
        return AgentTrace(
            agent="router",
            provider="system",
            model="heuristic-domain-router",
            summary=f"Provider 路由失败，已回退到规则路由：{domain.value}",
        )

    def _explicit_route_trace(self, domain) -> AgentTrace:
        return AgentTrace(
            agent="router",
            provider="user",
            model="manual-domain",
            summary=f"使用显式 domain：{domain.value}",
        )
