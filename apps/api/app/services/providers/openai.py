from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Any

import httpx

from app.schemas import (
    AgentTrace,
    CirDocument,
    ProviderDescriptor,
    ProviderKind,
    ProviderName,
    TopicDomain,
)
from app.services.domain_router import infer_domain_with_scores
from app.services.prompts import (
    build_coder_system_prompt,
    build_coder_user_prompt,
    build_critic_system_prompt,
    build_critic_user_prompt,
    build_planner_system_prompt,
    build_planner_user_prompt,
    build_repair_system_prompt,
    build_repair_user_prompt,
    build_router_system_prompt,
    build_router_user_prompt,
)
from app.services.providers.base import CodingHints, CritiqueHints, PlanningHints


class ProviderInvocationError(RuntimeError):
    pass


def _extract_json_object(content: str) -> dict:
    start = content.find("{")
    end = content.rfind("}")
    if start == -1 or end == -1 or end <= start:
        raise ProviderInvocationError("Provider 返回中未找到 JSON 对象。")

    try:
        return json.loads(content[start : end + 1])
    except json.JSONDecodeError as exc:
        raise ProviderInvocationError("Provider 返回的 JSON 无法解析。") from exc


def _should_override_router_domain(
    *,
    remote_domain: TopicDomain,
    heuristic_domain: TopicDomain,
    heuristic_scores: dict[TopicDomain, int],
) -> bool:
    """决定是否用本地关键词路由覆盖远程 LLM 的路由结果。

    覆盖条件：
    - 当本地关键词明确匹配（分数 >= 1）且远程域完全不匹配（分数 = 0）时覆盖
    - 这可以纠正 LLM 对某些专业术语的误判
    """
    if remote_domain == heuristic_domain:
        return False

    heuristic_score = heuristic_scores.get(heuristic_domain, 0)
    remote_score = heuristic_scores.get(remote_domain, 0)

    # 当本地有关键词证据且远程域完全无关键词支持时，覆盖远程判断
    if heuristic_score >= 1 and remote_score == 0:
        return True
    return False


@dataclass
class OpenAICompatibleProvider:
    api_key: str
    model: str
    stage_models: dict[str, str] = field(default_factory=dict)
    base_url: str = "https://api.openai.com/v1"
    timeout_s: float | None = None
    provider_id: str = ProviderName.OPENAI.value
    label: str = "OpenAI Compatible"
    description: str = "OpenAI 兼容 Provider，使用远程模型生成规划、编码和批评提示。"
    is_custom: bool = False
    supports_vision: bool = False
    temperature: float = 0.2
    descriptor: ProviderDescriptor = field(init=False)

    def __post_init__(self) -> None:
        normalized_stage_models = self._normalize_stage_models(self.stage_models)
        self.stage_models = normalized_stage_models
        self.descriptor = ProviderDescriptor(
            name=self.provider_id,
            label=self.label,
            kind=ProviderKind.OPENAI_COMPATIBLE,
            model=self.model,
            stage_models=normalized_stage_models,
            description=self.description,
            configured=True,
            is_custom=self.is_custom,
            supports_vision=self.supports_vision,
            base_url=self.base_url,
        )

    def model_for_stage(self, stage: str) -> str:
        if stage == "html_coding":
            return self.stage_models.get("html_coding", self.stage_models.get("coding", self.model))
        if stage == "repair":
            return self.stage_models.get("repair", self.stage_models.get("coding", self.model))
        return self.stage_models.get(stage, self.model)

    def route(
        self,
        prompt: str,
        source_image: str | None = None,
        source_code: str | None = None,
    ) -> tuple[TopicDomain, AgentTrace]:
        heuristic_domain, heuristic_scores = infer_domain_with_scores(
            prompt,
            source_image if self.supports_vision else None,
            source_code=source_code,
        )
        remote_domain: TopicDomain | None = None
        content, raw_output = self._request_chat_content(
            stage="router",
            system_prompt=build_router_system_prompt(
                ["algorithm", "math", "code", "physics", "chemistry", "biology", "geography"]
            ),
            user_content=(
                [
                    {
                        "type": "text",
                        "text": build_router_user_prompt(prompt=prompt, source_code=source_code),
                    },
                    {"type": "image_url", "image_url": {"url": source_image}},
                ]
                if source_image and self.supports_vision
                else build_router_user_prompt(prompt=prompt, source_code=source_code)
            ),
        )
        try:
            payload = _extract_json_object(content)
        except ProviderInvocationError:
            reason = f"远程 router 输出无法解析，已回退到本地关键词路由：{heuristic_domain.value}"
            trace = AgentTrace(
                agent="router",
                provider=self.descriptor.name,
                model=self.model_for_stage("router"),
                summary=reason,
                raw_output=raw_output,
            )
            return heuristic_domain, trace
        domain_value = str(payload.get("domain", "")).strip().lower()
        try:
            remote_domain = TopicDomain(domain_value)
            domain = remote_domain
        except ValueError:
            domain = heuristic_domain
        else:
            if _should_override_router_domain(
                remote_domain=remote_domain,
                heuristic_domain=heuristic_domain,
                heuristic_scores=heuristic_scores,
            ):
                domain = heuristic_domain

        reason = str(payload.get("reason", "")).strip() or f"自动路由到 {domain.value}"
        if remote_domain is not None and domain != remote_domain:
            reason = (
                f"{reason}；本地关键词校验将结果修正为 {domain.value}"
            )
        trace = AgentTrace(
            agent="router",
            provider=self.descriptor.name,
            model=self.model_for_stage("router"),
            summary=reason,
            raw_output=raw_output,
        )
        return domain, trace

    def plan(
        self,
        prompt: str,
        domain: str,
        skill_brief: str,
        source_image: str | None = None,
        source_code: str | None = None,
        source_code_language: str | None = None,
        ui_theme: str | None = None,
    ) -> tuple[PlanningHints, AgentTrace]:
        payload, raw_output = self._chat(
            stage="planning",
            system_prompt=build_planner_system_prompt(
                domain,
                source_code=source_code,
                source_code_language=source_code_language,
                ui_theme=ui_theme,
            ),
            user_prompt=build_planner_user_prompt(
                prompt=prompt,
                domain=domain,
                skill_brief=skill_brief,
                source_code=source_code,
                source_code_language=source_code_language,
                ui_theme=ui_theme,
            ),
            source_image=source_image if self.supports_vision else None,
        )
        hints = PlanningHints(
            focus=str(payload.get("focus", "聚焦核心概念与步骤展开")),
            concepts=[str(item) for item in payload.get("concepts", [])],
            warnings=[str(item) for item in payload.get("warnings", [])],
        )
        if source_image and not self.supports_vision:
            hints.warnings.append(
                "当前 provider 未声明视觉能力，题图未发送到远程模型，仅按文本继续规划。"
            )
        trace = AgentTrace(
            agent="planner",
            provider=self.descriptor.name,
            model=self.model_for_stage("planning"),
            summary=f"远程 provider 已规划焦点：{hints.focus}。",
            raw_output=raw_output,
        )
        return hints, trace

    def code(self, cir: CirDocument, ui_theme: str | None = None) -> tuple[CodingHints, AgentTrace]:
        from app.services.prompts.preset_injector import apply_preset_patches

        system_prompt = build_coder_system_prompt(
            cir.domain,
            title=cir.title,
            summary=cir.summary,
            cir_json=cir.model_dump_json(indent=2),
            ui_theme=ui_theme,
        )
        system_prompt = apply_preset_patches(cir.preset_id, system_prompt)

        content, raw_output = self._chat_text(
            stage="coding",
            system_prompt=system_prompt,
            user_prompt=build_coder_user_prompt(
                title=cir.title,
                domain=cir.domain.value,
                summary=cir.summary,
                cir_json=cir.model_dump_json(indent=2),
                ui_theme=ui_theme,
            ),
        )
        hints = CodingHints(
            target="python-manim",
            style_notes=["remote python manim generated by provider"],
            renderer_script=content,
        )
        trace = AgentTrace(
            agent="coder",
            provider=self.descriptor.name,
            model=self.model_for_stage("coding"),
            summary=f"远程 provider 已为《{cir.title}》生成 Python Manim 草稿。",
            raw_output=raw_output,
        )
        return hints, trace

    def critique(
        self,
        title: str,
        renderer_script: str,
        domain: TopicDomain,
        ui_theme: str | None = None,
    ) -> tuple[CritiqueHints, AgentTrace]:
        payload, raw_output = self._chat(
            stage="critic",
            system_prompt=build_critic_system_prompt(domain, ui_theme=ui_theme),
            user_prompt=build_critic_user_prompt(
                title=title,
                renderer_script=renderer_script,
                ui_theme=ui_theme,
            ),
        )
        check_messages, check_blocking_issues = self._normalize_feedback_messages(
            payload.get("checks", [])
        )
        warning_messages, warning_blocking_issues = self._normalize_feedback_messages(
            payload.get("warnings", [])
        )
        hints = CritiqueHints(
            checks=check_messages,
            warnings=warning_messages,
            blocking_issues=check_blocking_issues + warning_blocking_issues,
        )
        trace = AgentTrace(
            agent="critic",
            provider=self.descriptor.name,
            model=self.model_for_stage("critic"),
            summary=f"远程 provider 已完成《{title}》的脚本审查。",
            raw_output=raw_output,
        )
        return hints, trace

    def repair_code(
        self,
        cir: CirDocument,
        renderer_script: str,
        issues: list[str],
        ui_theme: str | None = None,
    ) -> tuple[CodingHints, AgentTrace]:
        content, raw_output = self._chat_text(
            stage="repair",
            system_prompt=build_repair_system_prompt(
                cir.domain,
                title=cir.title,
                summary=cir.summary,
                cir_json=cir.model_dump_json(indent=2),
                ui_theme=ui_theme,
            ),
            user_prompt=build_repair_user_prompt(
                title=cir.title,
                domain=cir.domain.value,
                summary=cir.summary,
                cir_json=cir.model_dump_json(indent=2),
                renderer_script=renderer_script,
                issues=issues,
                ui_theme=ui_theme,
            ),
        )
        hints = CodingHints(
            target="python-manim",
            style_notes=["remote python manim repaired by provider"],
            renderer_script=content,
        )
        trace = AgentTrace(
            agent="repair",
            provider=self.descriptor.name,
            model=self.model_for_stage("repair"),
            summary=f"远程 provider 已根据 {len(issues)} 条问题修复 Python Manim 脚本。",
            raw_output=raw_output,
        )
        return hints, trace

    def test_connection(self) -> tuple[str, str]:
        content, raw_output = self._chat_text(
            stage="test",
            system_prompt=(
                "You are a connectivity probe. "
                "Reply with a short plain text line confirming the model is reachable."
            ),
            user_prompt="ping",
        )
        return content.strip(), raw_output

    def complete_text(
        self,
        *,
        stage: str,
        system_prompt: str,
        user_prompt: str,
        source_image: str | None = None,
    ) -> tuple[str, str]:
        return self._chat_text(
            stage=stage,
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            source_image=source_image,
        )

    def _chat(
        self,
        stage: str,
        system_prompt: str,
        user_prompt: str,
        source_image: str | None = None,
    ) -> tuple[dict, str]:
        user_content: str | list[dict[str, Any]]
        if source_image:
            user_content = [
                {"type": "text", "text": user_prompt},
                {"type": "image_url", "image_url": {"url": source_image}},
            ]
        else:
            user_content = user_prompt
        content, raw_output = self._request_chat_content(
            stage=stage,
            system_prompt=system_prompt,
            user_content=user_content,
        )
        return _extract_json_object(content), raw_output

    def _chat_text(
        self,
        stage: str,
        system_prompt: str,
        user_prompt: str,
        source_image: str | None = None,
    ) -> tuple[str, str]:
        user_content: str | list[dict[str, Any]]
        if source_image:
            user_content = [
                {"type": "text", "text": user_prompt},
                {"type": "image_url", "image_url": {"url": source_image}},
            ]
        else:
            user_content = user_prompt
        return self._request_chat_content(
            stage=stage,
            system_prompt=system_prompt,
            user_content=user_content,
        )

    def _request_chat_content(
        self,
        stage: str,
        system_prompt: str,
        user_content: str | list[dict[str, Any]],
    ) -> tuple[str, str]:
        payload = self._post_chat_completion(
            stage=stage,
            system_prompt=system_prompt,
            user_content=user_content,
        )

        try:
            content = payload["choices"][0]["message"]["content"]
        except (KeyError, IndexError, TypeError) as exc:
            raise ProviderInvocationError("Provider 响应缺少 choices.message.content。") from exc

        raw_output = self._format_raw_output(content)

        if isinstance(content, list):
            text_chunks = [
                item.get("text", "")
                for item in content
                if isinstance(item, dict) and item.get("type") == "text"
            ]
            content = "\n".join(chunk for chunk in text_chunks if chunk)

        if not isinstance(content, str):
            raise ProviderInvocationError("Provider content 不是字符串。")

        return content, raw_output

    def _post_chat_completion(
        self,
        stage: str,
        system_prompt: str,
        user_content: str | list[dict[str, Any]],
    ) -> dict[str, Any]:
        endpoint = self._chat_completions_endpoint()
        model = self.model_for_stage(stage)
        try:
            response = self._send_chat_completion_request(
                endpoint=endpoint,
                model=model,
                system_prompt=system_prompt,
                user_content=user_content,
                trust_env=True,
                stage=stage,
            )
        except httpx.TimeoutException as exc:
            timeout_label = (
                f"{self.timeout_s:g}s" if self.timeout_s is not None else "未设置超时限制"
            )
            raise ProviderInvocationError(
                f"Provider 请求超时（{timeout_label}），请检查模型服务是否可达。"
            ) from exc
        except httpx.ConnectError:
            try:
                response = self._send_chat_completion_request(
                    endpoint=endpoint,
                    model=model,
                    system_prompt=system_prompt,
                    user_content=user_content,
                    trust_env=False,
                    stage=stage,
                )
            except httpx.ConnectError as retry_exc:
                detail = self._connection_error_detail(
                    retry_exc,
                    endpoint=endpoint,
                    protocol_hint=(
                        "TLS/SSL 连接在握手阶段被对端提前关闭。"
                        " 常见原因：本机代理或网关干扰 HTTPS、"
                        "目标服务临时抖动、SNI/反向代理配置异常，"
                        "或服务端对某些 TLS 客户端实现兼容性较差。"
                    ),
                )
                raise ProviderInvocationError(detail) from retry_exc
            except httpx.TimeoutException as retry_exc:
                timeout_label = (
                    f"{self.timeout_s:g}s" if self.timeout_s is not None else "未设置超时限制"
                )
                raise ProviderInvocationError(
                    f"Provider 请求超时（{timeout_label}），请检查模型服务是否可达。"
                ) from retry_exc
            except httpx.HTTPStatusError as retry_exc:
                status_code = retry_exc.response.status_code
                response_excerpt = self._response_excerpt(retry_exc.response)
                detail = f"Provider 请求失败，HTTP {status_code}。"
                if response_excerpt:
                    detail = f"{detail} 原始响应片段：{response_excerpt}"
                raise ProviderInvocationError(detail) from retry_exc
            except httpx.HTTPError as retry_exc:
                raise ProviderInvocationError(
                    self._connection_error_detail(retry_exc, endpoint=endpoint)
                ) from retry_exc
        except httpx.RemoteProtocolError:
            try:
                response = self._send_chat_completion_request(
                    endpoint=endpoint,
                    model=model,
                    system_prompt=system_prompt,
                    user_content=user_content,
                    trust_env=False,
                    stage=stage,
                )
            except httpx.RemoteProtocolError as retry_exc:
                if stage == "html_coding":
                    reduced = (self._max_tokens_for_stage(stage) or 8192) // 2
                    try:
                        response = self._send_chat_completion_request(
                            endpoint=endpoint,
                            model=model,
                            system_prompt=system_prompt,
                            user_content=user_content,
                            trust_env=False,
                            stage=stage,
                            max_tokens=reduced,
                        )
                    except (httpx.RemoteProtocolError, httpx.HTTPError) as final_exc:
                        raise ProviderInvocationError(
                            self._connection_error_detail(
                                final_exc,
                                endpoint=endpoint,
                                protocol_hint=(
                                    f"服务端两次断开连接，降低 max_tokens 至 {reduced} 后仍失败。"
                                    "建议检查代理端输出限制。"
                                ),
                            )
                        ) from final_exc
                else:
                    detail = self._connection_error_detail(
                        retry_exc,
                        endpoint=endpoint,
                        protocol_hint=(
                            "服务端在返回完整 HTTP 响应前中断了连接。"
                            " 常见原因：base_url 配置错误、反向代理异常、"
                            "上游服务不兼容 OpenAI `/chat/completions` 协议，"
                            "或环境代理劫持了请求。"
                        ),
                    )
                    raise ProviderInvocationError(detail) from retry_exc
            except httpx.TimeoutException as retry_exc:
                timeout_label = (
                    f"{self.timeout_s:g}s" if self.timeout_s is not None else "未设置超时限制"
                )
                raise ProviderInvocationError(
                    f"Provider 请求超时（{timeout_label}），请检查模型服务是否可达。"
                ) from retry_exc
            except httpx.HTTPStatusError as retry_exc:
                status_code = retry_exc.response.status_code
                response_excerpt = self._response_excerpt(retry_exc.response)
                detail = f"Provider 请求失败，HTTP {status_code}。"
                if response_excerpt:
                    detail = f"{detail} 原始响应片段：{response_excerpt}"
                raise ProviderInvocationError(detail) from retry_exc
            except httpx.HTTPError as retry_exc:
                raise ProviderInvocationError(
                    self._connection_error_detail(retry_exc, endpoint=endpoint)
                ) from retry_exc
        except httpx.HTTPStatusError as exc:
            status_code = exc.response.status_code
            response_excerpt = self._response_excerpt(exc.response)
            detail = f"Provider 请求失败，HTTP {status_code}。"
            if response_excerpt:
                detail = f"{detail} 原始响应片段：{response_excerpt}"
            raise ProviderInvocationError(
                detail
            ) from exc
        except httpx.HTTPError as exc:
            raise ProviderInvocationError(
                self._connection_error_detail(exc, endpoint=endpoint)
            ) from exc

        try:
            payload = response.json()
        except json.JSONDecodeError as exc:
            response_excerpt = self._response_excerpt(response)
            detail = "Provider 响应不是合法 JSON。"
            if response_excerpt:
                detail = f"{detail} 原始响应片段：{response_excerpt}"
            raise ProviderInvocationError(detail) from exc

        if not isinstance(payload, dict):
            raise ProviderInvocationError("Provider 响应 JSON 不是对象。")

        return payload

    def _format_raw_output(self, content: Any) -> str:
        if isinstance(content, str):
            return content
        try:
            return json.dumps(content, ensure_ascii=False, indent=2)
        except TypeError:
            return str(content)

    def _response_excerpt(self, response: httpx.Response, limit: int = 1600) -> str:
        try:
            text = response.text
        except Exception:
            return ""
        if not text:
            return ""
        normalized = " ".join(text.split())
        if len(normalized) <= limit:
            return normalized
        return f"{normalized[:limit]}..."

    def _chat_completions_endpoint(self) -> str:
        return f"{self.base_url.rstrip('/')}/chat/completions"

    def _send_chat_completion_request(
        self,
        *,
        endpoint: str,
        model: str,
        system_prompt: str,
        user_content: str | list[dict[str, Any]],
        trust_env: bool,
        stage: str | None = None,
        max_tokens: int | None = None,
    ) -> httpx.Response:
        payload: dict[str, Any] = {
            "model": model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_content},
            ],
            "temperature": self.temperature,
        }
        effective_max_tokens = max_tokens if max_tokens is not None else self._max_tokens_for_stage(stage, endpoint=endpoint)
        if effective_max_tokens is not None:
            payload["max_tokens"] = effective_max_tokens
        response = httpx.post(
            endpoint,
            headers=self._headers(),
            json=payload,
            timeout=self.timeout_s,
            follow_redirects=True,
            trust_env=trust_env,
        )
        response.raise_for_status()
        return response

    @staticmethod
    def _max_tokens_for_stage(stage: str | None, *, endpoint: str | None = None) -> int | None:
        """Return the completion max_tokens for a given pipeline stage."""
        if stage not in {"html_coding", "coding", "repair"}:
            return None
        return 8192

    def _normalize_stage_models(self, stage_models: dict[str, str]) -> dict[str, str]:
        normalized: dict[str, str] = {}
        for stage, value in stage_models.items():
            normalized_stage = stage.strip().lower()
            normalized_value = value.strip()
            if not normalized_stage or not normalized_value:
                continue
            if normalized_value == self.model:
                continue
            normalized[normalized_stage] = normalized_value
        return normalized

    def _normalize_feedback_messages(
        self,
        items: Any,
    ) -> tuple[list[str], list[str]]:
        if not isinstance(items, list):
            return [], []

        messages: list[str] = []
        blocking_issues: list[str] = []
        for item in items:
            message = self._stringify_feedback_item(item)
            if message:
                messages.append(message)

            blocking_issue = self._extract_blocking_issue(item)
            if blocking_issue:
                blocking_issues.append(blocking_issue)

        return messages, blocking_issues

    def _stringify_feedback_item(self, item: Any) -> str:
        if isinstance(item, str):
            return item
        if isinstance(item, dict):
            try:
                return json.dumps(item, ensure_ascii=False)
            except TypeError:
                return str(item)
        return str(item)

    def _extract_blocking_issue(self, item: Any) -> str | None:
        if isinstance(item, dict):
            status = str(item.get("status", "")).strip().lower()
            issue_type = str(item.get("type", "")).strip().lower()
            details = str(item.get("details", "")).strip()
            name = str(item.get("name", "")).strip()
            if status in {"fail", "error"}:
                return f"{name}: {details}" if name and details else name or details or None
            if issue_type in {
                "runtime_error",
                "render_error",
                "syntax_error",
                "import_error",
                "latex_fragility",
                "text_rendering",
                "layout_overlap",
                "theme_mismatch",
                "language_mismatch",
            }:
                return details or name or None
            return None
        if isinstance(item, str):
            lowered = item.lower()
            if any(
                token in lowered
                for token in (
                    "runtime_error",
                    "render_error",
                    "syntax_error",
                    "import_error",
                    "layout_overlap",
                    "theme_mismatch",
                    "language_mismatch",
                    "text-object overlap",
                    "text/object overlap",
                    "overlap with active object",
                    "theme conflict",
                    "english explanatory text",
                    "self.play(move_pointer",
                    "textemplatelibrary.ctex",
                    "遮挡",
                    "重叠",
                    "英文讲解",
                    "英文说明",
                    "主题失配",
                    "无法执行",
                    "会变成 self.play(none)",
                )
            ):
                return item
        return None

    def _connection_error_detail(
        self,
        exc: httpx.HTTPError,
        *,
        endpoint: str,
        protocol_hint: str | None = None,
    ) -> str:
        detail = f"Provider 连接失败：{exc.__class__.__name__}。"
        if str(exc).strip():
            detail = f"{detail} {str(exc).strip()}"
        detail = f"{detail} 请求地址：{endpoint}。"
        if protocol_hint:
            detail = f"{detail} {protocol_hint}"
        return detail

    def _headers(self) -> dict[str, str]:
        headers = {
            "Content-Type": "application/json",
            "Accept": "application/json",
        }
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"
        return headers
