from __future__ import annotations

import json
from typing import Any

import pytest
from pydantic import BaseModel

from app.application.agent.runtime_tool_hub import RuntimeToolHub
from app.domain.models.playbook import PlaybookScript
from app.domain.skills.base import (
    SkillCapability,
    SkillExecutionContext,
    SkillExecutionResult,
    SkillManifest,
    SkillRouteInput,
    SkillRouteMatch,
)
from app.domain.skills.registry import SkillRegistry


class FakeSpec(BaseModel):
    text: str


class FakeSkillPack:
    manifest = SkillManifest(
        skill_id="fake_skill",
        domain="math",
        name="Fake Skill",
        description="Test skill",
        execution_mode="deterministic",
        capabilities=[
            SkillCapability(
                capability_id="fake.echo",
                description="Echo test",
                examples=["fake skill test"],
            )
        ],
    )

    def heuristic_match(self, request: SkillRouteInput) -> SkillRouteMatch | None:
        if "fake skill test" not in request.prompt:
            return None
        return SkillRouteMatch(
            skill_id="fake_skill",
            domain="math",
            confidence=0.99,
            capability_id="fake.echo",
            problem_spec={"text": request.prompt},
        )

    def validate_problem_spec(self, data: dict[str, Any]) -> FakeSpec | None:
        return FakeSpec.model_validate(data)

    async def execute(
        self,
        context: SkillExecutionContext,
        problem_spec: BaseModel | None,
    ) -> SkillExecutionResult:
        assert isinstance(problem_spec, FakeSpec)
        return SkillExecutionResult(
            handled=True,
            playbook_json=_fake_playbook_json(problem_spec.text),
            review_actions=["skill:fake_skill"],
        )


def _fake_playbook_json(text: str = "fake skill test") -> str:
    playbook = PlaybookScript.model_validate({
        "fps": 30,
        "total_frames": 60,
        "domain": "math",
        "title": "Fake Skill",
        "summary": text,
        "steps": [
            {
                "step_id": "fake_01",
                "end_frame": 60,
                "title": "Echo",
                "voiceover_text": "Echo the fake skill input.",
                "tokens": [],
                "snapshot": {
                    "kind": "math_formula",
                    "formula_latex": "x=x",
                    "caption": text,
                },
                "layers": [
                    {
                        "body": {
                            "kind": "math_formula",
                            "formula_latex": "x=x",
                            "caption": text,
                        }
                    }
                ],
            }
        ],
        "parameter_controls": [],
    })
    return playbook.model_dump_json()


def test_runtime_tool_hub_lists_core_animation_geometry_and_skill_tools() -> None:
    hub = RuntimeToolHub(skill_registry=SkillRegistry([FakeSkillPack()]))

    names = {tool.name for tool in hub.list_tools()}

    assert "skill.registry.list" in names
    assert "skill.fake_skill.solve" in names
    assert "playbook.schema.validate" in names
    assert "playbook.self_check" in names
    assert "animation_tool.list" in names
    assert "animation_tool.expand" in names
    assert "geometry.assert_monotonic" in names


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("tool", "args"),
    [
        (
            "geometry.assert_orientation",
            {"expression_x": "cos(t)", "expression_y": "sin(t)", "t_min": 0},
        ),
        (
            "geometry.assert_passes_through",
            {
                "expression_x": "cos(t)",
                "expression_y": "sin(t)",
                "t_min": 0,
                "t_max": 1,
                "target_x": 1,
            },
        ),
        (
            "geometry.assert_monotonic",
            {"expression": "x", "x_min": 0},
        ),
    ],
)
async def test_runtime_tool_hub_geometry_missing_args_return_structured_error(
    tool: str,
    args: dict[str, Any],
) -> None:
    hub = RuntimeToolHub(skill_registry=SkillRegistry([]))

    result = await hub.execute_tool(tool, args)

    assert result.ok is False
    assert result.error is not None
    assert result.error["code"] == "runtime_tool.invalid_args"
    assert result.error["errors"]


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("tool", "args"),
    [
        (
            "geometry.assert_orientation",
            {
                "expression_x": 123,
                "expression_y": "sin(t)",
                "t_min": 0,
                "t_max": 1,
            },
        ),
        (
            "geometry.assert_passes_through",
            {
                "expression_x": "cos(t)",
                "expression_y": "sin(t)",
                "t_min": 0,
                "t_max": 1,
                "target_x": "left",
                "target_y": 0,
            },
        ),
        (
            "geometry.assert_monotonic",
            {"expression": ["x"], "x_min": 0, "x_max": 1},
        ),
    ],
)
async def test_runtime_tool_hub_geometry_bad_arg_types_return_structured_error(
    tool: str,
    args: dict[str, Any],
) -> None:
    hub = RuntimeToolHub(skill_registry=SkillRegistry([]))

    result = await hub.execute_tool(tool, args)

    assert result.ok is False
    assert result.error is not None
    assert result.error["code"] == "runtime_tool.invalid_args"
    assert result.error["errors"]


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("tool", "args", "expected_key"),
    [
        (
            "geometry.assert_orientation",
            {
                "expression_x": "cos(t)",
                "expression_y": "sin(t)",
                "t_min": 0,
                "t_max": 6.283185307179586,
            },
            "direction",
        ),
        (
            "geometry.assert_passes_through",
            {
                "expression_x": "cos(t)",
                "expression_y": "sin(t)",
                "t_min": 0,
                "t_max": 0.5,
                "target_x": 1,
                "target_y": 0,
                "tol": 0.05,
            },
            "passes",
        ),
        (
            "geometry.assert_monotonic",
            {"expression": "x", "x_min": 0, "x_max": 1},
            "verdict",
        ),
    ],
)
async def test_runtime_tool_hub_geometry_tools_accept_valid_args(
    tool: str,
    args: dict[str, Any],
    expected_key: str,
) -> None:
    hub = RuntimeToolHub(skill_registry=SkillRegistry([]))

    result = await hub.execute_tool(tool, args)

    assert result.ok is True
    assert result.error is None
    assert result.result is not None
    assert expected_key in result.result


@pytest.mark.asyncio
async def test_runtime_tool_hub_unknown_tool_returns_structured_error() -> None:
    hub = RuntimeToolHub(skill_registry=SkillRegistry([]))

    result = await hub.execute_tool("tool.nope", {})

    assert result.ok is False
    assert result.error is not None
    assert result.error["code"] == "runtime_tool.unknown_tool"
    assert "tool.nope" in result.error["message"]


@pytest.mark.asyncio
async def test_runtime_tool_hub_validates_playbook_schema() -> None:
    hub = RuntimeToolHub(skill_registry=SkillRegistry([]))
    playbook = json.loads(_fake_playbook_json())

    result = await hub.execute_tool("playbook.schema.validate", {"playbook": playbook})

    assert result.ok is True
    assert result.result is not None
    assert result.result["valid"] is True
    assert result.result["playbook"]["title"] == "Fake Skill"


@pytest.mark.asyncio
async def test_runtime_tool_hub_runs_self_check() -> None:
    hub = RuntimeToolHub(skill_registry=SkillRegistry([]))
    playbook = json.loads(_fake_playbook_json())

    result = await hub.execute_tool(
        "playbook.self_check",
        {"playbook": playbook, "prompt": "fake skill test"},
    )

    assert result.ok is True
    assert result.result is not None
    assert result.result["status"] == "blocked"
    assert result.result["issues"][0]["code"] == "step.too_shallow"


@pytest.mark.asyncio
async def test_runtime_tool_hub_executes_skill_pack_tool() -> None:
    hub = RuntimeToolHub(skill_registry=SkillRegistry([FakeSkillPack()]))

    result = await hub.execute_tool(
        "skill.fake_skill.solve",
        {
            "run_id": "run-tool",
            "prompt": "fake skill test",
            "problem_spec": {"text": "fake skill test"},
        },
    )

    assert result.ok is True
    assert result.result is not None
    assert result.result["handled"] is True
    assert result.result["playbook"]["title"] == "Fake Skill"
    assert result.result["review_actions"] == ["skill:fake_skill"]
