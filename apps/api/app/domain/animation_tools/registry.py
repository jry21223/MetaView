"""Animation Tool Registry.

Tools are registered via the ``@register`` decorator and looked up by
name during CIR expansion.
"""

from __future__ import annotations

import logging
from collections.abc import Callable
from typing import Any, Literal

from pydantic import BaseModel, Field, ValidationError

from app.domain.animation_tools.types import AnimationTool
from app.domain.models.cir import CirDocument, LayerSpec
from app.domain.services.safe_math_expr import (
    SafeMathExpressionError,
    compile_safe_math_expression,
)

logger = logging.getLogger(__name__)

# Renderer expression grammar, restated wherever an agent can get it wrong.
EXPRESSION_GRAMMAR_HINT = (
    "MetaView expressions use '^' for powers (not Python '**'), plain function "
    "names such as sin(x), cos(x), sqrt(x), abs(x) (no LaTeX backslashes), "
    "explicit multiplication like 2*x, and the constants pi and e."
)

# Args-model field names that must parse under the renderer expression grammar.
_EXPRESSION_FIELD_PREFIX = "expression"
_EXPRESSION_FIELD_SUFFIX = "_expression"

_REGISTRY: dict[str, AnimationTool] = {}
_TOOL_ARGS_MODELS: dict[str, type[BaseModel]] = {}
_TOOL_DESCRIPTIONS: dict[str, str] = {
    "algorithm.graph_traversal": "Build graph traversal layers with active nodes and edges.",
    "biology.punnett_square": "Build a Punnett square for simple inheritance explanations.",
    "chemistry.stoichiometry_table": (
        "Build stoichiometry table layers for balanced reaction quantities."
    ),
    "math.show_derivative_compare": (
        "Compare a function and its derivative on shared plot layers. Pass only "
        "`expression` and the backend differentiates it symbolically; "
        "`derivative_expression` overrides that at the caller's own risk."
    ),
    "math.show_function": (
        "Build function plot layers with optional comparison, marker, or shaded interval."
    ),
    "math.show_function_transform": "Show a base function and transformed function on shared axes.",
    "math.show_integral_area": "Show area under a function between two bounds.",
    "math.show_parametric_curve": "Show a parametric curve in a math scene.",
    "math.show_region_boundary": "Show a polygonal region boundary in a math scene.",
    "math.show_tangent": (
        "Show a function and its tangent line at x0 with a marker at the tangent "
        "point. Pass only `expression` and `x0` and the backend derives the true "
        "tangent symbolically; `tangent_expression` overrides that at the "
        "caller's own risk."
    ),
    "physics.force_diagram": "Build force-vector scene layers for a body.",
    "physics.projectile_motion": (
        "Build projectile trajectory layers from initial velocity and angle."
    ),
    "stats.distribution_chart": (
        "Build statistical chart layers for distribution-style comparisons."
    ),
}

AnimationToolIssueCode = Literal[
    "animation_tool.unknown_tool",
    "animation_tool.invalid_args",
    "animation_tool.invalid_expression",
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


class AnimationToolInfo(BaseModel):
    name: str
    description: str
    args_schema: dict[str, Any] = Field(default_factory=dict)


class CirAnimationToolExpansionResult(BaseModel):
    cir: CirDocument
    issues: list[AnimationToolIssue] = Field(default_factory=list)


def register(
    name: str,
    args_model: type[BaseModel] | None = None,
) -> Callable[[AnimationTool], AnimationTool]:
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
        if args_model is not None:
            _TOOL_ARGS_MODELS[name] = args_model
        return fn

    return deco


def list_animation_tools() -> list[AnimationToolInfo]:
    """Return registered animation tools for agent-side discovery."""
    return [
        AnimationToolInfo(
            name=name,
            description=_TOOL_DESCRIPTIONS.get(name, _description_from_name(name)),
            args_schema=_args_schema_for_name(name),
        )
        for name in sorted(_REGISTRY)
    ]


def _args_schema_for_name(name: str) -> dict[str, Any]:
    model = _TOOL_ARGS_MODELS.get(name)
    if model is None:
        return {"type": "object", "properties": {}}
    return model.model_json_schema()


def _description_from_name(name: str) -> str:
    domain, _, action = name.partition(".")
    phrase = action.replace("_", " ") if action else name.replace("_", " ")
    return f"{domain.title()} animation tool for {phrase}."


def _format_validation_error(exc: ValidationError) -> str:
    """Render every error with its field path so callers can self-correct."""
    parts = []
    for error in exc.errors():
        loc = ".".join(str(item) for item in error.get("loc", ())) or "args"
        parts.append(f"{loc}: {error.get('msg')}")
    return "; ".join(parts)


def _expression_issues(
    tool: str,
    args: dict,
    path: str,
) -> list[AnimationToolIssue]:
    """Fail fast on expression fields the renderer grammar cannot parse.

    The canonical quality gate would reject these anyway, but only after the
    whole Playbook is assembled — far from the tool call that caused it.
    """
    issues: list[AnimationToolIssue] = []
    for field, value in args.items():
        if not isinstance(value, str) or not value.strip():
            continue
        if not (
            field == _EXPRESSION_FIELD_PREFIX
            or field.startswith(f"{_EXPRESSION_FIELD_PREFIX}_")
            or field.endswith(_EXPRESSION_FIELD_SUFFIX)
        ):
            continue
        try:
            compile_safe_math_expression(value)
        except SafeMathExpressionError as exc:
            issues.append(
                AnimationToolIssue(
                    code="animation_tool.invalid_expression",
                    tool=tool,
                    path=path,
                    message=(
                        f"Invalid expression for animation tool {tool} at {field}: "
                        f"{exc}. {EXPRESSION_GRAMMAR_HINT}"
                    ),
                )
            )
    return issues


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
            message=(
                f"Unknown animation tool: {tool}. Available tools: {', '.join(sorted(_REGISTRY))}"
            ),
        )
        logger.warning("%s at %s", issue.message, path)
        return AnimationToolExpansionResult(issues=[issue])
    expression_issues = _expression_issues(tool, args, path)
    if expression_issues:
        for issue in expression_issues:
            logger.warning("%s", issue.message)
        return AnimationToolExpansionResult(issues=expression_issues)
    try:
        return AnimationToolExpansionResult(layers=fn(args))
    except ValidationError as exc:
        issue = AnimationToolIssue(
            code="animation_tool.invalid_args",
            tool=tool,
            path=path,
            message=f"Invalid args for animation tool {tool}: {_format_validation_error(exc)}",
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
