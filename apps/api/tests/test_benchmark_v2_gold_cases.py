from __future__ import annotations

import json
from pathlib import Path

from app.domain.contracts.playbook_contract import SUPPORTED_SNAPSHOT_KIND_SET

ROOT = Path(__file__).resolve().parents[3]
GOLD_CASES = ROOT / "eval/benchmark_v2/gold_cases.json"
EXPECTED_IDS = {
    "math-derivative-tangent",
    "algorithm-bfs-tree",
    "code-recursion-factorial",
    "physics-projectile",
}


def test_benchmark_v2_gold_case_expectations_are_complete() -> None:
    data = json.loads(GOLD_CASES.read_text())
    cases = data["cases"]
    assert data["schema_version"] == "2.0.0"
    assert {case["id"] for case in cases} == EXPECTED_IDS
    for case in cases:
        assert case["required_snapshot_kinds"]
        assert case["required_semantic_roles"]
        assert case["required_text_facts"]
        assert case["required_state_fields"]
        assert case["expected_conclusion"].strip()
        assert case["hard_fail_conditions"]
        assert set(case["required_snapshot_kinds"]).issubset(SUPPORTED_SNAPSHOT_KIND_SET)
        assert set(case["forbidden_snapshot_kinds"]).issubset(SUPPORTED_SNAPSHOT_KIND_SET)
