from __future__ import annotations

from app.domain.models.playbook import SolidGeometrySceneSnapshot
from app.domain.skills.solid_geometry.geometry_kernel import solve_solid_geometry
from app.domain.skills.solid_geometry.playbook_adapter import (
    build_solid_geometry_playbook,
    validate_solution_playbook_consistency,
)
from app.domain.skills.solid_geometry.spec_extractor import extract_solid_geometry_spec


def test_solid_geometry_solution_maps_to_consistent_playbook() -> None:
    prompt = "正四棱锥 S-ABCD，底面边长为 2，高为 3，求 SA 与底面 ABCD 所成的角"
    spec = extract_solid_geometry_spec(prompt)
    assert spec is not None
    solution = solve_solid_geometry(spec)

    playbook = build_solid_geometry_playbook(solution, run_id="run-geo", prompt=prompt)
    validate_solution_playbook_consistency(solution, playbook)

    assert playbook.domain == "math"
    assert len(playbook.steps) >= 5
    final_step = playbook.steps[-1]
    assert solution.answer_latex in final_step.voiceover_text
    assert "线面角" in final_step.voiceover_text
    assert final_step.snapshot.kind == "solid_geometry_scene"
    assert isinstance(final_step.snapshot, SolidGeometrySceneSnapshot)
    assert final_step.snapshot.formula_latex == solution.answer_latex


def test_snapshot_points_are_kernel_render_points() -> None:
    prompt = "正方体 ABCD-A1B1C1D1，棱长 2，求 A1B 与平面 ABCD 的夹角"
    spec = extract_solid_geometry_spec(prompt)
    assert spec is not None
    solution = solve_solid_geometry(spec)
    playbook = build_solid_geometry_playbook(solution, run_id="run-cube", prompt=prompt)
    snapshot = playbook.steps[0].snapshot

    assert snapshot.kind == "solid_geometry_scene"
    by_label = {point.label: point.position for point in snapshot.points}
    assert by_label["A1"] == solution.points["A1"].render
    assert by_label["B"] == solution.points["B"].render
