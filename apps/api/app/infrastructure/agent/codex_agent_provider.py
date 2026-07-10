"""OpenAI Codex Python SDK implementation of :class:`IAgentProvider`."""

from __future__ import annotations

import asyncio
import json
import re
from pathlib import Path
from typing import Any

from pydantic import ValidationError

from app.application.agent.types import AgentRequest, AgentResult
from app.application.ports.agent_provider import AgentProviderError
from app.domain.models.playbook import PlaybookScript
from app.domain.services.generated_playbook_normalizer import normalize_generated_playbook

DEFAULT_CODEX_MODEL = "gpt-5.5"
DEFAULT_AGENT_SKILLS_DIR = "skills/metaview-agent"

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
- graph traversal should use graph_scene or algorithm_tree and preserve stable
  node/edge ids plus current, visited, and queue/frontier state.
- recursion should use call_stack_scene with an embedded code_trace when
  line-by-line execution matters; show active frames and returned values, and
  remove returned child frames as the visible stack unwinds.
- projectile explanations should use physics_force_scene with a stable object,
  a curved trajectory, horizontal/vertical velocity arrows, and gravity; for a
  horizontal launch, start with zero vertical velocity and no upward phase.
- Keep JSON values renderer-ready; do not include Markdown fences.
"""


class CodexAgentProvider:
    """Generate a PlaybookScript directly through the Codex Python SDK."""

    def __init__(
        self,
        *,
        cwd: str | Path,
        model: str | None = DEFAULT_CODEX_MODEL,
        effort: str | None = None,
        timeout_s: float = 600.0,
        skills_dir: str | Path = DEFAULT_AGENT_SKILLS_DIR,
        codex_bin: str | Path | None = None,
    ) -> None:
        cwd_path = Path(cwd).resolve()
        self._cwd = str(cwd_path)
        self._model = model
        self._effort = effort
        self._timeout_s = timeout_s
        self._skills_dir = _resolve_under_cwd(cwd_path, skills_dir)
        self._codex_bin = (
            str(_resolve_under_cwd(cwd_path, codex_bin).resolve()) if codex_bin else None
        )

    @property
    def skills_dir(self) -> str:
        return str(self._skills_dir)

    async def generate(
        self,
        prompt: str,
        provider_config: dict[str, Any] | None = None,
        route_decision: dict[str, Any] | None = None,
        *,
        intent_prompt: str | None = None,
    ) -> dict[str, Any]:
        try:
            from openai_codex import AsyncCodex, CodexConfig, Sandbox
        except ImportError as exc:
            raise AgentProviderError(
                "openai-codex SDK is not installed; install the optional Codex SDK "
                "before selecting METAVIEW_AGENT_PROVIDER=codex"
            ) from exc

        model = _coerce_model(provider_config) or self._model
        effort = _coerce_effort(provider_config) or self._effort
        api_key = _coerce_api_key(provider_config)
        schema = PlaybookScript.model_json_schema()
        developer_instructions = _build_developer_instructions(
            route_decision,
            skills_dir=self._skills_dir,
        )

        async def run_codex_lifecycle() -> Any:
            codex_config = CodexConfig(codex_bin=self._codex_bin) if self._codex_bin else None
            async with AsyncCodex(codex_config) as codex:
                if api_key:
                    await codex.login_api_key(api_key)
                thread = await codex.thread_start(
                    cwd=self._cwd,
                    developer_instructions=developer_instructions,
                    ephemeral=True,
                    model=model,
                    sandbox=Sandbox.read_only,
                )
                turn = thread.run(
                    _build_user_prompt(prompt, schema, route_decision=route_decision),
                    cwd=self._cwd,
                    effort=effort,
                    model=model,
                    sandbox=Sandbox.read_only,
                )
                return await turn

        try:
            lifecycle = run_codex_lifecycle()
            result = (
                await asyncio.wait_for(lifecycle, timeout=self._timeout_s)
                if self._timeout_s > 0
                else await lifecycle
            )
        except TimeoutError as exc:
            raise AgentProviderError(
                f"codex SDK generation timed out after {self._timeout_s:.1f}s"
            ) from exc
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
            playbook = PlaybookScript.model_validate(payload)
            requested_scene_types = _requested_scene_types(
                intent_prompt or prompt,
                route_decision,
                playbook,
            )
            return normalize_generated_playbook(
                playbook,
                requested_scene_types=requested_scene_types,
            ).model_dump(mode="json")
        except ValidationError as exc:
            raise AgentProviderError(f"codex SDK playbook failed schema validation: {exc}") from exc

    async def run(self, request: AgentRequest) -> AgentResult:
        prompt = _build_runtime_user_prompt(request)
        playbook = await self.generate(
            prompt,
            provider_config=request.provider_config,
            route_decision=request.route_decision,
            intent_prompt=request.prompt,
        )
        return AgentResult(
            playbook=playbook,
            provider="codex",
            tool_events=[],
            runtime_events=[
                {
                    "event": "codex.tool_execution_unavailable",
                    "detail": {
                        "available_tool_count": len(request.available_tools),
                        "role": "repo-aware fallback/planner/repair provider",
                    },
                }
            ],
            review=None,
            artifacts={},
        )


def _build_user_prompt(
    prompt: str,
    schema: dict[str, Any],
    *,
    route_decision: dict[str, Any] | None = None,
) -> str:
    route_context = ""
    if route_decision:
        route_context = (
            "[MetaView route decision]\n"
            f"{json.dumps(route_decision, ensure_ascii=False, indent=2)}\n\n"
        )
    return (
        f"{route_context}"
        "Create a MetaView educational animation playbook for this prompt:\n"
        f"{prompt}\n\n"
        "Validate against this JSON Schema and return only the JSON object:\n"
        f"{json.dumps(schema, ensure_ascii=False)}"
    )


def _build_runtime_user_prompt(request: AgentRequest) -> str:
    runtime_payload = {
        "run_id": request.run_id,
        "route_decision": request.route_decision,
        "constraints": request.constraints.model_dump(mode="json"),
        "tools": [tool.model_dump(mode="json") for tool in request.available_tools],
        "note": (
            "Codex can inspect these runtime tool manifests, but this provider "
            "cannot execute tools yet. Prefer deterministic tool results when "
            "they are already present in the prompt; do not invent exact "
            "validator or kernel outputs."
        ),
    }
    return (
        "[MetaView runtime tools]\n"
        f"{json.dumps(runtime_payload, ensure_ascii=False, indent=2)}\n\n"
        "[user prompt]\n"
        f"{request.prompt}"
    )


def _requested_scene_types(
    prompt: str,
    route_decision: dict[str, Any] | None,
    playbook: PlaybookScript,
) -> set[str]:
    explicit_values: list[str] = []
    if route_decision:
        for key in ("scene_type", "preferred_scene_type", "algorithm_id", "capability_id"):
            value = route_decision.get(key)
            if isinstance(value, str):
                explicit_values.append(value)
    if playbook.algorithm_id:
        explicit_values.append(playbook.algorithm_id)
    scene_blueprint = playbook.initial_data.get("scene_blueprint")
    if isinstance(scene_blueprint, list):
        explicit_values.extend(item for item in scene_blueprint if isinstance(item, str))

    explicit = {value.strip().casefold() for value in explicit_values}
    prompt_text = prompt.casefold()
    requested: set[str] = set()
    if explicit & {"bfs_graph", "breadth_first_search", "bfs"} or (
        re.search(r"\b(?:bfs|breadth[ -]first)\b", prompt_text)
        or any(alias in prompt_text for alias in ("广度优先", "层序遍历"))
    ):
        requested.add("bfs_graph")
    factorial_match = re.search(r"factorial\s*\(\s*(\d+)\s*\)", prompt_text)
    if explicit & {"recursion_stack", "factorial_recursion"} or (
        any(alias in prompt_text for alias in ("factorial", "阶乘"))
        and any(alias in prompt_text for alias in ("recursion", "recursive", "递归", "调用栈"))
    ):
        requested.add("recursion_stack")
        if factorial_match and 1 <= int(factorial_match.group(1)) <= 8:
            requested.add(f"factorial_recursion:{int(factorial_match.group(1))}")
    if explicit & {"horizontal_projectile", "horizontal_projectile_motion"} or (
        re.search(r"\bhorizontal[ -]projectile(?: motion)?\b", prompt_text)
        or "平抛" in prompt_text
    ):
        requested.update({"horizontal_projectile", "projectile_motion"})
    if explicit & {"projectile_motion", "projectile"} or (
        re.search(r"\bprojectile(?: motion)?\b", prompt_text)
        or any(alias in prompt_text for alias in ("抛体", "平抛", "斜抛"))
    ):
        requested.add("projectile_motion")
    return requested


def _build_developer_instructions(
    route_decision: dict[str, Any] | None,
    *,
    skills_dir: Path,
) -> str:
    skill_sections = _load_skill_sections(route_decision, skills_dir=skills_dir)
    if not skill_sections:
        return _SYSTEM_INSTRUCTIONS
    return "\n\n".join([_SYSTEM_INSTRUCTIONS, *skill_sections])


def _load_skill_sections(
    route_decision: dict[str, Any] | None,
    *,
    skills_dir: Path,
) -> list[str]:
    sections: list[str] = []
    for skill_name in _skill_candidates(route_decision):
        text = _read_skill(skills_dir / skill_name / "SKILL.md")
        if text is not None:
            sections.append(
                f"[MetaView local agent skill: {skill_name}]\n{text}"
            )
    return sections


def _skill_candidates(route_decision: dict[str, Any] | None) -> list[str]:
    candidates = ["generic"]
    if route_decision:
        for key in ("domain", "skill_id"):
            value = route_decision.get(key)
            if isinstance(value, str):
                normalized = _normalize_skill_name(value)
                if normalized and normalized not in candidates:
                    candidates.append(normalized)
    return candidates


def _normalize_skill_name(value: str) -> str | None:
    normalized = value.strip().lower().replace(" ", "_")
    if not normalized:
        return None
    if not all(ch.isalnum() or ch in {"_", "-"} for ch in normalized):
        return None
    return normalized


def _read_skill(path: Path) -> str | None:
    try:
        text = path.read_text(encoding="utf-8").strip()
    except OSError:
        return None
    return text or None


def _resolve_under_cwd(cwd: Path, value: str | Path) -> Path:
    path = Path(value)
    if path.is_absolute():
        return path
    return cwd / path


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
