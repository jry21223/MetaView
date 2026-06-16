"""Agent-side callback endpoints.

The Node sidecar (``apps/agent``) calls these during a generation run so
geometric properties (orientation, point-on-curve, monotonicity) are checked
by deterministic sympy code rather than left to LLM intuition.

Endpoints are intentionally narrow — they accept the minimum payload needed
and return a flat JSON object the TS side can pipe straight into a
``toolResult`` message.
"""

from __future__ import annotations

import secrets
from typing import Annotated, Any, Literal

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel, Field
from starlette.requests import Request

from app.config import get_settings
from app.domain.animation_tools import (
    AnimationToolInfo,
    AnimationToolIssue,
    list_animation_tools,
    safe_expand_animation_call,
)
from app.domain.models.cir import LayerSpec
from app.domain.services.geometry_validators import (
    check_monotonic,
    check_orientation,
    check_point_on_curve,
)
from app.presentation.rate_limit import write_limit

router = APIRouter(prefix="/agent", tags=["agent"])


class OrientationRequest(BaseModel):
    expression_x: str = Field(min_length=1, max_length=256)
    expression_y: str = Field(min_length=1, max_length=256)
    t_min: float
    t_max: float


class OrientationResponse(BaseModel):
    direction: Literal["clockwise", "counterclockwise", "static", "error"]
    reason: str


class PointOnCurveRequest(BaseModel):
    expression_x: str = Field(min_length=1, max_length=256)
    expression_y: str = Field(min_length=1, max_length=256)
    t_min: float
    t_max: float
    target_x: float
    target_y: float
    tol: float = 1e-2


class PointOnCurveResponse(BaseModel):
    passes: bool
    closest_t: float | None
    distance: float | None
    reason: str


class MonotonicRequest(BaseModel):
    expression: str = Field(min_length=1, max_length=256)
    x_min: float
    x_max: float


class MonotonicResponse(BaseModel):
    verdict: Literal["increasing", "decreasing", "mixed", "constant", "error"]
    reason: str


class AnimationToolListResponse(BaseModel):
    tools: list[AnimationToolInfo]


class AnimationToolExpandRequest(BaseModel):
    tool: str = Field(min_length=1, max_length=128)
    args: dict[str, Any] = Field(default_factory=dict)


class AnimationToolExpandResponse(BaseModel):
    layers: list[LayerSpec] = Field(default_factory=list)
    issues: list[AnimationToolIssue] = Field(default_factory=list)


def _require_agent_token(
    token: Annotated[str | None, Header(alias="X-MetaView-Agent-Token")] = None,
) -> None:
    expected = get_settings().agent_shared_token
    if not expected:
        return
    if token and secrets.compare_digest(token, expected):
        return
    raise HTTPException(status_code=401, detail="missing or invalid agent token")


@router.post("/assert/orientation", response_model=OrientationResponse)
@write_limit()
async def assert_orientation(
    request: Request,
    payload: OrientationRequest,
) -> OrientationResponse:
    result = check_orientation(
        payload.expression_x,
        payload.expression_y,
        payload.t_min,
        payload.t_max,
    )
    return OrientationResponse(direction=result.direction, reason=result.reason)


@router.post("/assert/passes-through", response_model=PointOnCurveResponse)
@write_limit()
async def assert_passes_through(
    request: Request,
    payload: PointOnCurveRequest,
) -> PointOnCurveResponse:
    result = check_point_on_curve(
        payload.expression_x,
        payload.expression_y,
        payload.t_min,
        payload.t_max,
        payload.target_x,
        payload.target_y,
        payload.tol,
    )
    return PointOnCurveResponse(
        passes=result.passes,
        closest_t=result.closest_t,
        distance=result.distance,
        reason=result.reason,
    )


@router.post("/assert/monotonic", response_model=MonotonicResponse)
@write_limit()
async def assert_monotonic(
    request: Request,
    payload: MonotonicRequest,
) -> MonotonicResponse:
    result = check_monotonic(payload.expression, payload.x_min, payload.x_max)
    return MonotonicResponse(verdict=result.verdict, reason=result.reason)


@router.get("/animation-tools", response_model=AnimationToolListResponse)
async def get_animation_tools(
    token: Annotated[str | None, Header(alias="X-MetaView-Agent-Token")] = None,
) -> AnimationToolListResponse:
    _require_agent_token(token)
    return AnimationToolListResponse(tools=list_animation_tools())


@router.post("/animation-tools/expand", response_model=AnimationToolExpandResponse)
@write_limit()
async def expand_animation_tool(
    request: Request,
    payload: AnimationToolExpandRequest,
    token: Annotated[str | None, Header(alias="X-MetaView-Agent-Token")] = None,
) -> AnimationToolExpandResponse:
    _require_agent_token(token)
    result = safe_expand_animation_call(
        payload.tool,
        payload.args,
        path="agent.animation_tools.expand",
    )
    return AnimationToolExpandResponse(layers=result.layers, issues=result.issues)
