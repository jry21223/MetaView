"""Turn typographic narration into something a TTS engine can actually read.

``voiceover_text`` is written to look right on screen — ``b²=a²−c²``,
``√((x+c)²+y²)``, ``F₁``, ``θ=30°``. Speech engines do not share that lexicon:
probing the corpus with espeak-ng, ``√`` is dropped **silently** and ``²``
comes back as a bare "二", so ``b²=a²−c²`` is spoken as "b 等于 a 减 c 二" —
the squares and the root are simply gone from a mathematics lesson.

So the spoken form is derived here, on the way to the synthesizer only. The
playbook keeps its typographic text for subtitles and for the canvas: one
field, two audiences.

Every rule below was checked against the actual narration in
``data/template-previews`` rather than guessed — e.g. all 14 occurrences of
``·`` are multiplication and all 45 of ``−`` are subtraction, so both convert
unconditionally; parentheses are never asides (they carry coordinates like
``(-1,2.4)``), so nothing strips them.
"""

from __future__ import annotations

import re
from typing import Final

# Digits that ride above and below the baseline, mapped back to plain ones.
_SUPERSCRIPT_DIGITS: Final = str.maketrans("⁰¹²³⁴⁵⁶⁷⁸⁹", "0123456789")
_SUBSCRIPT_DIGITS: Final = str.maketrans("₀₁₂₃₄₅₆₇₈₉", "0123456789")
# Subscript letters appear as vector components (vₓ) and indices (xₖ).
_SUBSCRIPT_LETTERS: Final = {
    "ₓ": "x", "ᵧ": "y", "ᵢ": "i", "ⱼ": "j", "ₙ": "n", "ₖ": "k",
    "ₐ": "a", "ₑ": "e", "ₒ": "o", "ₚ": "p", "ₛ": "s", "ₜ": "t", "ₘ": "m",
}

_GREEK: Final = {
    "α": "阿尔法", "β": "贝塔", "γ": "伽马", "δ": "德尔塔", "Δ": "德尔塔",
    "ε": "艾普西龙", "θ": "西塔", "Θ": "西塔", "λ": "兰姆达", "Λ": "兰姆达",
    "μ": "缪", "π": "派", "Π": "派", "ρ": "柔", "σ": "西格玛", "Σ": "西格玛",
    "τ": "陶", "φ": "斐", "Φ": "斐", "ω": "欧米伽", "Ω": "欧米伽",
}

_OPERATORS: Final = {
    "√": "根号",
    "−": "减",   # U+2212, the true minus — never a prose dash
    "×": "乘以",
    "÷": "除以",
    "·": "乘以",
    "≈": "约等于",
    "≤": "小于等于",
    "≥": "大于等于",
    "≠": "不等于",
    "±": "正负",
    "∓": "负正",
    "∫": "积分",
    "∞": "无穷",
    "⋯": "一直到",
    "∈": "属于",
    "°": "度",
    "⊥": "垂直于",
}

_ORDINAL_POWERS: Final = {"2": "的平方", "3": "的立方"}

# Suffixes bind to the symbol they follow, so unlike the operators below
# they take no surrounding space: f′(a) is "f撇", never "f 撇".
_SUFFIXES: Final = {"′": "撇", "″": "两撇"}

# A superscript run that ends in a charge sign is an ion, not an exponent.
_ION_RE: Final = re.compile(r"([⁰¹²³⁴⁵⁶⁷⁸⁹]+)([⁺⁻])")
_SUPERSCRIPT_RUN_RE: Final = re.compile(r"[⁰¹²³⁴⁵⁶⁷⁸⁹]+")
_SUBSCRIPT_RUN_RE: Final = re.compile(r"[₀₁₂₃₄₅₆₇₈₉]+")
# x_M / y_M: an underscore joining identifier parts, not emphasis.
_UNDERSCORE_INDEX_RE: Final = re.compile(r"(?<=[A-Za-z0-9])_(?=[A-Za-z0-9])")
_MULTISPACE_RE: Final = re.compile(r"[ \t]{2,}")
# |vₓ| and |F| are magnitudes, the only way bars are used in this corpus.
_MAGNITUDE_RE: Final = re.compile(r"\|([^|\n]{1,12})\|")
# An arrow set off by spaces is a chemical reaction (Zn → Zn²⁺); a tight one
# is a limit (h→0). Both spellings occur, and they read differently.
_REACTION_ARROW_RE: Final = re.compile(r"\s→\s")


def _ion(match: re.Match[str]) -> str:
    digits = match.group(1).translate(_SUPERSCRIPT_DIGITS)
    polarity = "正" if match.group(2) == "⁺" else "负"
    return f" {digits} 价{polarity}离子"


def _power(match: re.Match[str]) -> str:
    digits = match.group(0).translate(_SUPERSCRIPT_DIGITS)
    named = _ORDINAL_POWERS.get(digits)
    return named if named else f"的 {digits} 次方"


def to_spoken(text: str) -> str:
    """Rewrite one narration line into its spoken form.

    Idempotent on text that carries no typographic maths, so it is safe to
    apply to every step regardless of subject.
    """

    if not text:
        return text

    # Ions first: the charge sign decides how the preceding digits read.
    spoken = _ION_RE.sub(_ion, text)
    # A bare charge sign with no digits (2e⁻) is just a polarity.
    spoken = spoken.replace("⁺", " 正").replace("⁻", " 负")
    spoken = _SUPERSCRIPT_RUN_RE.sub(_power, spoken)
    spoken = _SUBSCRIPT_RUN_RE.sub(
        lambda m: m.group(0).translate(_SUBSCRIPT_DIGITS), spoken
    )
    for glyph, plain in _SUBSCRIPT_LETTERS.items():
        spoken = spoken.replace(glyph, plain)
    spoken = _UNDERSCORE_INDEX_RE.sub(" ", spoken)
    spoken = _MAGNITUDE_RE.sub(r"\1 的大小", spoken)
    spoken = _REACTION_ARROW_RE.sub(" 生成 ", spoken).replace("→", " 趋于 ")
    for glyph, word in _SUFFIXES.items():
        spoken = spoken.replace(glyph, word)
    for glyph, word in _OPERATORS.items():
        spoken = spoken.replace(glyph, f" {word} ")
    for glyph, word in _GREEK.items():
        spoken = spoken.replace(glyph, word)
    return _MULTISPACE_RE.sub(" ", spoken).strip()
