"""Preset prompt injector for CoderAgent.

Applies optimized prompt patches based on cir.preset_id.
Fails silently (returns original prompt) if anything goes wrong.
"""

import logging
import sys
from pathlib import Path

logger = logging.getLogger(__name__)

# Ensure tools/prompt_optimizer is on path
_REPO_ROOT = Path(__file__).resolve().parents[5]
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))


def apply_preset_patches(
    preset_id: str | None,
    base_system_prompt: str,
) -> str:
    """
    Apply optimized prompt patches from preset library.

    Args:
        preset_id: The preset ID from CIR (e.g., "quicksort"), or None
        base_system_prompt: The original system prompt text

    Returns:
        Modified prompt with patches applied, or original if:
        - preset_id is None
        - preset not found
        - patches not available
        - any error occurs
    """
    if not preset_id:
        return base_system_prompt

    try:
        # Late import to avoid circular dependencies
        from tools.prompt_optimizer.models import PromptPatch
        from tools.prompt_optimizer.optimizer.variant_manager import apply_patch_to_text
        from tools.prompt_optimizer.preset_matcher import _load_presets

        presets = _load_presets()
        entry = next(
            (e for e in presets.get("knowledge_points", []) if e["id"] == preset_id),
            None,
        )
        if not entry or not entry.get("patches"):
            return base_system_prompt

        logger.info(
            "注入预设 '%s' (score=%.1f, patches=%d)",
            entry["name"],
            entry.get("score", 0),
            len(entry["patches"]),
        )

        result = base_system_prompt
        for p in entry["patches"]:
            patch = PromptPatch(
                section_key=p["section_key"],
                action=p["action"],
                content=p["content"],
                rationale=p.get("rationale", ""),
            )
            result = apply_patch_to_text(result, patch)
        return result

    except Exception as exc:
        logger.warning("预设注入失败（静默降级）: %s", exc)
        return base_system_prompt
