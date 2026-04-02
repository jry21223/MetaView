import inspect
import logging
from concurrent.futures import ThreadPoolExecutor
from uuid import uuid4

from app.config import Settings
from app.schemas import (
    AgentDiagnostic,
    AgentTrace,
    CirValidationReport,
    CustomProviderUpsertRequest,
    CustomSubjectPromptRequest,
    CustomSubjectPromptResponse,
    OutputMode,
    PipelineRequest,
    PipelineResponse,
    PipelineRunDetail,
    PipelineRunStatus,
    PipelineRunSummary,
    PipelineRuntime,
    PipelineSubmitResponse,
    PromptReferenceRequest,
    PromptReferenceResponse,
    ProviderDescriptor,
    ProviderKind,
    ProviderName,
    RuntimeCatalog,
    RuntimeSettingsRequest,
    RuntimeSettingsResponse,
    SandboxMode,
    TTSSettingsRequest,
    ValidationStatus,
)
from app.services.agents import CoderAgent, CriticAgent, HtmlCoderAgent, PlannerAgent
from app.services.domain_router import infer_domain
from app.services.execution_map import build_execution_map
from app.services.html_renderer import HtmlRenderer
from app.services.history import (
    CustomProviderRepository,
    RunRepository,
    RuntimeSettingsRepository,
)
from app.services.manim_script import ManimScriptError, calculate_step_timing, prepare_manim_script
from app.services.preview_video_renderer import (
    PreviewVideoRenderer,
    PreviewVideoRenderError,
)
from app.services.prompt_authoring import (
    generate_custom_subject_artifact,
    generate_reference_artifact,
)
from app.services.prompts.html_coder import HTML_CODER_PROMPT_VERSION
from app.services.providers.registry import ProviderRegistry
from app.services.repair import PipelineRepairService
from app.services.sandbox import PreviewDryRunSandbox
from app.services.skill_catalog import SubjectSkillRegistry
from app.services.tts_service import build_tts_service
from app.services.validation import CirValidator
from app.services.video_narration import VideoNarrationError, VideoNarrationService

logger = logging.getLogger(__name__)


class PipelineOrchestrator:
    def __init__(self, settings: Settings) -> None:
        self.repository = RunRepository(db_path=settings.history_db_path)
        self.repository.mark_inflight_runs_failed(
            "检测到服务重启，未完成的生成任务已标记为失败，请重新提交。"
        )
        self.custom_provider_repository = CustomProviderRepository(
            db_path=settings.history_db_path
        )
        self.preview_media_root = settings.preview_media_root
        self.openai_base_url = settings.openai_base_url
        self.openai_api_key = settings.openai_api_key
        self.openai_model = settings.openai_model
        self.openai_router_model = settings.openai_router_model
        self.openai_planning_model = settings.openai_planning_model
        self.openai_coding_model = settings.openai_coding_model
        self.openai_critic_model = settings.openai_critic_model
        self.openai_test_model = settings.openai_test_model
        self.openai_supports_vision = settings.openai_supports_vision
        self.openai_timeout_s = settings.openai_timeout_s
        self.config_default_provider = settings.default_provider
        self.config_default_router_provider = settings.default_router_provider
        self.config_default_generation_provider = settings.default_generation_provider
        self.runtime_settings_defaults = RuntimeSettingsRequest(
            mock_provider_enabled=settings.mock_provider_enabled,
            tts=TTSSettingsRequest(
                enabled=settings.preview_tts_enabled,
                backend=settings.preview_tts_backend,
                model=settings.preview_tts_model,
                base_url=settings.preview_tts_base_url,
                api_key=settings.preview_tts_api_key,
                voice=settings.preview_tts_voice,
                rate_wpm=settings.preview_tts_rate_wpm,
                speed=settings.preview_tts_speed,
                max_chars=settings.preview_tts_max_chars,
                timeout_s=settings.preview_tts_timeout_s,
            ),
        )
        self.runtime_settings_repository = RuntimeSettingsRepository(
            db_path=settings.history_db_path
        )
        self.runtime_settings = self.runtime_settings_repository.get_runtime_settings(
            defaults=self.runtime_settings_defaults
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
        self.html_coder = HtmlCoderAgent()
        self.html_renderer = HtmlRenderer(output_dir=settings.preview_html_output_dir)
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
            render_runner=settings.render_runner,
            gvisor_docker_binary=settings.gvisor_docker_binary,
            gvisor_runtime=settings.gvisor_runtime,
            gvisor_image=settings.gvisor_image,
            gvisor_network_enabled=settings.gvisor_network_enabled,
            gvisor_memory_limit_mb=settings.gvisor_memory_limit_mb,
            gvisor_cpu_limit=settings.gvisor_cpu_limit,
            gvisor_pids_limit=settings.gvisor_pids_limit,
        )
        self.background_executor = ThreadPoolExecutor(
            max_workers=4,
            thread_name_prefix="pipeline-run",
        )
        self._refresh_runtime_dependencies()

    def get_runtime_settings(self) -> RuntimeSettingsResponse:
        return RuntimeSettingsResponse.model_validate(
            self.runtime_settings.to_response_payload()
        )

    def update_runtime_settings(
        self,
        payload: RuntimeSettingsRequest,
    ) -> RuntimeSettingsResponse:
        self.runtime_settings = self.runtime_settings_repository.save_runtime_settings(
            payload,
            defaults=self.runtime_settings_defaults,
        )
        self._refresh_runtime_dependencies()
        return self.get_runtime_settings()

    def _refresh_runtime_dependencies(self) -> None:
        self._apply_runtime_settings()
        self.provider_registry = ProviderRegistry(
            custom_provider_repository=self.custom_provider_repository,
            mock_enabled=self.runtime_settings.mock_provider_enabled,
            openai_api_key=self.openai_api_key,
            openai_base_url=self.openai_base_url,
            openai_model=self.openai_model,
            openai_router_model=self.openai_router_model,
            openai_planning_model=self.openai_planning_model,
            openai_coding_model=self.openai_coding_model,
            openai_critic_model=self.openai_critic_model,
            openai_test_model=self.openai_test_model,
            openai_supports_vision=self.openai_supports_vision,
            openai_timeout_s=self.openai_timeout_s,
        )
        default_provider = self.provider_registry.resolve_default_provider(
            self.config_default_provider
        ) or ProviderName.OPENAI.value
        self.default_provider = default_provider
        self.default_router_provider = (
            self.provider_registry.resolve_default_provider(
                self.config_default_router_provider or default_provider
            )
            or default_provider
        )
        self.default_generation_provider = (
            self.provider_registry.resolve_default_provider(
                self.config_default_generation_provider or default_provider
            )
            or default_provider
        )
        self.video_narration_service = VideoNarrationService(
            output_root=self.preview_media_root,
            enabled=self.preview_tts_enabled,
            default_voice=self.preview_tts_voice,
            default_rate_wpm=self.preview_tts_rate_wpm,
            max_chars=self.preview_tts_max_chars,
            tts_service=build_tts_service(
                backend=self.preview_tts_backend,
                default_voice=self.preview_tts_voice,
                default_rate_wpm=self.preview_tts_rate_wpm,
                remote_base_url=self.preview_tts_base_url,
                remote_api_key=self.preview_tts_api_key,
                remote_model=self.preview_tts_model,
                remote_timeout_s=self.preview_tts_timeout_s
                if self.preview_tts_timeout_s is not None
                else self.openai_timeout_s,
                remote_speed=self.preview_tts_speed,
                fallback_base_url=self.openai_base_url,
                fallback_api_key=self.openai_api_key,
            ),
        )

    def _apply_runtime_settings(self) -> None:
        self.preview_tts_enabled = self.runtime_settings.tts.enabled
        self.preview_tts_backend = self.runtime_settings.tts.backend
        self.preview_tts_model = self.runtime_settings.tts.model
        self.preview_tts_base_url = self.runtime_settings.tts.base_url
        self.preview_tts_api_key = self.runtime_settings.tts.api_key
        self.preview_tts_voice = self.runtime_settings.tts.voice
        self.preview_tts_rate_wpm = self.runtime_settings.tts.rate_wpm
        self.preview_tts_speed = self.runtime_settings.tts.speed
        self.preview_tts_max_chars = self.runtime_settings.tts.max_chars
        self.preview_tts_timeout_s = self.runtime_settings.tts.timeout_s

    def runtime_catalog(self) -> RuntimeCatalog:
        return RuntimeCatalog(
            default_provider=self.default_provider,
            default_router_provider=self.default_router_provider,
            default_generation_provider=self.default_generation_provider,
            sandbox_engine=self.sandbox.engine_name,
            providers=self.provider_registry.list_descriptors(),
            skills=self.skill_registry.list_descriptors(),
            sandbox_modes=[SandboxMode.DRY_RUN, SandboxMode.OFF],
            settings=self.get_runtime_settings(),
        )

    def generate_prompt_reference(
        self, request: PromptReferenceRequest
    ) -> PromptReferenceResponse:
        provider_name = request.provider or self.default_generation_provider
        provider = self.provider_registry.get(provider_name)
        if (
            provider.descriptor.kind != ProviderKind.OPENAI_COMPATIBLE
            or not hasattr(provider, "complete_text")
            or not hasattr(provider, "model_for_stage")
        ):
            raise ValueError("Prompt 参考文件生成仅支持 OpenAI 兼容 provider。")

        artifact = generate_reference_artifact(
            provider,
            domain=request.subject,
            notes=request.notes,
            write=request.write,
        )
        return PromptReferenceResponse(
            subject=request.subject,
            provider=provider.descriptor.name,
            model=provider.model_for_stage("planning"),
            output_path=str(artifact.output_path),
            markdown=artifact.markdown,
            wrote_file=artifact.wrote_file,
            raw_output=artifact.raw_output,
        )

    def generate_custom_subject_prompt(
        self, request: CustomSubjectPromptRequest
    ) -> CustomSubjectPromptResponse:
        provider_name = request.provider or self.default_generation_provider
        provider = self.provider_registry.get(provider_name)
        if (
            provider.descriptor.kind != ProviderKind.OPENAI_COMPATIBLE
            or not hasattr(provider, "complete_text")
            or not hasattr(provider, "model_for_stage")
        ):
            raise ValueError("自定义学科 Prompt 生成仅支持 OpenAI 兼容 provider。")

        artifact = generate_custom_subject_artifact(
            provider,
            subject_name=request.subject_name,
            summary=request.summary,
            notes=request.notes,
            write=request.write,
        )
        return CustomSubjectPromptResponse(
            subject_name=artifact.subject_name,
            slug=artifact.slug,
            provider=provider.descriptor.name,
            model=provider.model_for_stage("planning"),
            output_path=str(artifact.output_path),
            markdown=artifact.markdown,
            wrote_file=artifact.wrote_file,
            raw_output=artifact.raw_output,
        )

    def submit_run(self, request: PipelineRequest) -> PipelineSubmitResponse:
        submitted_request = request.model_copy(update={"persist_run": True}, deep=True)
        request_id = str(uuid4())
        created_at = self.repository.create_submitted_run(
            request_id=request_id,
            request=submitted_request,
        )
        self.background_executor.submit(
            self._run_submitted_pipeline,
            submitted_request,
            request_id,
        )
        return PipelineSubmitResponse(
            request_id=request_id,
            created_at=created_at,
            status=PipelineRunStatus.QUEUED,
        )

    def _run_submitted_pipeline(self, request: PipelineRequest, request_id: str) -> None:
        self.repository.mark_run_running(request_id)
        try:
            self.run(request, request_id=request_id)
        except Exception as exc:
            error_id = uuid4().hex[:12]
            message = str(exc).strip() or exc.__class__.__name__
            if exc.__class__.__name__ not in message:
                message = f"{exc.__class__.__name__}: {message}"
            logger.exception(
                "Background pipeline run failed [error_id=%s request_id=%s prompt=%r]",
                error_id,
                request_id,
                request.prompt[:120],
            )
            self.repository.mark_run_failed(
                request_id=request_id,
                request=request,
                error_message=f"{message} [error_id={error_id}]",
            )

    def run(
        self,
        request: PipelineRequest,
        *,
        request_id: str | None = None,
    ) -> PipelineResponse:
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
        request_id = request_id or str(uuid4())
        agent_traces: list[AgentTrace] = [route_trace]
        preview_video_url: str | None = None
        preview_video_backend: str | None = None
        render_error_message: str | None = None
        audio_diagnostics: list[AgentDiagnostic] = []

        planning_hints, planning_trace = self._call_provider_method(
            generation_provider.plan,
            prompt=effective_request.prompt,
            domain=effective_domain.value,
            skill_brief=skill.planning_brief(has_image=bool(request.source_image)),
            source_image=request.source_image,
            source_code=request.source_code,
            source_code_language=request.source_code_language,
            ui_theme=request.ui_theme.value if request.ui_theme is not None else None,
        )
        agent_traces.append(planning_trace)
        cir = self.planner.run(effective_request, skill=skill, hints=planning_hints)
        preview_narration_text = (
            self.build_pipeline_narration(cir) if request.enable_narration else None
        )
        validation_report = self.validator.validate(cir)

        if (
            validation_report.status == ValidationStatus.INVALID
            and repair_count < self.max_repair_attempts
        ):
            cir, new_actions = self.repair_service.repair_cir(cir, validation_report)
            repair_actions.extend(new_actions)
            repair_count += 1
            validation_report = self.validator.validate(cir)

        coding_hints, coding_trace = self._call_provider_method(
            generation_provider.code,
            cir,
            ui_theme=request.ui_theme.value if request.ui_theme is not None else None,
        )
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
                        ui_theme=request.ui_theme.value if request.ui_theme is not None else None,
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
            ui_theme=request.ui_theme.value if request.ui_theme is not None else None,
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
                ui_theme=request.ui_theme.value if request.ui_theme is not None else None,
            )
            repair_count += 1
            if repaired_script is not None:
                renderer_script = repaired_script
                renderer_diagnostic_message = repair_message
                critique_hints, critique_trace, diagnostics = self._run_provider_critique(
                    generation_provider=generation_provider,
                    cir=cir,
                    renderer_script=renderer_script,
                    ui_theme=request.ui_theme.value if request.ui_theme is not None else None,
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
                ui_theme=request.ui_theme.value if request.ui_theme is not None else None,
            )
            repair_count += 1
            if repaired_script is not None:
                renderer_script = repaired_script
                renderer_diagnostic_message = repair_message
                critique_hints, critique_trace, diagnostics = self._run_provider_critique(
                    generation_provider=generation_provider,
                    cir=cir,
                    renderer_script=renderer_script,
                    ui_theme=request.ui_theme.value if request.ui_theme is not None else None,
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

        # ── HTML output branch (independent from Manim) ──────────────
        preview_html_url: str | None = None
        if request.output_mode == OutputMode.HTML:
            html_script = self.html_coder.run(
                cir=cir,
                ui_theme=request.ui_theme.value if request.ui_theme is not None else None,
            )
            renderer_script = html_script  # store in renderer_script for persistence
            html_artifacts = self.html_renderer.render(
                html=html_script,
                request_id=request_id,
                cir_json=cir.model_dump_json(exclude_none=True),
                ui_theme=request.ui_theme.value if request.ui_theme is not None else None,
                prompt_version=HTML_CODER_PROMPT_VERSION,
            )
            preview_html_url = html_artifacts.url

        # ── Video output branch (existing Manim flow, untouched) ─────
        _render_video = request.output_mode != OutputMode.HTML

        if _render_video:
            try:
                preview_video = self.preview_video_renderer.render(
                    script=renderer_script,
                    request_id=request_id,
                    cir=cir,
                    ui_theme=request.ui_theme.value if request.ui_theme is not None else None,
                )
                preview_video_url = preview_video.url
                preview_video_backend = preview_video.backend
                for message in self.maybe_embed_preview_narration(
                    request_id=request_id,
                    preview_video_path=preview_video.file_path,
                    narration_text=preview_narration_text,
                    generation_provider=generation_provider,
                ):
                    audio_diagnostics.append(AgentDiagnostic(agent="audio", message=message))
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
                        ui_theme=request.ui_theme.value if request.ui_theme is not None else None,
                    )
                    repair_count += 1
                    if repaired_script is not None:
                        renderer_script = repaired_script
                        renderer_diagnostic_message = repair_message
                        critique_hints, critique_trace, diagnostics = self._run_provider_critique(
                            generation_provider=generation_provider,
                            cir=cir,
                            renderer_script=renderer_script,
                            ui_theme=request.ui_theme.value if request.ui_theme is not None else None,
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
                                ui_theme=(
                                    request.ui_theme.value
                                    if request.ui_theme is not None
                                    else None
                                ),
                            )
                            preview_video_url = preview_video.url
                            preview_video_backend = preview_video.backend
                            for message in self.maybe_embed_preview_narration(
                                request_id=request_id,
                                preview_video_path=preview_video.file_path,
                                narration_text=preview_narration_text,
                                generation_provider=generation_provider,
                            ):
                                audio_diagnostics.append(
                                    AgentDiagnostic(agent="audio", message=message)
                                )
                        except PreviewVideoRenderError as retry_exc:
                            render_error_message = str(retry_exc)

        response = PipelineResponse(
            request_id=request_id,
            cir=cir,
            renderer_script=renderer_script,
            preview_video_url=preview_video_url,
            preview_html_url=preview_html_url,
            execution_map=build_execution_map(
                request=effective_request,
                cir=cir,
                render_backend=preview_video_backend,
            ),
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
            + audio_diagnostics
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
            step_timing=calculate_step_timing(
                cir, renderer_script=renderer_script,
                source_code=effective_request.source_code or "",
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
        ui_theme: str | None = None,
    ):
        critique_hints, critique_trace = self._call_provider_method(
            generation_provider.critique,
            title=cir.title,
            renderer_script=renderer_script,
            domain=cir.domain,
            ui_theme=ui_theme,
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
        ui_theme: str | None = None,
    ) -> tuple[str | None, str]:
        if not issues:
            return None, "未收集到可用于修复的错误信息。"
        if not hasattr(generation_provider, "repair_code"):
            return None, "当前 provider 不支持脚本修复。"

        repair_actions.append(
            f"已将 {stage_label} 阶段发现的 {len(issues)} 条问题回传给 generation provider 修复。"
        )
        try:
            repair_hints, repair_trace = self._call_provider_method(
                generation_provider.repair_code,
                cir=cir,
                renderer_script=renderer_script,
                issues=issues,
                ui_theme=ui_theme,
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

    def get_run(
        self,
        request_id: str,
        *,
        include_source_image: bool = False,
        include_raw_output: bool = False,
    ) -> PipelineRunDetail | None:
        return self.repository.get_run(
            request_id=request_id,
            include_source_image=include_source_image,
            include_raw_output=include_raw_output,
        )

    def upsert_custom_provider(
        self, payload: CustomProviderUpsertRequest
    ) -> ProviderDescriptor:
        descriptor = self.provider_registry.upsert_custom_provider(payload)
        self._refresh_runtime_dependencies()
        return descriptor

    def test_custom_provider(self, payload: CustomProviderUpsertRequest):
        return self.provider_registry.test_custom_provider(payload)

    def delete_custom_provider(self, name: str) -> bool:
        deleted = self.provider_registry.delete_custom_provider(name)
        if deleted:
            self._refresh_runtime_dependencies()
        return deleted

    def _call_provider_method(self, method, *args, **kwargs):
        signature = inspect.signature(method)
        accepts_kwargs = any(
            parameter.kind == inspect.Parameter.VAR_KEYWORD
            for parameter in signature.parameters.values()
        )
        if accepts_kwargs:
            return method(*args, **kwargs)

        filtered_kwargs = {
            key: value
            for key, value in kwargs.items()
            if key in signature.parameters
        }
        return method(*args, **filtered_kwargs)

    def build_pipeline_narration(self, cir) -> str:
        return self.video_narration_service.build_pipeline_narration(cir)

    def maybe_embed_preview_narration(
        self,
        *,
        request_id: str,
        preview_video_path,
        narration_text: str | None,
        generation_provider=None,
    ) -> list[str]:
        if not narration_text or not narration_text.strip():
            return []
        narration_service = self._narration_service_for_provider(generation_provider)
        if not narration_service.enabled:
            return []
        if not narration_service.is_available():
            return [
                (
                    f"{self.preview_tts_model} 或 ffmpeg 不可用，已跳过旁白嵌入。"
                    "请检查 TTS Base URL、API Key 或 generation provider 的兼容音频接口。"
                )
            ]

        try:
            artifacts = narration_service.embed_narration(
                request_id=request_id,
                video_path=preview_video_path,
                narration_text=narration_text,
            )
        except VideoNarrationError as exc:
            return [f"旁白嵌入失败：{exc}"]

        return [
            (
                f"已使用 {artifacts.tts_backend} 为预览视频嵌入旁白，"
                f"音轨文件已输出到 {artifacts.audio_path.name}。"
            )
        ]

    def _narration_service_for_provider(self, generation_provider):
        provider_base_url = getattr(generation_provider, "base_url", None)
        provider_api_key = getattr(generation_provider, "api_key", None)

        if (
            not provider_base_url
            and not provider_api_key
            and not self.preview_tts_base_url
            and not self.preview_tts_api_key
        ):
            return self.video_narration_service

        return VideoNarrationService(
            output_root=self.preview_media_root,
            enabled=self.preview_tts_enabled,
            default_voice=self.preview_tts_voice,
            default_rate_wpm=self.preview_tts_rate_wpm,
            max_chars=self.preview_tts_max_chars,
            tts_service=build_tts_service(
                backend=self.preview_tts_backend,
                default_voice=self.preview_tts_voice,
                default_rate_wpm=self.preview_tts_rate_wpm,
                remote_base_url=self.preview_tts_base_url or provider_base_url,
                remote_api_key=self.preview_tts_api_key or provider_api_key,
                remote_model=self.preview_tts_model,
                remote_timeout_s=self.preview_tts_timeout_s
                if self.preview_tts_timeout_s is not None
                else self.openai_timeout_s,
                remote_speed=self.preview_tts_speed,
                fallback_base_url=self.openai_base_url,
                fallback_api_key=self.openai_api_key,
            ),
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
