from __future__ import annotations

from app.domain.models.cir import CirDocument, CirStep, LayoutInstruction, VisualToken
from app.domain.models.topic import TopicDomain, VisualKind
from app.domain.services.legacy_cir_lesson_plan_adapter import (
    lesson_plan_from_legacy_cir,
)


def test_legacy_cir_adapter_keeps_teaching_semantics_without_renderer_fields() -> None:
    cir = CirDocument(
        title="Breadth-first traversal",
        domain=TopicDomain.ALGORITHM,
        summary="Use a FIFO queue to visit a graph level by level.",
        steps=[
            CirStep(
                id="introduce",
                title="Start from the root",
                narration="Put {{root}} into the queue.",
                visual_kind=VisualKind.GRAPH,
                layout=LayoutInstruction(x=120, y=80, width=900, height=500),
                tokens=[VisualToken(id="root", label="A")],
                start_time=1.5,
                end_time=4.0,
            ),
            CirStep(
                id="finish",
                title="Traversal complete",
                narration=["The queue is empty.", {"t": "root"}, "was visited."],
                visual_kind=VisualKind.TEXT,
                tokens=[VisualToken(id="root", label="A")],
            ),
        ],
    )

    plan = lesson_plan_from_legacy_cir(cir)
    payload = plan.model_dump(mode="json")

    assert plan.domain == "algorithm"
    assert plan.title == cir.title
    assert plan.learning_objectives == [cir.summary]
    assert plan.prerequisites == []
    assert plan.misconceptions == []
    assert plan.expected_conclusion == "The queue is empty. A was visited."
    assert plan.lesson_arc == "state_transition"
    assert [scene.scene_id for scene in plan.scenes] == ["introduce", "finish"]
    assert plan.scenes[0].strategy == "intuition"
    assert plan.scenes[0].required_visual_roles == ["graph_structure"]
    assert plan.scenes[0].narration_goal == "Put A into the queue."
    assert plan.scenes[1].strategy == "summary"
    assert all(scene.required_fact_ids == [] for scene in plan.scenes)
    assert all(scene.preferred_scene_type is None for scene in plan.scenes)
    assert not {
        "layout",
        "x",
        "y",
        "width",
        "height",
        "start_time",
        "end_time",
        "layers",
        "animation_calls",
        "asset_id",
        "snapshot",
    } & _collect_keys(payload)


def test_legacy_cir_adapter_infers_math_derivation_and_parses_json_narration() -> None:
    cir = CirDocument(
        title="Derivative",
        domain=TopicDomain.MATH,
        summary="Relate a derivative to tangent slope.",
        steps=[
            CirStep(
                id="derive",
                title="Take the limit",
                narration='["Let the secant approach the tangent.", {"t": "slope"}]',
                visual_kind=VisualKind.FORMULA,
                tokens=[VisualToken(id="slope", label="The slope tends to 2.")],
            )
        ],
    )

    plan = lesson_plan_from_legacy_cir(cir)

    assert plan.lesson_arc == "derivation"
    assert plan.scenes[0].strategy == "derivation"
    assert plan.scenes[0].narration_goal == (
        "Let the secant approach the tangent. The slope tends to 2."
    )


def test_legacy_cir_adapter_represents_empty_cir_without_inventing_facts() -> None:
    cir = CirDocument(
        title="Concept review",
        domain=TopicDomain.BIOLOGY,
        summary="Review the concept honestly.",
        steps=[],
    )

    plan = lesson_plan_from_legacy_cir(cir)

    assert plan.expected_conclusion == cir.summary
    assert len(plan.scenes) == 1
    assert plan.scenes[0].scene_id == "legacy_summary"
    assert plan.scenes[0].strategy == "summary"
    assert plan.scenes[0].required_fact_ids == []


def _collect_keys(value) -> set[str]:
    if isinstance(value, dict):
        return set(value) | {
            nested for child in value.values() for nested in _collect_keys(child)
        }
    if isinstance(value, list):
        return {nested for child in value for nested in _collect_keys(child)}
    return set()
