"""Spoken-form normalization for narration text.

``voiceover_text`` is typeset for the screen. Probing the real corpus with
espeak-ng showed the cost of sending it to a synthesizer unchanged: ``√`` is
dropped silently and ``²`` comes back as a bare "二", so ``b²=a²−c²`` is
spoken "b 等于 a 减 c 二". These tests pin the rewrite that fixes it, and each
case below is drawn from text that actually ships in data/template-previews.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from app.infrastructure.tts.narration import to_spoken

REPO_ROOT = Path(__file__).resolve().parents[3]
TEMPLATES = REPO_ROOT / "data" / "template-previews"


def test_the_root_that_used_to_vanish_is_spoken() -> None:
    # ellipse-standard-equation, the step where the derivation lives or dies.
    spoken = to_spoken("先把一个根号移到右边：√((x+c)²+y²)=2a−√((x−c)²+y²)。")
    assert "√" not in spoken
    # The prose already says 根号 once; the two symbols add two more.
    assert spoken.count("根号") == 3
    assert "的平方" in spoken
    assert "减" in spoken


@pytest.mark.parametrize(
    ("source", "expected"),
    [
        ("t²", "t的平方"),
        ("b³", "b的立方"),
        ("r⁴", "r的 4 次方"),
        ("x⁰", "x的 0 次方"),
    ],
)
def test_exponents_read_as_powers_not_as_a_trailing_digit(source, expected) -> None:
    assert to_spoken(source) == expected


def test_charge_signs_distinguish_an_ion_from_a_bare_electron() -> None:
    # redox-electron: Zn²⁺ is a divalent cation; the ⁻ on 2e⁻ is just polarity.
    spoken = to_spoken("Zn → Zn²⁺ + 2e⁻")
    assert "Zn 2 价正离子" in spoken
    assert "2e 负" in spoken
    assert "价负离子" not in spoken


def test_a_spaced_arrow_is_a_reaction_and_a_tight_one_is_a_limit() -> None:
    # Both spellings ship, and reading either one the other way is wrong.
    assert "生成" in to_spoken("Zn → Zn²⁺")
    assert "趋于" in to_spoken("lim(h→0)")
    assert "生成" not in to_spoken("lim(h→0)")


def test_prime_is_the_derivative_not_a_stray_quote() -> None:
    assert to_spoken("f′(a)=2a") == "f撇(a)=2a"


def test_bars_around_a_symbol_are_a_magnitude() -> None:
    # projectile: |vₓ| is the speed that survives at the apex.
    assert to_spoken("|vₓ|") == "vx 的大小"


def test_subscripts_flatten_to_readable_identifiers() -> None:
    assert to_spoken("F₁ 与 F₂") == "F1 与 F2"
    assert to_spoken("vₓ=v₀cosθ") == "vx=v0cos西塔"
    assert to_spoken("SO₄") == "SO4"


def test_index_underscores_do_not_read_as_emphasis() -> None:
    assert to_spoken("25y_M²+9x_M") == "25y M的平方+9x M"


def test_operators_and_greek_reach_a_chinese_reading() -> None:
    assert to_spoken("PH⊥l") == "PH 垂直于 l"
    assert to_spoken("θ=30°") == "西塔=30 度"
    assert to_spoken("t≈7.7") == "t 约等于 7.7"
    assert to_spoken("y=±b") == "y= 正负 b"
    assert to_spoken("a·Δx") == "a 乘以 德尔塔x"


def test_plain_prose_is_left_alone_and_the_rewrite_is_idempotent() -> None:
    prose = "同一高度上，一颗子弹水平射出，另一颗同时松手自由落下。"
    assert to_spoken(prose) == prose
    assert to_spoken(to_spoken(prose)) == prose
    assert to_spoken("") == ""


def test_no_shipped_narration_still_carries_an_unreadable_symbol() -> None:
    """The corpus-wide guarantee — a new lesson cannot quietly reintroduce one."""
    readable_punctuation = set("。，、；：？！“”‘’（）()【】[]《》—…/+-*=<>.,:;%'\"$&#@_ \n\t")

    steps = [
        text
        for path in sorted(TEMPLATES.glob("*.playbook.json"))
        for step in json.loads(path.read_text(encoding="utf-8")).get("steps", [])
        if (text := (step.get("voiceover_text") or "").strip())
    ]
    if not steps:
        # data/ is a build artifact, not a fixture: a fresh clone has nothing
        # to scan until the playbooks are exported. CI exports them first, so
        # this only spares a local run that has not.
        pytest.skip(
            "no exported narration corpus — run "
            "`npm --workspace apps/web run template-previews:export` first"
        )
    assert len(steps) > 150, "corpus should not have shrunk"

    residual: dict[str, int] = {}
    for text in steps:
        for char in to_spoken(text):
            if char.isalnum() or "一" <= char <= "鿿":
                continue
            if char in readable_punctuation:
                continue
            residual[char] = residual.get(char, 0) + 1
    assert residual == {}, f"unreadable symbols reach TTS: {residual}"
