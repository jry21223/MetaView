"""Animation Tool Registry.

Tools are registered via the ``@register`` decorator and looked up by
name during CIR expansion.
"""

from __future__ import annotations

import logging
from collections.abc import Callable
from typing import Literal

from pydantic import BaseModel, Field, ValidationError

from app.domain.animation_tools.types import AnimationTool
from app.domain.models.cir import CirDocument, LayerSpec

logger = logging.getLogger(__name__)

_REGISTRY: dict[str, AnimationTool] = {}

AnimationToolIssueCode = Literal[
    "animation_tool.unknown_tool",
    "animation_tool.invalid_args",
    "animation_tool.exception",
]


class AnimationToolIssue(BaseModel):
    code: AnimationToolIssueCode
    tool: str
    path: str = "animation_call"
    message: str


class AnimationToolExpansionResult(BaseModel):
    layers: list[LayerSpec] = Field(default_factory=list)
    issues: list[AnimationToolIssue] = Field(default_factory=list)


class CirAnimationToolExpansionResult(BaseModel):
    cir: CirDocument
    issues: list[AnimationToolIssue] = Field(default_factory=list)


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


def safe_expand_animation_call(
    tool: str,
    args: dict,
    *,
    path: str = "animation_call",
) -> AnimationToolExpansionResult:
    """Look up ``tool`` in the registry and call it with ``args``.

    Validation and runtime failures are returned as issues so callers can
    route them into review/repair instead of silently dropping the call.
    """
    fn = _REGISTRY.get(tool)
    if fn is None:
        issue = AnimationToolIssue(
            code="animation_tool.unknown_tool",
            tool=tool,
            path=path,
            message=f"Unknown animation tool: {tool}",
        )
        logger.warning("%s at %s", issue.message, path)
        return AnimationToolExpansionResult(issues=[issue])
    try:
        return AnimationToolExpansionResult(layers=fn(args))
    except ValidationError as exc:
        issue = AnimationToolIssue(
            code="animation_tool.invalid_args",
            tool=tool,
            path=path,
            message=f"Invalid args for animation tool {tool}: {exc.errors()[0].get('msg')}",
        )
        logger.warning("%s", issue.message)
        return AnimationToolExpansionResult(issues=[issue])
    except Exception as exc:  # noqa: BLE001
        issue = AnimationToolIssue(
            code="animation_tool.exception",
            tool=tool,
            path=path,
            message=f"Animation tool {tool} failed: {exc}",
        )
        logger.exception("Animation tool %r raised an exception", tool)
        return AnimationToolExpansionResult(issues=[issue])


def expand_animation_call(tool: str, args: dict) -> list[LayerSpec]:
    """Compatibility wrapper returning only layers.

    New code should use ``safe_expand_animation_call`` so unknown tools and
    invalid arguments can be recorded in review output.
    """
    return safe_expand_animation_call(tool, args).layers


def safe_expand_cir_animation_calls_with_issues(
    cir: CirDocument,
) -> CirAnimationToolExpansionResult:
    """Walk all steps and expand ``animation_calls`` into ``LayerSpec`` entries.

    Expanded layers are prepended to each step's existing ``layers`` list so
    that macro-generated visuals sit behind hand-written overlays (e.g. a
    ``katex_overlay`` added by the LLM on top of the expanded scene).

    Steps without ``animation_calls`` are left untouched.
    """
    new_steps = []
    issues: list[AnimationToolIssue] = []
    for step_index, step in enumerate(cir.steps):
        if not step.animation_calls:
            new_steps.append(step)
            continue

        expanded: list[LayerSpec] = []
        step_issues: list[AnimationToolIssue] = []
        for call_index, call in enumerate(step.animation_calls):
            result = safe_expand_animation_call(
                call.tool,
                call.args,
                path=f"cir.steps[{step_index}].animation_calls[{call_index}]",
            )
            expanded.extend(result.layers)
            step_issues.extend(result.issues)
        issues.extend(step_issues)

        if not expanded or step_issues:
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

    return CirAnimationToolExpansionResult(
        cir=cir.model_copy(update={"steps": new_steps}),
        issues=issues,
    )


def expand_cir_animation_calls(cir: CirDocument) -> CirDocument:
    """Compatibility wrapper returning only the expanded CIR."""
    return safe_expand_cir_animation_calls_with_issues(cir).cir
