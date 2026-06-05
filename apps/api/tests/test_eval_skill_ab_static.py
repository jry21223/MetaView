from __future__ import annotations

import json

from scripts.eval_skill_ab import (
    compare_metrics,
    metrics_payload_from_raw,
    parsed_summary_from_raw,
)

VALID_CIR_RAW = json.dumps({
    "version": "0.1.0",
    "title": "公式解释",
    "domain": "math",
    "summary": "解释一个抽象公式。",
    "steps": [
        {
            "id": "step_01",
            "title": "写出公式",
            "narration": "先把核心公式写出来。",
            "visual_kind": "formula",
            "plot": {"formula_latex": "a^2 + b^2 = c^2"},
            "annotations": ["勾股定理"],
        }
    ],
})


def test_eval_skill_ab_metrics_payload_from_raw_fixture() -> None:
    metrics = metrics_payload_from_raw(VALID_CIR_RAW, "解释勾股定理")

    assert metrics["parse_ok"] is True
    assert metrics["domain"] == "math"
    assert metrics["step_count"] == 1
    assert metrics["visual_kind_counts"]["formula"] == 1


def test_eval_skill_ab_parsed_summary_from_raw_fixture() -> None:
    summary = parsed_summary_from_raw(VALID_CIR_RAW, "解释勾股定理")

    assert summary["parse_ok"] is True
    assert summary["title"] == "公式解释"
    assert summary["visual_kind_counts"]["formula"] == 1


def test_compare_metrics_reports_deltas() -> None:
    specialized = {
        "domain": "physics",
        "step_count": 4,
        "visual_kind_counts": {"scene": 3, "formula": 1},
    }
    generic = {
        "domain": "physics",
        "step_count": 3,
        "visual_kind_counts": {"formula": 3},
    }

    comparison = compare_metrics(specialized, generic)

    assert comparison["domain_changed"] is False
    assert comparison["step_count_delta"] == -1
    assert comparison["visual_kind_count_delta"]["scene"] == -3
    assert comparison["visual_kind_count_delta"]["formula"] == 2
