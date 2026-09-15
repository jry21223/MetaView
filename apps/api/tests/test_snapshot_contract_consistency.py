from __future__ import annotations

import json
import re
import subprocess
from collections import Counter
from functools import lru_cache
from pathlib import Path
from typing import Any

from pydantic import TypeAdapter

from app.domain.contracts.playbook_contract import SUPPORTED_SNAPSHOT_KINDS
from app.domain.models.playbook import AlgorithmAuxiliaryLane, AnySnapshot, PlaybookScript
from app.domain.services.playbook_quality import quality_gate_playbook
from app.domain.services.scene_blueprint_compiler import compile_scene_blueprint_to_playbook

ROOT = Path(__file__).resolve().parents[3]
TYPESCRIPT_CONTRACT_EXTRACTOR = (
    Path(__file__).parent / "support" / "extract_typescript_snapshot_contract.mjs"
)


@lru_cache(maxsize=1)
def _typescript_snapshot_contracts() -> dict[str, Any]:
    result = subprocess.run(
        [
            "node",
            str(TYPESCRIPT_CONTRACT_EXTRACTOR),
            str(ROOT / "apps/agent/src/state/playbookSelfCheck.ts"),
            str(ROOT / "apps/web/src/features/playbook/engine/types.ts"),
            str(ROOT / "apps/web/src/features/playbook/engine/renderers/registry.ts"),
        ],
        cwd=ROOT,
        check=True,
        capture_output=True,
        text=True,
    )
    return json.loads(result.stdout)


def _pydantic_snapshot_discriminator() -> tuple[set[str], set[str]]:
    schema: dict[str, Any] = TypeAdapter(AnySnapshot).json_schema()
    discriminator = schema["discriminator"]
    assert discriminator["propertyName"] == "kind"
    mapping: dict[str, str] = discriminator["mapping"]
    union_refs = {item["$ref"] for item in schema["oneOf"]}
    return set(mapping), union_refs


def test_pydantic_any_snapshot_matches_api_contract() -> None:
    discriminator_kinds, union_refs = _pydantic_snapshot_discriminator()

    assert discriminator_kinds == set(SUPPORTED_SNAPSHOT_KINDS)
    assert len(union_refs) == len(SUPPORTED_SNAPSHOT_KINDS)


def test_agent_self_check_snapshot_kinds_match_api_contract() -> None:
    assert Counter(_typescript_snapshot_contracts()["agent_self_check"]) == Counter(
        SUPPORTED_SNAPSHOT_KINDS
    )


def test_web_snapshot_kind_union_matches_api_contract() -> None:
    assert Counter(_typescript_snapshot_contracts()["web_snapshot_kind"]) == Counter(
        SUPPORTED_SNAPSHOT_KINDS
    )


def test_web_renderer_registry_snapshot_kinds_match_api_contract() -> None:
    assert Counter(_typescript_snapshot_contracts()["web_renderer_registry"]) == Counter(
        SUPPORTED_SNAPSHOT_KINDS
    )


def test_shared_issue_codes_keep_api_severity_semantics() -> None:
    contracts = _typescript_snapshot_contracts()["agent_issue_contracts"]
    agent_contract = {
        (item["code"], item["path_source"]): item["severity"]
        for item in contracts
    }
    playbook = compile_scene_blueprint_to_playbook(
        {
            "id": "contract-quality",
            "subject": "math",
            "sceneType": "derivative_tangent",
            "title": "Contract quality",
            "visualIntent": ["show the derivative tangent"],
        }
    )
    short_payload = playbook.model_dump(mode="json")
    for index, step in enumerate(short_payload["steps"], start=1):
        step["end_frame"] = index * 30
    short_payload["total_frames"] = short_payload["steps"][-1]["end_frame"]
    timing_report = quality_gate_playbook(
        PlaybookScript.model_validate(short_payload),
        "Inspect the curve",
        generator_path="contract_test",
    )
    answer_report = quality_gate_playbook(
        playbook,
        "Calculate the orbital velocity",
        generator_path="contract_test",
    )
    api_severity = {
        issue.code: issue.severity.value
        for issue in [*timing_report.issues, *answer_report.issues]
    }

    assert agent_contract[("timeline.voiceover_too_short", "`steps[${index}].end_frame`")] == (
        api_severity["timeline.voiceover_too_short"]
    )
    assert agent_contract[("step.does_not_answer_prompt", '"steps[-1]"')] == api_severity[
        "step.does_not_answer_prompt"
    ]


def _quoted_words(block: str) -> set[str]:
    return set(re.findall(r'"([a-z_]+)"', block))


def _lane_role_union(source: str, interface_name: str) -> set[str]:
    body = re.search(interface_name + r"\s*\{([^}]*)\}", source, re.S)
    assert body, f"{interface_name} not found"
    role = re.search(r"role:\s*([^;]+);", body.group(1))
    assert role, f"{interface_name} has no role union"
    return _quoted_words(role.group(1))


def test_auxiliary_lane_roles_match_across_runtimes() -> None:
    """The lane role enum is hand-copied into five files; keep them in lockstep."""
    from typing import get_args

    expected = set(get_args(AlgorithmAuxiliaryLane.model_fields["role"].annotation))
    assert "stack" in expected

    web = (ROOT / "apps/web/src/features/playbook/engine/types.ts").read_text(encoding="utf-8")
    agent = (ROOT / "apps/agent/src/state/types.ts").read_text(encoding="utf-8")
    drawing = (ROOT / "apps/agent/src/tools/drawing.ts").read_text(encoding="utf-8")
    prompt = (ROOT / "apps/api/app/domain/services/cir_prompt.py").read_text(encoding="utf-8")

    assert _lane_role_union(web, "interface AlgorithmAuxiliaryLane") == expected
    assert _lane_role_union(agent, "interface AlgorithmAuxiliaryLaneBuilder") == expected

    tool = drawing.split('"add_algorithm_auxiliary_lane"', 1)[1]
    role_union = re.search(r"role:\s*Type\.Union\(\[(.*?)\]\)", tool, re.S)
    assert role_union
    assert set(re.findall(r'Type\.Literal\("([a-z_]+)"\)', role_union.group(1))) == expected

    lanes_block = prompt.split('"auxiliary_lanes"', 1)[1]
    prompt_roles = re.search(r'"role":\s*"([^"]+)"', lanes_block)
    assert prompt_roles
    assert {item.strip() for item in prompt_roles.group(1).split("|")} == expected
