"""Agent-side callback endpoints with request-scoped tool authorization."""

from __future__ import annotations

import secrets
from typing import Annotated, Any, Literal

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel, Field
from starlette.requests import Request

from app.application.agent.runtime_tool_hub import RuntimeToolHub
from app.application.agent.types import ToolExecutionResult, ToolManifest
from app.config import get_settings
from app.domain.animation_tools import AnimationToolInfo, AnimationToolIssue
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


class AuthorizedToolRequest(BaseModel):
    run_id: str | None = Field(default=None, max_length=160)
    allowed_tools: list[str] = Field(default_factory=list, max_length=256)

    def allowed_names(self) -> set[str] | None:
        return set(self.allowed_tools) if self.allowed_tools else None


class AnimationToolListResponse(BaseModel):
    tools: list[AnimationToolInfo]


class AnimationToolExpandRequest(AuthorizedToolRequest):
    tool: str = Field(min_length=1, max_length=128)
    args: dict[str, Any] = Field(default_factory=dict)


class AnimationToolExpandResponse(BaseModel):
    layers: list[LayerSpec] = Field(default_factory=list)
    issues: list[AnimationToolIssue] = Field(default_factory=list)


class RuntimeToolListResponse(BaseModel):
    tools: list[ToolManifest]


class RuntimeToolExecuteRequest(AuthorizedToolRequest):
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
    del request
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
    del request
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
    del request
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
    del request
    _require_agent_token(token)
    result = await RuntimeToolHub().execute_tool(
        "animation_tool.expand",
        {"tool": payload.tool, "args": payload.args},
        allowed_names=payload.allowed_names(),
    )
    if not result.ok:
        raise HTTPException(status_code=403, detail=result.error)
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
    del request
    _require_agent_token(token)
    return await RuntimeToolHub().execute_tool(
        payload.tool,
        payload.args,
        allowed_names=payload.allowed_names(),
    )
