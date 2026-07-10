from __future__ import annotations

import re
from pathlib import Path

from app.domain.contracts.playbook_contract import SUPPORTED_SNAPSHOT_KINDS

ROOT = Path(__file__).resolve().parents[3]


def _quoted_snapshot_kinds(path: str) -> set[str]:
    text = (ROOT / path).read_text()
    return set(re.findall(r'"([a-z0-9_]+_scene|algorithm_[a-z_]+|math_[a-z_]+|katex_overlay|narration_card)"', text))


def test_agent_self_check_snapshot_kinds_match_api_contract() -> None:
    assert _quoted_snapshot_kinds("apps/agent/src/state/playbookSelfCheck.ts") == set(
        SUPPORTED_SNAPSHOT_KINDS
    )


def test_web_renderer_registry_snapshot_kinds_match_api_contract() -> None:
    assert _quoted_snapshot_kinds(
        "apps/web/src/features/playbook/engine/renderers/registry.ts"
    ) == set(SUPPORTED_SNAPSHOT_KINDS)
