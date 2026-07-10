"""Eval scorers for PlaybookScript quality assessment.

Seven orthogonal dimensions, each returning a sub-score and diagnostics.
All functions are pure: no I/O, no side effects.

Score dimensions (total 100 pts):
  schema_valid       20 pts  — model_validate_json passes
  step_count         10 pts  — 4–14 steps (optimal 5–10)
  narration          20 pts  — voiceover_text non-empty, avg word count ≥ 10
  title_caption      15 pts  — no MathFormulaSnapshot.caption == step.title
  snapshot_richness  15 pts  — each snapshot has meaningful payload
  temporal_coherence 10 pts  — end_frames strictly increasing, ≤ total_frames
  diversity          10 pts  — ≥ 2 distinct snapshot kinds used
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Any

from pydantic import ValidationError

from app.domain.models.playbook import MathFormulaSnapshot, PlaybookScript

# ---------------------------------------------------------------------------
# Result types
# ---------------------------------------------------------------------------


@dataclass
class DimensionResult:
    name: str
    score: float  # actual points earned
    max_score: float  # maximum possible
    issues: list[str] = field(default_factory=list)

    @property
    def pct(self) -> float:
        return self.score / self.max_score if self.max_score else 0.0


@dataclass
class ScoreCard:
    prompt_id: str
    dimensions: list[DimensionResult] = field(default_factory=list)
    parse_error: str | None = None  # set when schema_valid fails (short-circuits)

    @property
    def total(self) -> float:
        return sum(d.score for d in self.dimensions)

    @property
    def max_total(self) -> float:
        return sum(d.max_score for d in self.dimensions)

    @property
    def passed(self) -> bool:
        return self.total >= 90.0


# ---------------------------------------------------------------------------
# Individual scorers
# ---------------------------------------------------------------------------


def score_schema(raw_json: str) -> tuple[DimensionResult, PlaybookScript | None]:
    """Attempt to deserialise raw_json as PlaybookScript.

    Returns (result, script_or_None).  If validation fails, the script is None
    and the caller should short-circuit remaining scorers.
    """
    try:
        script = PlaybookScript.model_validate_json(raw_json)
        return DimensionResult("schema_valid", 20.0, 20.0), script
    except (ValidationError, json.JSONDecodeError, ValueError) as exc:
        issues = [str(exc)[:200]]
        return DimensionResult("schema_valid", 0.0, 20.0, issues), None


def score_step_count(script: PlaybookScript) -> DimensionResult:
    """Step count in [4, 14] earns full marks; < 4 or > 14 earns 0."""
    n = len(script.steps)
    issues: list[str] = []
    if n < 4:
        issues.append(f"only {n} step(s); expected ≥ 4")
        score = 0.0
    elif n > 14:
        issues.append(f"{n} steps; expected ≤ 14 (too many)")
        score = 0.0
    else:
        score = 10.0
    return DimensionResult("step_count", score, 10.0, issues)


def _text_length(text: str) -> int:
    """Measure text length in a way that works for both CJK and Latin scripts.

    Latin text: count whitespace-separated tokens.
    CJK text: count characters directly (since CJK has no inter-word spaces).
    A text is considered CJK-dominant when > 30% of its non-space chars are CJK.
    """
    import unicodedata

    stripped = text.strip()
    if not stripped:
        return 0
    non_space = [c for c in stripped if not c.isspace()]
    if not non_space:
        return 0
    cjk_count = sum(
        1 for c in non_space if unicodedata.category(c) in ("Lo", "Lm") and ord(c) > 0x2E7F
    )
    if cjk_count / len(non_space) > 0.3:
        return len(stripped)  # character count
    return len(stripped.split())  # word count


def score_narration(script: PlaybookScript) -> DimensionResult:
    """voiceover_text non-empty, avg length ≥ 20 tokens/chars.

    Partial credit:
      - All steps have non-empty voiceover_text → 10 pts
      - Avg length ≥ 20 (words for Latin, chars for CJK) → 10 pts
    """
    _DEPTH_THRESHOLD = 20
    issues: list[str] = []
    steps = script.steps
    if not steps:
        return DimensionResult("narration", 0.0, 20.0, ["no steps"])

    # Part A: coverage
    empty = [s.step_id for s in steps if not s.voiceover_text.strip()]
    coverage_score = 10.0 if not empty else max(0.0, 10.0 * (1 - len(empty) / len(steps)))
    if empty:
        issues.append(f"empty voiceover_text in: {', '.join(empty[:5])}")

    # Part B: depth
    lengths = [_text_length(s.voiceover_text) for s in steps]
    avg_len = sum(lengths) / len(lengths)
    depth_score = 10.0 if avg_len >= _DEPTH_THRESHOLD else 10.0 * (avg_len / _DEPTH_THRESHOLD)
    if avg_len < _DEPTH_THRESHOLD:
        issues.append(f"avg voiceover length {avg_len:.1f} < {_DEPTH_THRESHOLD}")

    return DimensionResult("narration", coverage_score + depth_score, 20.0, issues)


def score_title_caption(script: PlaybookScript) -> DimensionResult:
    """Regression guard: MathFormulaSnapshot.caption must not equal step.title.

    Loses 5 pts per offending step, down to 0.
    """
    issues: list[str] = []
    penalty = 0.0
    for step in script.steps:
        snap = step.snapshot
        if isinstance(snap, MathFormulaSnapshot):
            if snap.caption is not None and snap.caption.strip() == step.title.strip():
                penalty += 5.0
                issues.append(
                    f"{step.step_id}: caption == title == {step.title!r}"
                )
    score = max(0.0, 15.0 - penalty)
    return DimensionResult("title_caption", score, 15.0, issues)


def _snapshot_is_rich(snap: Any) -> bool:
    """Return True if a snapshot carries enough payload to be meaningful."""
    kind = getattr(snap, "kind", "")
    if kind == "algorithm_array":
        return bool(snap.array_values)
    if kind == "algorithm_bars":
        return bool(snap.array_values) and bool(snap.numeric_values)
    if kind == "algorithm_tree":
        return bool(snap.nodes)
    if kind == "math_plot":
        return bool(snap.curves)
    if kind == "math_formula":
        return bool(getattr(snap, "formula_latex", "").strip())
    if kind == "math_scene":
        return any(
            [snap.curves, snap.points, snap.segments, snap.regions, snap.vector_field]
        )
    if kind == "katex_overlay":
        return bool(getattr(snap, "latex", "").strip())
    if kind == "narration_card":
        return bool(getattr(snap, "text", "").strip())
    return True  # unknown kind — assume rich


def score_snapshot_richness(script: PlaybookScript) -> DimensionResult:
    """Each step's snapshot should have meaningful payload.

    Partial credit: (rich_count / total_count) * 15.
    """
    issues: list[str] = []
    steps = script.steps
    if not steps:
        return DimensionResult("snapshot_richness", 0.0, 15.0, ["no steps"])

    poor = [s.step_id for s in steps if not _snapshot_is_rich(s.snapshot)]
    rich_count = len(steps) - len(poor)
    score = 15.0 * (rich_count / len(steps))
    if poor:
        issues.append(f"empty/thin snapshot in: {', '.join(poor[:5])}")
    return DimensionResult("snapshot_richness", score, 15.0, issues)


def score_temporal_coherence(script: PlaybookScript) -> DimensionResult:
    """end_frames must be strictly increasing and ≤ total_frames."""
    issues: list[str] = []
    steps = script.steps
    if not steps:
        return DimensionResult("temporal_coherence", 10.0, 10.0)

    end_frames = [s.end_frame for s in steps]

    # Strictly increasing
    non_mono = [
        (steps[i].step_id, end_frames[i], end_frames[i + 1])
        for i in range(len(end_frames) - 1)
        if end_frames[i] >= end_frames[i + 1]
    ]
    if non_mono:
        for sid, f0, f1 in non_mono[:3]:
            issues.append(f"{sid}: end_frame {f0} ≥ next {f1}")

    # Last frame ≤ total_frames
    if end_frames[-1] > script.total_frames:
        issues.append(
            f"last end_frame {end_frames[-1]} > total_frames {script.total_frames}"
        )

    score = 10.0 if not issues else 0.0
    return DimensionResult("temporal_coherence", score, 10.0, issues)


def score_diversity(script: PlaybookScript) -> DimensionResult:
    """≥ 2 distinct snapshot kinds earns full marks."""
    kinds = {s.snapshot.kind for s in script.steps}
    issues: list[str] = []
    if len(kinds) < 2:
        issues.append(f"only {len(kinds)} distinct snapshot kind(s): {kinds}")
        score = 0.0 if len(kinds) < 2 else 10.0
    else:
        score = 10.0
    return DimensionResult("diversity", score, 10.0, issues)


# ---------------------------------------------------------------------------
# Aggregate scorer
# ---------------------------------------------------------------------------


def score_playbook_legacy(prompt_id: str, raw_json: str) -> ScoreCard:
    """Run the legacy structural scorer and return a populated ScoreCard.

    This name is deliberately explicit so Benchmark V2 reports cannot mistake
    schema/shape quality for product quality.
    """
    card = ScoreCard(prompt_id=prompt_id)

    schema_result, script = score_schema(raw_json)
    card.dimensions.append(schema_result)

    if script is None:
        card.parse_error = (
            schema_result.issues[0] if schema_result.issues else "unknown parse error"
        )
        # Pad remaining dimensions with 0 so card.max_total is always 100
        _zero_remaining(card)
        return card

    card.dimensions += [
        score_step_count(script),
        score_narration(script),
        score_title_caption(script),
        score_snapshot_richness(script),
        score_temporal_coherence(script),
        score_diversity(script),
    ]
    return card


def score_playbook(prompt_id: str, raw_json: str) -> ScoreCard:
    """Backward-compatible alias for :func:`score_playbook_legacy`."""

    return score_playbook_legacy(prompt_id, raw_json)


def _zero_remaining(card: ScoreCard) -> None:
    zeros = [
        ("step_count", 10.0),
        ("narration", 20.0),
        ("title_caption", 15.0),
        ("snapshot_richness", 15.0),
        ("temporal_coherence", 10.0),
        ("diversity", 10.0),
    ]
    for name, max_s in zeros:
        card.dimensions.append(DimensionResult(name, 0.0, max_s))
