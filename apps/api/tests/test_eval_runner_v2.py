from __future__ import annotations

import json
from pathlib import Path

from app.domain.services.scene_blueprint_compiler import compile_scene_blueprint_to_playbook
from eval.benchmark_v2 import load_benchmark_v2_suite, score_benchmark_v2
from eval.runner import (
    GenerationMetrics,
    V2Attempt,
    _print_card,
    _print_v2_card,
    _summarize_attempts,
    main,
)
from eval.scorers import DimensionResult, ScoreCard


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
        "cache_read_tokens",
        "cache_write_tokens",
        "generation_model_turns",
        "tool_batches",
        "tool_calls",
        "single_model_requests",
        "agent_provider_calls",
        "agent_attempts",
        "reviewer_calls",
        "quality_repair_calls",
        "estimated_cost",
    ):
        assert summary[metric] == {"values": [None, None, None], "mean": None, "sum": None}


def test_legacy_card_printing_does_not_require_v2_applicability(capsys) -> None:
    card = ScoreCard(
        prompt_id="legacy",
        dimensions=[DimensionResult("schema_valid", 20.0, 20.0)],
    )

    _print_card(card)

    assert "20.0/20" in capsys.readouterr().out


def test_v2_card_prints_code_sync_as_not_applicable(capsys) -> None:
    expectation = load_benchmark_v2_suite().by_id("math-derivative-tangent")
    card = score_benchmark_v2(expectation, _derivative_raw())

    _print_v2_card(card, 1)

    output = capsys.readouterr().out
    assert "Code Sync" in output
    assert "N/A" in output


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
        lambda *_, **__: (
            _derivative_raw(),
            GenerationMetrics(
                latency_ms=125.0,
                repair_count=1,
                input_tokens=100,
                output_tokens=50,
                cache_read_tokens=40,
                cache_write_tokens=5,
                generation_model_turns=2,
                tool_batches=1,
                tool_calls=3,
                single_model_requests=0,
                agent_provider_calls=1,
                agent_attempts=2,
                reviewer_calls=2,
                quality_repair_calls=1,
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
    assert summary["cache_read_tokens"]["sum"] == 120.0
    assert summary["cache_write_tokens"]["sum"] == 15.0
    assert summary["generation_model_turns"]["sum"] == 6.0
    assert summary["tool_batches"]["sum"] == 3.0
    assert summary["tool_calls"]["sum"] == 9.0
    assert "total_model_requests" not in summary
    assert summary["single_model_requests"]["sum"] == 0.0
    assert summary["agent_provider_calls"]["sum"] == 3.0
    assert summary["agent_attempts"]["sum"] == 6.0
    assert summary["reviewer_calls"]["sum"] == 6.0
    assert summary["quality_repair_calls"]["sum"] == 3.0
    assert summary["estimated_cost"] == {
        "values": [None, None, None],
        "mean": None,
        "sum": None,
    }
