"""Animation Tool Registry — expand high-level LLM macros into LayerSpec objects.

Instead of hand-writing raw ``LayerSpec`` JSON for every teaching animation,
the LLM emits ``animation_calls`` with a ``tool`` name and ``args`` dict.
This package registers those tools and provides a single entry point to
expand all calls in a ``CirDocument`` before the builder materialises them.
"""

# Import tools so their @register decorators fire.
from app.domain.animation_tools import (  # noqa: F401
    algorithm_tools,
    biology_tools,
    chemistry_tools,
    math_tools,
    physics_tools,
    stats_tools,
)
from app.domain.animation_tools.registry import (
    AnimationToolExpansionResult,
    AnimationToolIssue,
    expand_animation_call,
    expand_cir_animation_calls,
    register,
    safe_expand_animation_call,
    safe_expand_cir_animation_calls_with_issues,
)

__all__ = [
    "AnimationToolExpansionResult",
    "AnimationToolIssue",
    "register",
    "expand_animation_call",
    "expand_cir_animation_calls",
    "safe_expand_animation_call",
    "safe_expand_cir_animation_calls_with_issues",
]
