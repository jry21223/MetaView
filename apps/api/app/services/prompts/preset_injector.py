from __future__ import annotations

import logging
import re
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import TYPE_CHECKING, Any

import yaml

logger = logging.getLogger(__name__)

_PRESETS_PATH = (
    Path(__file__).resolve().parents[5]
    / "tools"
    / "prompt_optimizer"
    / "presets"
    / "knowledge_points.yaml"
)
_MIN_SCORE_TO_USE = 70.0

if TYPE_CHECKING:
    from app.schemas import TopicDomain


@dataclass(frozen=True)
class PresetMatch:
    entry_id: str
    name: str
    domain: str
    score: float
    run_id: str


@lru_cache(maxsize=1)
def _load_presets() -> dict[str, Any]:
    try:
        loaded = yaml.safe_load(_PRESETS_PATH.read_text(encoding="utf-8"))
    except (FileNotFoundError, yaml.YAMLError):
        return {"knowledge_points": []}
    return loaded if isinstance(loaded, dict) else {"knowledge_points": []}


def _is_usable(entry: dict[str, Any]) -> bool:
    score = entry.get("score")
    return score is not None and score >= _MIN_SCORE_TO_USE and bool(entry.get("patches"))


def find_preset_by_cir_title(cir_title: str, domain: "TopicDomain | str") -> PresetMatch | None:
    title_lower = cir_title.lower()
    domain_value = domain.value if hasattr(domain, "value") else domain

    for entry in _load_presets().get("knowledge_points", []):
        if not isinstance(entry, dict) or not _is_usable(entry):
            continue
        if entry.get("domain") != domain_value:
            continue
        keywords = entry.get("title_keywords", [])
        if any(isinstance(keyword, str) and keyword.lower() in title_lower for keyword in keywords):
            return PresetMatch(
                entry_id=str(entry["id"]),
                name=str(entry["name"]),
                domain=str(entry["domain"]),
                score=float(entry["score"]),
                run_id=str(entry.get("run_id", "")),
            )
    return None


def _normalize_section_key(section_key: str) -> str:
    return section_key.lstrip("# ").strip()



def _apply_patch_to_text(text: str, *, section_key: str, action: str, content: str) -> str:
    normalized_section_key = _normalize_section_key(section_key)
    section_pattern = re.compile(
        rf"(## {re.escape(normalized_section_key)}\n)(.*?)(?=\n## |\Z)",
        re.DOTALL,
    )

    if action == "delete":
        return section_pattern.sub("", text).strip()

    if action == "replace":
        if section_pattern.search(text):
            return section_pattern.sub(rf"\g<1>{content}\n", text)
        return f"{text.rstrip()}\n\n## {normalized_section_key}\n{content}\n"

    if action == "append":
        def _append(match: re.Match[str]) -> str:
            return f"{match.group(1)}{match.group(2).rstrip()}\n{content}\n"

        if section_pattern.search(text):
            return section_pattern.sub(_append, text)
        return f"{text.rstrip()}\n\n## {normalized_section_key}\n{content}\n"

    if action == "prepend":
        def _prepend(match: re.Match[str]) -> str:
            return f"{match.group(1)}{content}\n{match.group(2)}"

        if section_pattern.search(text):
            return section_pattern.sub(_prepend, text)
        return f"## {normalized_section_key}\n{content}\n\n{text}"

    return text


def apply_preset_patches(
    preset_id: str | None,
    base_system_prompt: str,
) -> str:
    if not preset_id:
        return base_system_prompt

    try:
        entry = next(
            (
                item
                for item in _load_presets().get("knowledge_points", [])
                if isinstance(item, dict) and item.get("id") == preset_id
            ),
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
        for patch in entry["patches"]:
            if not isinstance(patch, dict):
                continue
            result = _apply_patch_to_text(
                result,
                section_key=str(patch["section_key"]),
                action=str(patch["action"]),
                content=str(patch["content"]),
            )
        return result
    except Exception as exc:
        logger.warning("预设注入失败（静默降级）: %s", exc)
        return base_system_prompt
