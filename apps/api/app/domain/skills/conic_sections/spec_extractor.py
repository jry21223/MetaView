import re

from app.domain.skills.conic_sections.problem_spec import ConicEllipseFocusProblemSpec

_NUMBER = r"(?:\d+(?:\.\d*)?|\.\d+)"
_A_RE = re.compile(rf"(?:长半轴\s*)?a\s*[=＝]\s*(?P<value>{_NUMBER})", re.IGNORECASE)
_B_RE = re.compile(rf"(?:短半轴\s*)?b\s*[=＝]\s*(?P<value>{_NUMBER})", re.IGNORECASE)


def try_extract_ellipse_focus_definition(prompt: str) -> ConicEllipseFocusProblemSpec | None:
    text = prompt.strip()
    lowered = text.lower()
    if "椭圆" not in text and "ellipse" not in lowered:
        return None
    has_focus_definition = any(
        term in lowered
        for term in ("焦点定义", "两焦点", "距离之和", "focal", "focus definition")
    )
    if not has_focus_definition:
        return None
    a_match = _A_RE.search(text)
    b_match = _B_RE.search(text)
    if (a_match is None) != (b_match is None):
        # Half-specified axes are ambiguous; let another skill or path claim it.
        return None
    if a_match is None and b_match is None:
        # A pure focus-definition demo names no axes (the manifest's own second
        # example); use a classic demonstration ellipse. See issue #282.
        return ConicEllipseFocusProblemSpec(original_prompt=prompt, a=5.0, b=3.0)
    try:
        return ConicEllipseFocusProblemSpec(
            original_prompt=prompt,
            a=float(a_match.group("value")),
            b=float(b_match.group("value")),
        )
    except ValueError:
        return None
