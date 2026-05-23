"""Animation Tool Registry — expand high-level LLM macros into LayerSpec objects.

Instead of hand-writing raw ``LayerSpec`` JSON for every teaching animation,
the LLM emits ``animation_calls`` with a ``tool`` name and ``args`` dict.
This package registers those tools and provides a single entry point to
expand all calls in a ``CirDocument`` before the builder materialises them.
"""

# Import tools so their @register decorators fire.
from app.domain.animation_tools import math_tools  # noqa: F401
from app.domain.animation_tools.registry import (
    expand_animation_call,
    expand_cir_animation_calls,
    register,
)

__all__ = [
    "register",
    "expand_animation_call",
    "expand_cir_animation_calls",
]
