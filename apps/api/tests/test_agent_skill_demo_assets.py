from __future__ import annotations

from pathlib import Path

import yaml

from scripts.run_agent_skill_demo import classify_generation_path


def test_agent_skill_demo_prompts_cover_all_core_domains() -> None:
    path = Path("eval/prompts/agent_skill_demo.yaml")
    data = yaml.safe_load(path.read_text(encoding="utf-8"))
    domains = {case["domain"] for case in data["prompts"]}

    assert domains == {
        "algorithm",
        "math",
        "code",
        "physics",
        "chemistry",
        "biology",
        "geography",
    }


def test_agent_skill_demo_runner_classifies_review_actions() -> None:
    assert classify_generation_path(["router:skill_pack", "skill:chemistry"]) == "deterministic"
    assert classify_generation_path(["generator:agent", "agent_skill:physics"]) == "agent"
    assert classify_generation_path(["generator:generic_cir"]) == "single"
