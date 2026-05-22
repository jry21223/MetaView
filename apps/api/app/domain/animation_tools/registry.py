"""Animation Tool Registry.

Tools are registered via the ``@register`` decorator and looked up by
name during CIR expansion.
"""

from __future__ import annotations

import logging
from collections.abc import Callable

from app.domain.animation_tools.types import AnimationTool
from app.domain.models.cir import AnimationCall, CirDocument, LayerSpec

logger = logging.getLogger(__name__)

_REGISTRY: dict[str, AnimationTool] = {}


def register(name: str) -> Callable[[AnimationTool], AnimationTool]:
    """Decorator that registers an animation tool under ``name``.

    Usage::

        @register("math.show_tangent")
        def show_tangent(args: dict) -> list[LayerSpec]:
            ...
    """

    def deco(fn: AnimationTool) -> AnimationTool:
        if name in _REGISTRY:
            logger.warning("Animation tool %r already registered; overwriting", name)
        _REGISTRY[name] = fn
        return fn

    return deco


def expand_animation_call(tool: str, args: dict) -> list[LayerSpec]:
    """Look up ``tool`` in the registry and call it with ``args``.

    Returns an empty list when the tool is unknown.
    """
    fn = _REGISTRY.get(tool)
    if fn is None:
        logger.warning("Unknown animation tool: %r", tool)
        return []
    try:
        return fn(args)
    except Exception:
        logger.exception("Animation tool %r raised an exception", tool)
        return []


def expand_cir_animation_calls(cir: CirDocument) -> CirDocument:
    """Walk all steps and expand ``animation_calls`` into ``LayerSpec`` entries.

    Expanded layers are prepended to each step's existing ``layers`` list so
    that macro-generated visuals sit behind hand-written overlays (e.g. a
    ``katex_overlay`` added by the LLM on top of the expanded scene).

    Steps without ``animation_calls`` are left untouched.
    """
    new_steps = []
    for step in cir.steps:
        if not step.animation_calls:
            new_steps.append(step)
            continue

        expanded: list[LayerSpec] = []
        for call in step.animation_calls:
            expanded.extend(expand_animation_call(call.tool, call.args))

        if not expanded:
            new_steps.append(step)
            continue

        new_steps.append(
            step.model_copy(
                update={
                    "layers": [*expanded, *step.layers],
                    "animation_calls": [],  # consumed
                }
            )
        )

    return cir.model_copy(update={"steps": new_steps})
