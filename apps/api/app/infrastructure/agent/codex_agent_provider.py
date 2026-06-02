"""OpenAI Codex Python SDK implementation of :class:`IAgentProvider`."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from pydantic import ValidationError

from app.application.ports.agent_provider import AgentProviderError
from app.domain.models.playbook import PlaybookScript

_SYSTEM_INSTRUCTIONS = """You generate MetaView PlaybookScript JSON.

Return exactly one JSON object that validates against the provided
PlaybookScript schema. Do not edit files. Do not render video. The only valid
rendering path is PlaybookScript consumed by the Remotion Player.

Hard contract:
- Use schema_version "1.0.0".
- Use fps 30 unless the caller asks otherwise.
- total_frames must be >= 1.
- every step must have step_id, end_frame, title, voiceover_text, snapshot.
- every snapshot.kind must match one of the schema discriminator values.
- mirror snapshot as layers[0].body when layers are present.
- math domain should prefer math_plot, math_scene, math_formula, or motion_scene.
- algorithm/code explanations should use algorithm_array, algorithm_bars, or
  algorithm_tree.
- Keep JSON values renderer-ready; do not include Markdown fences.
"""


class CodexAgentProvider:
    """Generate a PlaybookScript directly through the Codex Python SDK."""

    def __init__(
        self,
        *,
        cwd: str | Path,
        model: str | None = None,
        effort: str | None = None,
        timeout_s: float = 600.0,
    ) -> None:
        self._cwd = str(Path(cwd).resolve())
        self._model = model
        self._effort = effort
        self._timeout_s = timeout_s

    async def generate(
        self,
        prompt: str,
        provider_config: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        try:
            from openai_codex import AsyncCodex, Sandbox
        except ImportError as exc:
            raise AgentProviderError(
                "openai-codex SDK is not installed; install apps/api/requirements.txt"
            ) from exc

        model = _coerce_model(provider_config) or self._model
        effort = _coerce_effort(provider_config) or self._effort
        api_key = _coerce_api_key(provider_config)
        schema = PlaybookScript.model_json_schema()

        try:
            async with AsyncCodex() as codex:
                if api_key:
                    await codex.login_api_key(api_key)
                thread = await codex.thread_start(
                    cwd=self._cwd,
                    developer_instructions=_SYSTEM_INSTRUCTIONS,
                    model=model,
                    sandbox=Sandbox.read_only,
                )
                result = await thread.run(
                    _build_user_prompt(prompt, schema),
                    cwd=self._cwd,
                    effort=effort,
                    model=model,
                    output_schema=schema,
                    sandbox=Sandbox.read_only,
                )
        except Exception as exc:
            raise AgentProviderError(f"codex SDK generation failed: {exc}") from exc

        if result.error is not None:
            raise AgentProviderError(f"codex SDK turn failed: {result.error}")
        if not result.final_response:
            raise AgentProviderError("codex SDK turn completed without a final response")

        try:
            payload = json.loads(_strip_markdown_fences(result.final_response))
        except json.JSONDecodeError as exc:
            raise AgentProviderError(f"codex SDK produced invalid JSON: {exc}") from exc
        if not isinstance(payload, dict):
            raise AgentProviderError(
                f"codex SDK response must be a JSON object, got {type(payload)}"
            )

        try:
            return PlaybookScript.model_validate(payload).model_dump(mode="json")
        except ValidationError as exc:
            raise AgentProviderError(f"codex SDK playbook failed schema validation: {exc}") from exc


def _build_user_prompt(prompt: str, schema: dict[str, Any]) -> str:
    return (
        "Create a MetaView educational animation playbook for this prompt:\n"
        f"{prompt}\n\n"
        "Validate against this JSON Schema and return only the JSON object:\n"
        f"{json.dumps(schema, ensure_ascii=False)}"
    )


def _coerce_api_key(provider_config: dict[str, Any] | None) -> str | None:
    if not provider_config:
        return None
    value = provider_config.get("api_key")
    if isinstance(value, str) and value.strip():
        return value.strip()
    return None


def _coerce_model(provider_config: dict[str, Any] | None) -> str | None:
    if not provider_config:
        return None
    value = provider_config.get("model")
    if isinstance(value, str) and value.strip():
        return value.strip()
    return None


def _coerce_effort(provider_config: dict[str, Any] | None) -> str | None:
    if not provider_config:
        return None
    value = provider_config.get("effort")
    if isinstance(value, str) and value.strip():
        normalized = value.strip().lower()
        if normalized in {"minimal", "low", "medium", "high", "xhigh"}:
            return normalized
    return None


def _strip_markdown_fences(raw: str) -> str:
    text = raw.strip()
    if not text.startswith("```"):
        return text
    lines = text.splitlines()
    if lines and lines[0].startswith("```"):
        lines = lines[1:]
    if lines and lines[-1].strip() == "```":
        lines = lines[:-1]
    return "\n".join(lines).strip()
