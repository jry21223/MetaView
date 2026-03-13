from __future__ import annotations

import json
from dataclasses import dataclass, field

import httpx

from app.schemas import AgentTrace, ProviderDescriptor, ProviderKind, ProviderName
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
            base_url=self.base_url,
        )

    def plan(self, prompt: str, domain: str) -> tuple[PlanningHints, AgentTrace]:
        payload = self._chat(
            system_prompt=(
                "You are a planner for an educational visualization platform. "
                "Return strict JSON with keys: focus, concepts, warnings."
            ),
            user_prompt=f"domain={domain}\nprompt={prompt}",
        )
        hints = PlanningHints(
            focus=str(payload.get("focus", "聚焦核心概念与步骤展开")),
            concepts=[str(item) for item in payload.get("concepts", [])][:6],
            warnings=[str(item) for item in payload.get("warnings", [])][:4],
        )
        trace = AgentTrace(
            agent="planner",
            provider=self.descriptor.name,
            model=self.descriptor.model,
            summary=f"远程 provider 已规划焦点：{hints.focus}",
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

    def _chat(self, system_prompt: str, user_prompt: str) -> dict:
        response = httpx.post(
            f"{self.base_url.rstrip('/')}/chat/completions",
            headers=self._headers(),
            json={
                "model": self.model,
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
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

        if not isinstance(content, str):
            raise ProviderInvocationError("Provider content 不是字符串。")

        return _extract_json_object(content)

    def _headers(self) -> dict[str, str]:
        headers = {"Content-Type": "application/json"}
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"
        return headers
