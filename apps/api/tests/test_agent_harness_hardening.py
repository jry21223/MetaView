from __future__ import annotations

import pytest

from app.application.agent.runtime_tool_hub import RuntimeToolHub
from app.domain.models.playbook import (
    Layer,
    MathFormulaSnapshot,
    MathScenePoint,
    MathSceneSnapshot,
    MetaStep,
    PlaybookScript,
)
from app.domain.models.topic import TopicDomain
from app.domain.services.director_builder import build_default_director
from app.domain.services.scene_sequence_blueprint import compile_scene_sequence_blueprint
from app.domain.services.visual_progression_quality import validate_visual_progression


def _step(index: int, snapshot, narration: str, *, hint: str | None = None) -> MetaStep:
    return MetaStep(
        step_id=f"step_{index:02d}",
        end_frame=index * 180,
        title=f"Step {index}",
        voiceover_text=narration,
        animation_hint=hint,
        snapshot=snapshot,
        layers=[Layer(body=snapshot)],
        tokens=[],
    )


def _playbook(steps: list[MetaStep]) -> PlaybookScript:
    return PlaybookScript(
        fps=30,
        total_frames=steps[-1].end_frame,
        domain=TopicDomain.MATH,
        title="Harness test",
        summary="Harness test",
        steps=steps,
        parameter_controls=[],
    )


@pytest.mark.asyncio
async def test_runtime_tool_allowlist_is_enforced_but_internal_validation_remains_available() -> None:
    hub = RuntimeToolHub()
    denied = await hub.execute_tool(
        "scene_blueprint.compile",
        {"blueprint": {}},
        allowed_names={"geometry.assert_monotonic"},
    )
    assert denied.ok is False
    assert denied.error is not None
    assert denied.error["code"] == "runtime_tool.capability_denied"

    internal = await hub.execute_tool(
        "playbook.schema.validate",
        {"playbook": {}},
        allowed_names={"geometry.assert_monotonic"},
    )
    assert internal.ok is False
    assert internal.error is not None
    assert internal.error["code"] == "playbook.schema.invalid"


def test_scene_sequence_blueprint_compiles_distinct_derivative_checkpoints() -> None:
    compiled = compile_scene_sequence_blueprint(
        {
            "subject": "math",
            "sceneType": "derivative_tangent",
            "title": "导数与切线",
            "visualIntent": ["curve", "target_point", "tangent"],
            "initialState": {
                "curves": [
                    {
                        "expression": "x^2",
                        "label": "f(x)",
                        "semanticRole": "curve",
                    }
                ],
                "xMin": -3,
                "xMax": 3,
                "formulaLatex": "f(x)=x^2",
            },
            "checkpoints": [
                {
                    "id": "curve",
                    "narrationGoal": "先建立函数曲线。",
                    "stateDelta": {"markerX": 0},
                    "transition": "reveal",
                },
                {
                    "id": "move-point",
                    "narrationGoal": "把观察点移动到 x=1。",
                    "stateDelta": {"markerX": 1},
                    "transition": "focus",
                    "assertions": ["distinct_from_previous"],
                },
            ],
        }
    )
    assert len(compiled.playbook.steps) == 2
    assert compiled.checkpoint_snapshots[0] != compiled.checkpoint_snapshots[1]
    assert compiled.source_map["checkpoints.1"]["step_id"].endswith("move-point")


def test_scene_sequence_blueprint_compiles_recursive_stack_state_changes() -> None:
    source = [
        "def factorial(n):",
        "    if n == 1:",
        "        return 1",
        "    return n * factorial(n - 1)",
    ]
    compiled = compile_scene_sequence_blueprint(
        {
            "subject": "algorithm",
            "sceneType": "recursion_stack",
            "title": "factorial 调用栈",
            "visualIntent": ["stack_frame", "active_frame", "code_line"],
            "initialState": {
                "codeTrace": {
                    "language": "python",
                    "lines": source,
                    "activeLines": [3],
                    "activeLine": 3,
                }
            },
            "checkpoints": [
                {
                    "id": "push-4",
                    "narrationGoal": "factorial(4) 首先进入调用栈。",
                    "stateDelta": {
                        "stackFrames": [
                            {
                                "id": "factorial-4",
                                "label": "factorial(4)",
                                "depth": 0,
                                "state": "active",
                                "variables": {"n": 4},
                            }
                        ],
                        "currentFrameId": "factorial-4",
                    },
                },
                {
                    "id": "push-3",
                    "narrationGoal": "递归调用把 factorial(3) 压到栈顶。",
                    "stateDelta": {
                        "stackFrames": [
                            {
                                "id": "factorial-4",
                                "label": "factorial(4)",
                                "depth": 0,
                                "state": "waiting",
                                "variables": {"n": 4},
                            },
                            {
                                "id": "factorial-3",
                                "label": "factorial(3)",
                                "depth": 1,
                                "state": "active",
                                "variables": {"n": 3},
                            },
                        ],
                        "currentFrameId": "factorial-3",
                    },
                    "assertions": ["has_visible_change"],
                },
            ],
        }
    )
    first = compiled.playbook.steps[0].snapshot
    second = compiled.playbook.steps[1].snapshot
    assert first.kind == second.kind == "call_stack_scene"
    assert len(first.frames) == 1
    assert len(second.frames) == 2
    assert second.current_frame_id == "factorial-3"
    assert compiled.playbook.steps[1].code_highlight is not None


def test_scene_sequence_blueprint_compiles_projectile_state_changes() -> None:
    compiled = compile_scene_sequence_blueprint(
        {
            "subject": "physics",
            "sceneType": "projectile_motion",
            "title": "平抛运动",
            "visualIntent": ["trajectory", "horizontal_velocity", "gravity"],
            "initialState": {
                "object": {
                    "id": "body",
                    "semanticRole": "projectile",
                    "x": 10,
                    "y": 10,
                },
                "vectors": [
                    {
                        "id": "vx",
                        "target": "body",
                        "semanticRole": "velocity",
                        "dx": 15,
                        "dy": 0,
                        "label": "v_x",
                    },
                    {
                        "id": "g",
                        "target": "body",
                        "semanticRole": "acceleration",
                        "dx": 0,
                        "dy": 12,
                        "label": "g",
                    },
                ],
            },
            "checkpoints": [
                {
                    "id": "launch",
                    "narrationGoal": "物体从初始位置水平飞出。",
                    "stateDelta": {"trajectory": [[10, 10]]},
                },
                {
                    "id": "fall",
                    "narrationGoal": "水平前进的同时，竖直位移加快。",
                    "stateDelta": {
                        "object": {
                            "id": "body",
                            "semanticRole": "projectile",
                            "x": 35,
                            "y": 28,
                        },
                        "trajectory": [[10, 10], [22, 16], [35, 28]],
                    },
                    "assertions": ["distinct_from_previous"],
                },
            ],
        }
    )
    first = compiled.playbook.steps[0].snapshot
    second = compiled.playbook.steps[1].snapshot
    assert first.kind == second.kind == "physics_force_scene"
    assert first.objects[0].x == 10
    assert second.objects[0].x == 35
    assert len(second.trajectory) > len(first.trajectory)


def test_visual_progression_gate_blocks_repeated_narrated_frames() -> None:
    snapshot = MathFormulaSnapshot(formula_latex="x^2")
    report = validate_visual_progression(
        _playbook(
            [
                _step(1, snapshot, "第一种解释。"),
                _step(2, snapshot.model_copy(deep=True), "第二种解释。", hint="reveal"),
                _step(3, snapshot.model_copy(deep=True), "第三种解释。", hint="focus"),
                _step(4, snapshot.model_copy(deep=True), "第四种解释。"),
            ]
        )
    )
    assert report.status == "blocked"
    assert any(issue.code == "scene.progression_missing" for issue in report.issues)
    assert report.metrics["distinct_snapshot_count"] == 1


def test_director_focus_resolves_to_new_visible_semantic_object() -> None:
    first = MathSceneSnapshot(
        points=[MathScenePoint(x=0, y=0, label="origin", semantic_role="reference")]
    )
    second = MathSceneSnapshot(
        points=[
            MathScenePoint(x=0, y=0, label="origin", semantic_role="reference"),
            MathScenePoint(x=1, y=1, label="target", emphasis="accent", semantic_role="target"),
        ]
    )
    director = build_default_director(
        _playbook(
            [
                _step(1, first, "先显示参考点。"),
                _step(2, second, "再加入目标点。", hint="focus"),
            ]
        ),
        "run-director-semantic-delta",
    )
    assert director.beats[1].focus_target in {"target", "reference"}
    assert director.beats[1].camera_motion == "push_in"
