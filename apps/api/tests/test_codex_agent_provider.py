from __future__ import annotations

import asyncio
import json
import sys
import types
from pathlib import Path
from types import SimpleNamespace
from typing import Any

import pytest

from app.application.agent.types import AgentConstraints, AgentRequest, ToolManifest
from app.application.ports.agent_provider import AgentProviderError
from app.domain.models.coverage import CoverageDecision
from app.domain.models.lesson_plan import LessonPlan, SceneIntent
from app.domain.models.playbook import PlaybookScript
from app.infrastructure.agent.codex_agent_provider import (
    CodexAgentProvider,
    _requested_scene_types,
)

_PLAYBOOK_JSON = """{
  "schema_version": "1.0.0",
  "fps": 30,
  "total_frames": 60,
  "domain": "math",
  "title": "Line",
  "summary": "Show a line.",
  "steps": [
    {
      "step_id": "step_01",
      "end_frame": 60,
      "title": "Plot",
      "voiceover_text": "Draw y=x.",
      "snapshot": {
        "kind": "math_plot",
        "curves": [{"expression": "x", "label": "y=x", "emphasis": "primary"}],
        "x_min": -5,
        "x_max": 5
      },
      "layers": [
        {
          "body": {
            "kind": "math_plot",
            "curves": [{"expression": "x", "label": "y=x", "emphasis": "primary"}],
            "x_min": -5,
            "x_max": 5
          }
        }
      ]
    }
  ],
  "parameter_controls": []
}"""


def _lesson_plan() -> LessonPlan:
    return LessonPlan(
        schema_version="1.0.0",
        domain="math",
        title="LESSON_PLAN_ONLY_MARKER",
        learning_objectives=["Connect a line equation to its graph."],
        prerequisites=["Know the coordinate plane."],
        misconceptions=["A line equation describes only one point."],
        expected_conclusion="The graph of y=x is a straight line through the origin.",
        lesson_arc="intuition_to_abstraction",
        scenes=[
            SceneIntent(
                scene_id="line_graph",
                teaching_goal="Relate equal x and y values to the diagonal line.",
                strategy="demonstration",
                required_fact_ids=["line_identity"],
                required_visual_roles=["axis", "line"],
                preferred_scene_type="line_graph",
                narration_goal="Explain why every point on the line has x equal to y.",
            )
        ],
    )


class _FakeThread:
    def __init__(self, response: str) -> None:
        self.response = response
        self.run_calls: list[dict[str, Any]] = []

    async def run(self, input_text: str, **kwargs: Any) -> Any:
        self.run_calls.append({"input": input_text, **kwargs})
        return SimpleNamespace(error=None, final_response=self.response)


class _FakeCodex:
    instances: list["_FakeCodex"] = []
    response = _PLAYBOOK_JSON

    def __init__(self, config: Any = None) -> None:
        self.config = config
        self.login_keys: list[str] = []
        self.thread_start_calls: list[dict[str, Any]] = []
        self.thread = _FakeThread(self.response)
        self.instances.append(self)

    async def __aenter__(self) -> "_FakeCodex":
        return self

    async def __aexit__(self, *args: Any) -> None:
        return None

    async def login_api_key(self, api_key: str) -> None:
        self.login_keys.append(api_key)

    async def thread_start(self, **kwargs: Any) -> _FakeThread:
        self.thread_start_calls.append(kwargs)
        return self.thread


@pytest.fixture(autouse=True)
def _fake_openai_codex(monkeypatch: pytest.MonkeyPatch):
    _FakeCodex.instances = []
    _FakeCodex.response = _PLAYBOOK_JSON
    fake_module = types.SimpleNamespace(
        AsyncCodex=_FakeCodex,
        CodexConfig=lambda **kwargs: SimpleNamespace(**kwargs),
        Sandbox=types.SimpleNamespace(read_only="read_only"),
    )
    monkeypatch.setitem(sys.modules, "openai_codex", fake_module)
    yield


@pytest.mark.asyncio
async def test_codex_provider_returns_validated_playbook_dict() -> None:
    provider = CodexAgentProvider(cwd=".", model="gpt-5.5", effort="high")

    out = await provider.generate("explain y=x")

    assert out["title"] == "Line"
    assert out["steps"][0]["snapshot"]["kind"] == "math_plot"
    fake = _FakeCodex.instances[0]
    assert fake.thread_start_calls[0]["model"] == "gpt-5.5"
    assert fake.thread_start_calls[0]["ephemeral"] is True
    assert fake.thread.run_calls[0]["effort"] == "high"
    assert "JSON Schema" in fake.thread.run_calls[0]["input"]
    assert "output_schema" not in fake.thread.run_calls[0]


@pytest.mark.parametrize(
    "prompt",
    ["演示平抛运动的速度分解", "Explain horizontal projectile motion"],
)
def test_codex_provider_marks_horizontal_projectile_intent(prompt: str) -> None:
    playbook = PlaybookScript.model_validate_json(_PLAYBOOK_JSON)

    assert _requested_scene_types(prompt, None, playbook) == {
        "horizontal_projectile",
        "projectile_motion",
    }


def test_codex_provider_marks_bounded_factorial_recursion_intent() -> None:
    playbook = PlaybookScript.model_validate_json(_PLAYBOOK_JSON)

    assert _requested_scene_types(
        "逐行追踪 factorial(4) 的递归调用栈",
        None,
        playbook,
    ) == {"recursion_stack", "factorial_recursion:4"}


@pytest.mark.asyncio
async def test_codex_provider_uses_explicit_cli_and_timeout() -> None:
    provider = CodexAgentProvider(
        cwd=".",
        model="gpt-5.6-terra",
        effort="high",
        timeout_s=3,
        codex_bin="/tmp/codex",
    )

    await provider.generate("explain y=x")

    fake = _FakeCodex.instances[0]
    assert Path(fake.config.codex_bin) == Path("/tmp/codex").resolve()


@pytest.mark.asyncio
async def test_codex_provider_turn_timeout_fails_closed(monkeypatch: pytest.MonkeyPatch) -> None:
    async def never_finishes(self: _FakeThread, input_text: str, **kwargs: Any) -> Any:
        await asyncio.sleep(1)
        return SimpleNamespace(error=None, final_response=self.response)

    monkeypatch.setattr(_FakeThread, "run", never_finishes)
    provider = CodexAgentProvider(cwd=".", timeout_s=0.001)

    with pytest.raises(AgentProviderError, match="timed out"):
        await provider.generate("explain y=x")


@pytest.mark.asyncio
@pytest.mark.parametrize("stage", ["enter", "login", "thread_start", "exit"])
async def test_codex_provider_timeout_covers_full_sdk_lifecycle(
    monkeypatch: pytest.MonkeyPatch,
    stage: str,
) -> None:
    async def slow_enter(self: _FakeCodex) -> _FakeCodex:
        await asyncio.sleep(1)
        return self

    async def slow_login(self: _FakeCodex, api_key: str) -> None:
        await asyncio.sleep(1)

    async def slow_thread_start(self: _FakeCodex, **kwargs: Any) -> _FakeThread:
        await asyncio.sleep(1)
        return self.thread

    async def slow_exit(self: _FakeCodex, *args: Any) -> None:
        await asyncio.sleep(1)

    monkeypatch.setattr(
        _FakeCodex,
        {
            "enter": "__aenter__",
            "login": "login_api_key",
            "thread_start": "thread_start",
            "exit": "__aexit__",
        }[stage],
        {
            "enter": slow_enter,
            "login": slow_login,
            "thread_start": slow_thread_start,
            "exit": slow_exit,
        }[stage],
    )
    provider = CodexAgentProvider(cwd=".", timeout_s=0.001)

    with pytest.raises(AgentProviderError, match="timed out"):
        await provider.generate(
            "explain y=x",
            provider_config={"api_key": "sk-test"} if stage == "login" else None,
        )


@pytest.mark.asyncio
async def test_codex_provider_run_includes_tool_manifests_and_returns_agent_result() -> None:
    provider = CodexAgentProvider(cwd=".", model="gpt-5.5", effort="high")

    result = await provider.run(
        AgentRequest(
            run_id="run-codex",
            prompt="explain y=x",
            source_code=None,
            language=None,
            route_decision={"destination": "generic_cir"},
            coverage_decision=CoverageDecision(
                mode="experimental",
                domain="math",
                confidence=0.6,
                matched_skill_ids=[],
                available_tool_ids=["playbook.schema.validate"],
                missing_capabilities=["validator:line_graph"],
                fallback_policy="limited_visual",
                reason="Only a limited visual path is available.",
            ),
            lesson_plan=_lesson_plan(),
            provider_config=None,
            playbook_schema={"type": "object"},
            constraints=AgentConstraints(max_self_repair_attempts=2),
            available_tools=[
                ToolManifest(
                    name="playbook.schema.validate",
                    description="Validate PlaybookScript.",
                    args_schema={"type": "object"},
                    domain="playbook",
                    deterministic=True,
                )
            ],
        )
    )

    fake = _FakeCodex.instances[0]
    prompt = fake.thread.run_calls[0]["input"]
    assert "[MetaView runtime tools]" in prompt
    assert "playbook.schema.validate" in prompt
    assert '"lesson_plan"' in prompt
    assert '"coverage_decision"' in prompt
    assert "validator:line_graph" in prompt
    assert "coverage_decision is binding" in prompt
    assert "lesson_plan is binding" in prompt
    assert "LESSON_PLAN_ONLY_MARKER" in prompt
    instructions = fake.thread_start_calls[0]["developer_instructions"]
    assert "binding" in instructions
    assert "Preserve SceneIntent order" in instructions
    assert result.provider == "codex"
    assert result.playbook["title"] == "Line"
    assert "LESSON_PLAN_ONLY_MARKER" not in json.dumps(result.playbook)
    assert result.runtime_events[0]["event"] == "codex.tool_execution_unavailable"


@pytest.mark.asyncio
async def test_codex_provider_defaults_to_gpt_55() -> None:
    provider = CodexAgentProvider(cwd=".")

    await provider.generate("explain y=x")

    fake = _FakeCodex.instances[0]
    assert fake.thread_start_calls[0]["model"] == "gpt-5.5"
    assert fake.thread.run_calls[0]["model"] == "gpt-5.5"


@pytest.mark.asyncio
async def test_codex_provider_loads_domain_skill_into_developer_instructions(
    tmp_path: Path,
) -> None:
    skills_dir = tmp_path / "skills"
    (skills_dir / "generic").mkdir(parents=True)
    (skills_dir / "chemistry").mkdir(parents=True)
    (skills_dir / "generic" / "SKILL.md").write_text(
        "# Generic MetaView Teacher\nUse guided questions.",
        encoding="utf-8",
    )
    (skills_dir / "chemistry" / "SKILL.md").write_text(
        "# Chemistry Runtime Skill\nUse stoichiometry tools instead of mental math.",
        encoding="utf-8",
    )
    provider = CodexAgentProvider(cwd=".", skills_dir=skills_dir)

    await provider.generate(
        "配平 H2 + O2 -> H2O",
        route_decision={"domain": "chemistry", "skill_id": "chemistry_stoichiometry"},
    )

    instructions = _FakeCodex.instances[0].thread_start_calls[0]["developer_instructions"]
    assert "# Generic MetaView Teacher" in instructions
    assert "# Chemistry Runtime Skill" in instructions
    assert "Use stoichiometry tools instead of mental math." in instructions


@pytest.mark.asyncio
async def test_codex_provider_falls_back_to_generic_skill_when_domain_skill_missing(
    tmp_path: Path,
) -> None:
    skills_dir = tmp_path / "skills"
    (skills_dir / "generic").mkdir(parents=True)
    (skills_dir / "generic" / "SKILL.md").write_text(
        "# Generic MetaView Teacher\nGuide before answering.",
        encoding="utf-8",
    )
    provider = CodexAgentProvider(cwd=".", skills_dir=skills_dir)

    await provider.generate("open ended", route_decision={"domain": "astronomy"})

    instructions = _FakeCodex.instances[0].thread_start_calls[0]["developer_instructions"]
    assert "# Generic MetaView Teacher" in instructions
    assert "astronomy" not in instructions


@pytest.mark.asyncio
async def test_codex_provider_forwards_api_key_and_model_override() -> None:
    provider = CodexAgentProvider(cwd=".", model="default-model", effort=None)

    await provider.generate(
        "prompt",
        provider_config={"api_key": "sk-test", "model": "override-model"},
    )

    fake = _FakeCodex.instances[0]
    assert fake.login_keys == ["sk-test"]
    assert fake.thread_start_calls[0]["model"] == "override-model"
    assert fake.thread.run_calls[0]["model"] == "override-model"


@pytest.mark.asyncio
async def test_codex_provider_raises_on_invalid_json() -> None:
    _FakeCodex.response = "not json"
    provider = CodexAgentProvider(cwd=".")

    with pytest.raises(AgentProviderError) as excinfo:
        await provider.generate("prompt")

    assert "invalid JSON" in str(excinfo.value)
