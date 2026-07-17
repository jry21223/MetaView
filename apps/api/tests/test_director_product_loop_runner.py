from __future__ import annotations

import pytest

from scripts.run_director_product_loop_cases import run_cases


@pytest.mark.asyncio
async def test_director_product_loop_runner_writes_passing_report(tmp_path) -> None:
    output = tmp_path / "director_product_loop_report.json"

    report = await run_cases(output_path=output)

    assert output.exists()
    assert report["total_cases"] == 4
    assert report["passed"] == 4
    assert {case["id"] for case in report["cases"]} == {
        "math-quadratic-director",
        "algorithm-bfs-director",
        "code-recursion-stack",
        "physics-incline-motion",
    }
    for case in report["cases"]:
        assert case["run_status"] == "succeeded"
        assert case["has_playbook"] is True
        assert case["has_director"] is True
        assert case["step_count"] > 0
        assert case["beat_count"] > 0
        assert case["current_beat_visible_in_inspector"] is True
        assert case["followup_ok"] is True
        assert case["director_patch_ok"] is True
        assert case["playbook_unchanged_when_director_patch"] is True
        assert case["export_ok"] is True
        assert case["errors"] == []
