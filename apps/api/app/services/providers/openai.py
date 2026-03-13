from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Any

import httpx

from app.schemas import AgentTrace, ProviderDescriptor, ProviderKind, ProviderName, TopicDomain
from app.services.domain_router import infer_domain
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


@dataclass
class OpenAICompatibleProvider:
    api_key: str
    model: str
    base_url: str = "https://api.openai.com/v1"
    timeout_s: float = 20.0
    provider_id: str = ProviderName.OPENAI.value
    label: str = "OpenAI Compatible"
    description: str = "OpenAI 兼容 Provider，使用远程模型生成规划、编码和批评提示。"
    is_custom: bool = False
    supports_vision: bool = False
    temperature: float = 0.2
    descriptor: ProviderDescriptor = field(init=False)

    def __post_init__(self) -> None:
        self.descriptor = ProviderDescriptor(
            name=self.provider_id,
            label=self.label,
            kind=ProviderKind.OPENAI_COMPATIBLE,
            model=self.model,
            description=self.description,
            configured=True,
            is_custom=self.is_custom,
            supports_vision=self.supports_vision,
            base_url=self.base_url,
        )

    def route(
        self,
        prompt: str,
        source_image: str | None = None,
    ) -> tuple[TopicDomain, AgentTrace]:
        payload = self._chat(
            system_prompt=(
                "You are a domain router for an educational visualization platform. "
                "Return strict JSON with keys: domain and reason. "
                "Allowed domains: algorithm, math, physics, chemistry, biology, geography."
            ),
            user_prompt=f"prompt={prompt}",
            source_image=source_image if self.supports_vision else None,
        )
        domain_value = str(payload.get("domain", "")).strip().lower()
        try:
            domain = TopicDomain(domain_value)
        except ValueError:
            domain = infer_domain(prompt, source_image if self.supports_vision else None)

        reason = str(payload.get("reason", "")).strip() or f"自动路由到 {domain.value}"
        trace = AgentTrace(
            agent="router",
            provider=self.descriptor.name,
            model=self.descriptor.model,
            summary=reason,
        )
        return domain, trace

    def plan(
        self,
        prompt: str,
        domain: str,
        skill_brief: str,
        source_image: str | None = None,
    ) -> tuple[PlanningHints, AgentTrace]:
        payload = self._chat(
            system_prompt=(
                "You are a planner for an educational visualization platform. "
                "Return strict JSON with keys: focus, concepts, warnings. "
                "If an image is provided, extract physical objects, constraints, "
                "and givens before planning."
            ),
            user_prompt=f"domain={domain}\nprompt={prompt}\n{skill_brief}",
            source_image=source_image if self.supports_vision else None,
        )
        hints = PlanningHints(
            focus=str(payload.get("focus", "聚焦核心概念与步骤展开")),
            concepts=[str(item) for item in payload.get("concepts", [])][:6],
            warnings=[str(item) for item in payload.get("warnings", [])][:4],
        )
        if source_image and not self.supports_vision:
            hints.warnings.append(
                "当前 provider 未声明视觉能力，题图未发送到远程模型，仅按文本继续规划。"
            )
        trace = AgentTrace(
            agent="planner",
            provider=self.descriptor.name,
            model=self.descriptor.model,
            summary=f"远程 provider 已规划焦点：{hints.focus}。",
        )
        return hints, trace

    def code(self, title: str, step_count: int) -> tuple[CodingHints, AgentTrace]:
        payload = self._chat(
            system_prompt=(
                "You are a renderer planning assistant. "
                "Return strict JSON with keys: target, style_notes."
            ),
            user_prompt=f"title={title}\nstep_count={step_count}",
        )
        hints = CodingHints(
            target=str(payload.get("target", "web-preview-js")),
            style_notes=[str(item) for item in payload.get("style_notes", [])][:6],
        )
        trace = AgentTrace(
            agent="coder",
            provider=self.descriptor.name,
            model=self.descriptor.model,
            summary=f"远程 provider 已生成 {step_count} 步渲染策略。",
        )
        return hints, trace

    def critique(self, title: str, renderer_script: str) -> tuple[CritiqueHints, AgentTrace]:
        payload = self._chat(
            system_prompt=(
                "You are a rendering critic. "
                "Return strict JSON with keys: checks, warnings."
            ),
            user_prompt=f"title={title}\nrenderer_script={renderer_script[:1800]}",
        )
        hints = CritiqueHints(
            checks=[str(item) for item in payload.get("checks", [])][:6],
            warnings=[str(item) for item in payload.get("warnings", [])][:6],
        )
        trace = AgentTrace(
            agent="critic",
            provider=self.descriptor.name,
            model=self.descriptor.model,
            summary=f"远程 provider 已完成《{title}》的脚本审查。",
        )
        return hints, trace

    def _chat(
        self,
        system_prompt: str,
        user_prompt: str,
        source_image: str | None = None,
    ) -> dict:
        user_content: str | list[dict[str, Any]]
        if source_image:
            user_content = [
                {"type": "text", "text": user_prompt},
                {"type": "image_url", "image_url": {"url": source_image}},
            ]
        else:
            user_content = user_prompt

        response = httpx.post(
            f"{self.base_url.rstrip('/')}/chat/completions",
            headers=self._headers(),
            json={
                "model": self.model,
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_content},
                ],
                "temperature": self.temperature,
            },
            timeout=self.timeout_s,
        )
        response.raise_for_status()
        payload = response.json()

        try:
            content = payload["choices"][0]["message"]["content"]
        except (KeyError, IndexError, TypeError) as exc:
            raise ProviderInvocationError("Provider 响应缺少 choices.message.content。") from exc

        if isinstance(content, list):
            text_chunks = [
                item.get("text", "")
                for item in content
                if isinstance(item, dict) and item.get("type") == "text"
            ]
            content = "\n".join(chunk for chunk in text_chunks if chunk)

        if not isinstance(content, str):
            raise ProviderInvocationError("Provider content 不是字符串。")

        return _extract_json_object(content)

    def _headers(self) -> dict[str, str]:
        headers = {"Content-Type": "application/json"}
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"
        return headers
