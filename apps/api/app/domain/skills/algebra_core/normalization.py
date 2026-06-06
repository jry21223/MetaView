from __future__ import annotations

import re

_REPLACEMENTS = {
    "\t": " ",
    "\n": " ",
    "（": "(",
    "）": ")",
    "【": "[",
    "】": "]",
    "，": ",",
    "；": ";",
    "：": ":",
    "＝": "=",
    "＋": "+",
    "－": "-",
    "−": "-",
    "﹣": "-",
    "＊": "*",
    "×": "*",
    "·": "*",
    "÷": "/",
    "／": "/",
    "＾": "^",
    "²": "^2",
    "³": "^3",
    "≤": "<=",
    "≥": ">=",
    "π": "pi",
}


def normalize_math_text(text: str) -> str:
    out = text.strip()
    for old, new in _REPLACEMENTS.items():
        out = out.replace(old, new)
    out = re.sub(r"\s+", " ", out)
    out = out.replace("**", "^")
    return out.strip()


def compact_math_text(text: str) -> str:
    return normalize_math_text(text).replace(" ", "")
