"""Agent-side callback endpoints with request-scoped tool authorization."""

from __future__ import annotations

import secrets
from typing import Annotated, Any, Literal

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, Field
from starlette.requests import Request

from app.application.agent.runtime_tool_hub import RuntimeToolHub
from app.application.agent.types import ToolExecutionResult, ToolManifest
from app.application.ports.run_repository import IRunRepository
from app.config import get_settings
from app.domain.animation_tools import AnimationToolInfo, AnimationToolIssue
from app.domain.models.cir import LayerSpec
from app.presentation.dependencies import get_run_repo
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
    # Empty / omitted → empty set (deny non-internal). Never open all tools.
    allowed_tools: list[str] = Field(default_factory=list, max_length=256)

    def allowed_names(self) -> set[str]:
        """Return the client-supplied allowlist.

        Empty list and omitted field both yield an empty set so execute/expand
        endpoints are fail-closed. ``"*"`` is not expanded here; the hub treats
        it as a normal name (never a superuser grant for external callers).
        """
        return set(self.allowed_tools)


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
    """Fail closed: agent routes require a configured non-empty shared token."""
    expected = (get_settings().agent_shared_token or "").strip()
    if not expected:
        raise HTTPException(
            status_code=401,
            detail="agent shared token is not configured",
        )
    if token and secrets.compare_digest(token, expected):
        return
    raise HTTPException(status_code=401, detail="missing or invalid agent token")


async def _server_tool_inventory(
    run_repo: IRunRepository,
    run_id: str | None,
) -> set[str]:
    """Load the authoritative tool inventory for a pipeline run.

    Source of truth is the persisted CoverageDecision.available_tool_ids.
    Missing/unknown runs yield an empty inventory (deny non-internal tools).
    """
    normalized = (run_id or "").strip()
    if not normalized:
        return set()
    run = await run_repo.get(normalized)
    if run is None or run.coverage_decision is None:
        return set()
    inventory = set(run.coverage_decision.available_tool_ids)
    # Sidecar list/expand are co-required when coverage grants expand.
    if "animation_tool.expand" in inventory:
        inventory.add("animation_tool.list")
    if "scene_blueprint.compile" in inventory:
        inventory.add("scene_sequence_blueprint.compile")
    return inventory


async def _effective_allowed_names(
    run_repo: IRunRepository,
    payload: AuthorizedToolRequest,
) -> set[str]:
    """Intersect client claims with server inventory; client cannot widen."""
    server = await _server_tool_inventory(run_repo, payload.run_id)
    client = {name for name in payload.allowed_names() if name and name != "*"}
    if not client:
        return server
    return server & client


@router.post("/assert/orientation", response_model=OrientationResponse)
@write_limit()
async def assert_orientation(
    request: Request,
    payload: OrientationRequest,
    token: Annotated[str | None, Header(alias="X-MetaView-Agent-Token")] = None,
) -> OrientationResponse:
    del request
    _require_agent_token(token)
    # Trusted internal path: assert routes do not accept a client allowlist.
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
    token: Annotated[str | None, Header(alias="X-MetaView-Agent-Token")] = None,
) -> PointOnCurveResponse:
    del request
    _require_agent_token(token)
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
    token: Annotated[str | None, Header(alias="X-MetaView-Agent-Token")] = None,
) -> MonotonicResponse:
    del request
    _require_agent_token(token)
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
    run_repo: Annotated[IRunRepository, Depends(get_run_repo)],
    token: Annotated[str | None, Header(alias="X-MetaView-Agent-Token")] = None,
) -> AnimationToolExpandResponse:
    del request
    _require_agent_token(token)
    allowed = await _effective_allowed_names(run_repo, payload)
    result = await RuntimeToolHub().execute_tool(
        "animation_tool.expand",
        {"tool": payload.tool, "args": payload.args},
        allowed_names=allowed,
    )
    if not result.ok:
        status = (
            403
            if isinstance(result.error, dict)
            and result.error.get("code") == "runtime_tool.capability_denied"
            else 400
        )
        raise HTTPException(status_code=status, detail=result.error)
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
    run_repo: Annotated[IRunRepository, Depends(get_run_repo)],
    token: Annotated[str | None, Header(alias="X-MetaView-Agent-Token")] = None,
) -> ToolExecutionResult:
    del request
    _require_agent_token(token)
    allowed = await _effective_allowed_names(run_repo, payload)
    return await RuntimeToolHub().execute_tool(
        payload.tool,
        payload.args,
        allowed_names=allowed,
    )
