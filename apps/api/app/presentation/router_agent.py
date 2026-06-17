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

from app.application.agent.runtime_tool_hub import RuntimeToolHub
from app.application.agent.types import ToolExecutionResult, ToolManifest
from app.config import get_settings
from app.domain.animation_tools import (
    AnimationToolInfo,
    AnimationToolIssue,
)
from app.domain.models.cir import LayerSpec
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


class RuntimeToolListResponse(BaseModel):
    tools: list[ToolManifest]


class RuntimeToolExecuteRequest(BaseModel):
    tool: str = Field(min_length=1, max_length=160)
    args: dict[str, Any] = Field(default_factory=dict)


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
    result = await RuntimeToolHub().execute_tool(
        "geometry.assert_orientation",
        payload.model_dump(mode="json"),
    )
    data = result.result if isinstance(result.result, dict) else {}
    return OrientationResponse.model_validate(data)


@router.post("/assert/passes-through", response_model=PointOnCurveResponse)
@write_limit()
async def assert_passes_through(
    request: Request,
    payload: PointOnCurveRequest,
) -> PointOnCurveResponse:
    result = await RuntimeToolHub().execute_tool(
        "geometry.assert_passes_through",
        payload.model_dump(mode="json"),
    )
    data = result.result if isinstance(result.result, dict) else {}
    return PointOnCurveResponse.model_validate(data)


@router.post("/assert/monotonic", response_model=MonotonicResponse)
@write_limit()
async def assert_monotonic(
    request: Request,
    payload: MonotonicRequest,
) -> MonotonicResponse:
    result = await RuntimeToolHub().execute_tool(
        "geometry.assert_monotonic",
        payload.model_dump(mode="json"),
    )
    data = result.result if isinstance(result.result, dict) else {}
    return MonotonicResponse.model_validate(data)


@router.get("/animation-tools", response_model=AnimationToolListResponse)
async def get_animation_tools(
    token: Annotated[str | None, Header(alias="X-MetaView-Agent-Token")] = None,
) -> AnimationToolListResponse:
    _require_agent_token(token)
    result = await RuntimeToolHub().execute_tool("animation_tool.list", {})
    data = result.result if isinstance(result.result, dict) else {}
    return AnimationToolListResponse.model_validate(data)


@router.post("/animation-tools/expand", response_model=AnimationToolExpandResponse)
@write_limit()
async def expand_animation_tool(
    request: Request,
    payload: AnimationToolExpandRequest,
    token: Annotated[str | None, Header(alias="X-MetaView-Agent-Token")] = None,
) -> AnimationToolExpandResponse:
    _require_agent_token(token)
    result = await RuntimeToolHub().execute_tool(
        "animation_tool.expand",
        payload.model_dump(mode="json"),
    )
    data = result.result if isinstance(result.result, dict) else {}
    return AnimationToolExpandResponse.model_validate(data)


@router.get("/runtime-tools", response_model=RuntimeToolListResponse)
async def get_runtime_tools(
    token: Annotated[str | None, Header(alias="X-MetaView-Agent-Token")] = None,
) -> RuntimeToolListResponse:
    _require_agent_token(token)
    return RuntimeToolListResponse(tools=RuntimeToolHub().list_tools())


@router.post("/runtime-tools/execute", response_model=ToolExecutionResult)
@write_limit()
async def execute_runtime_tool(
    request: Request,
    payload: RuntimeToolExecuteRequest,
    token: Annotated[str | None, Header(alias="X-MetaView-Agent-Token")] = None,
) -> ToolExecutionResult:
    _require_agent_token(token)
    return await RuntimeToolHub().execute_tool(payload.tool, payload.args)
