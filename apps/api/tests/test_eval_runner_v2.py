from __future__ import annotations

import json
from pathlib import Path

from app.domain.services.scene_blueprint_compiler import compile_scene_blueprint_to_playbook
from eval.benchmark_v2 import load_benchmark_v2_suite, score_benchmark_v2
from eval.runner import GenerationMetrics, V2Attempt, _summarize_attempts, main


def _derivative_raw() -> str:
    playbook = compile_scene_blueprint_to_playbook(
        {
            "id": "math-derivative-tangent",
            "subject": "math",
            "sceneType": "derivative_tangent",
            "title": "Derivative tangent",
        }
    )
    return playbook.model_dump_json(by_alias=True)


def test_v2_summary_keeps_unavailable_api_metrics_null() -> None:
    expectation = load_benchmark_v2_suite().by_id("math-derivative-tangent")
    card = score_benchmark_v2(expectation, _derivative_raw())
    attempts = [
        V2Attempt(
            repeat_index=index,
            card=card,
            metrics=GenerationMetrics(),
            structure_signature="same-structure",
        )
        for index in range(1, 4)
    ]

    summary = _summarize_attempts(attempts)

    assert summary["success_rate"] == 1.0
    assert summary["structure_similarity"] == 1.0
    assert summary["quality_score_variance"] == 0.0
    for metric in (
        "latency_ms",
        "repair_count",
        "input_tokens",
        "output_tokens",
        "estimated_cost",
    ):
        assert summary[metric] == {"values": [None, None, None], "mean": None, "sum": None}


def test_v2_recorded_runner_repeats_three_times_and_writes_stability_report(
    tmp_path: Path,
) -> None:
    fixtures = tmp_path / "fixtures"
    fixtures.mkdir()
    (fixtures / "math-derivative-tangent.json").write_text(
        _derivative_raw(),
        encoding="utf-8",
    )
    output = tmp_path / "report.json"

    exit_code = main(
        [
            "--benchmark-v2",
            "--recorded",
            "--ids",
            "math-derivative-tangent",
            "--fixtures-dir",
            str(fixtures),
            "--output",
            str(output),
        ]
    )
    report = json.loads(output.read_text(encoding="utf-8"))

    assert exit_code == 0
    assert report["repeat_count"] == 3
    assert report["attempt_count"] == 3
    assert report["success_rate"] == 1.0
    summary = report["cases"][0]["summary"]
    assert summary["structure_similarity"] == 1.0
    assert summary["quality_score_variance"] == 0.0
    assert summary["latency_ms"]["values"] == [None, None, None]


def test_v2_live_runner_reports_real_metrics_and_preserves_missing_cost(
    monkeypatch,
    tmp_path: Path,
) -> None:
    monkeypatch.setattr(
        "eval.runner._generate_live_v2",
        lambda *_: (
            _derivative_raw(),
            GenerationMetrics(
                latency_ms=125.0,
                repair_count=1,
                input_tokens=100,
                output_tokens=50,
                estimated_cost=None,
                warning_count=0,
                run_id="live-run",
            ),
        ),
    )
    output = tmp_path / "live-report.json"

    exit_code = main(
        [
            "--benchmark-v2",
            "--live",
            "--ids",
            "math-derivative-tangent",
            "--output",
            str(output),
        ]
    )
    report = json.loads(output.read_text(encoding="utf-8"))

    assert exit_code == 0
    summary = report["cases"][0]["summary"]
    assert summary["latency_ms"]["values"] == [125.0, 125.0, 125.0]
    assert summary["repair_count"]["mean"] == 1.0
    assert summary["input_tokens"]["sum"] == 300.0
    assert summary["output_tokens"]["sum"] == 150.0
    assert summary["estimated_cost"] == {
        "values": [None, None, None],
        "mean": None,
        "sum": None,
    }
