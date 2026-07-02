from __future__ import annotations

import json
from dataclasses import asdict
from functools import lru_cache
from pathlib import Path
from typing import Any, TypeVar

from pydantic import BaseModel, Field, FiniteFloat, StrictStr, ValidationError

from app.application.agent.types import ToolExecutionResult, ToolManifest
from app.domain.animation_tools import list_animation_tools, safe_expand_animation_call
from app.domain.models.playbook import PlaybookScript
from app.domain.services.geometry_validators import (
    check_monotonic,
    check_orientation,
    check_point_on_curve,
)
from app.domain.services.metaview_core import MetaViewCoreService
from app.domain.services.playbook_quality import self_check_playbook
from app.domain.services.scene_blueprint_compiler import compile_scene_blueprint_to_playbook
from app.domain.services.scene_blueprint_schema import (
    scene_blueprint_schema_metadata,
    scene_blueprint_tool_schema,
    validate_scene_blueprint,
)
from app.domain.skills.base import SkillExecutionContext, SkillRouteInput, SkillRouteMatch
from app.domain.skills.registry import SkillRegistry, build_default_skill_registry

ArgModelT = TypeVar("ArgModelT", bound=BaseModel)

ASSET_MANIFEST_ROOT = (
    Path(__file__).resolve().parents[5]
    / "apps"
    / "web"
    / "public"
    / "assets"
    / "metaview-kits"
)


class _OrientationArgs(BaseModel):
    expression_x: StrictStr = Field(min_length=1)
    expression_y: StrictStr = Field(min_length=1)
    t_min: FiniteFloat
    t_max: FiniteFloat


class _PassesThroughArgs(BaseModel):
    expression_x: StrictStr = Field(min_length=1)
    expression_y: StrictStr = Field(min_length=1)
    t_min: FiniteFloat
    t_max: FiniteFloat
    target_x: FiniteFloat
    target_y: FiniteFloat
    tol: FiniteFloat = 1e-2


class _MonotonicArgs(BaseModel):
    expression: StrictStr = Field(min_length=1)
    x_min: FiniteFloat
    x_max: FiniteFloat


class RuntimeToolHub:
    def __init__(self, skill_registry: SkillRegistry | None = None) -> None:
        self._skill_registry = skill_registry or build_default_skill_registry()

    def list_tools(self, route_context: dict[str, Any] | None = None) -> list[ToolManifest]:
        tools = [
            ToolManifest(
                name="skill.registry.list",
                description="List deterministic SkillPack manifests registered in MetaView.",
                args_schema={"type": "object", "properties": {}},
                domain="skill",
                deterministic=True,
            ),
            ToolManifest(
                name="playbook.schema.validate",
                description="Validate a candidate object against the PlaybookScript schema.",
                args_schema={
                    "type": "object",
                    "properties": {"playbook": {"type": "object"}},
                    "required": ["playbook"],
                },
                domain="playbook",
                deterministic=True,
            ),
            ToolManifest(
                name="playbook.self_check",
                description="Run MetaView PlaybookScript semantic and renderer self-checks.",
                args_schema={
                    "type": "object",
                    "properties": {
                        "playbook": {"type": "object"},
                        "prompt": {"type": "string"},
                    },
                    "required": ["playbook", "prompt"],
                },
                domain="playbook",
                deterministic=True,
            ),
            ToolManifest(
                name="scene_blueprint.compile",
                description=(
                    "Compile a controlled SceneBlueprint into a renderer-ready "
                    "PlaybookScript."
                ),
                args_schema={
                    "type": "object",
                    "properties": {
                        "blueprint": scene_blueprint_tool_schema(),
                    },
                    "required": ["blueprint"],
                },
                domain="scene_blueprint",
                deterministic=True,
            ),
            ToolManifest(
                name="animation_tool.list",
                description="List backend animation registry tools available to agents.",
                args_schema={"type": "object", "properties": {}},
                domain="animation",
                deterministic=True,
            ),
            ToolManifest(
                name="animation_tool.expand",
                description="Expand one backend animation registry tool into Playbook layers.",
                args_schema={
                    "type": "object",
                    "properties": {
                        "tool": {"type": "string"},
                        "args": {"type": "object"},
                    },
                    "required": ["tool"],
                },
                domain="animation",
                deterministic=True,
            ),
            ToolManifest(
                name="geometry.assert_orientation",
                description="Check parametric curve orientation using deterministic math.",
                args_schema=_OrientationArgs.model_json_schema(),
                domain="geometry",
                deterministic=True,
            ),
            ToolManifest(
                name="geometry.assert_passes_through",
                description="Check whether a parametric curve passes through a point.",
                args_schema=_PassesThroughArgs.model_json_schema(),
                domain="geometry",
                deterministic=True,
            ),
            ToolManifest(
                name="geometry.assert_monotonic",
                description="Check monotonicity of a function on an interval.",
                args_schema=_MonotonicArgs.model_json_schema(),
                domain="geometry",
                deterministic=True,
            ),
        ]
        skill_tools = [
            ToolManifest(
                name=f"skill.{manifest.skill_id}.solve",
                description=manifest.description,
                args_schema={
                    "type": "object",
                    "properties": {
                        "run_id": {"type": "string"},
                        "prompt": {"type": "string"},
                        "source_code": {"type": ["string", "null"]},
                        "language": {"type": ["string", "null"]},
                        "route_match": {"type": "object"},
                        "problem_spec": {"type": "object"},
                    },
                    "required": ["run_id", "prompt"],
                },
                domain=manifest.domain,
                deterministic=manifest.execution_mode == "deterministic",
            )
            for manifest in self._skill_registry.manifests()
        ]
        if route_context and route_context.get("skill_id"):
            skill_id = route_context["skill_id"]
            skill_tools.sort(key=lambda item: item.name != f"skill.{skill_id}.solve")
        return [*tools, *skill_tools]

    def get_tool(self, name: str) -> ToolManifest | None:
        return next((tool for tool in self.list_tools() if tool.name == name), None)

    async def execute_tool(self, name: str, args: dict[str, Any]) -> ToolExecutionResult:
        if name == "skill.registry.list":
            return self._ok(name, {
                "skills": [
                    manifest.model_dump(mode="json")
                    for manifest in self._skill_registry.manifests()
                ]
            })
        if name.startswith("skill.") and name.endswith(".solve"):
            return await self._execute_skill_tool(name, args)
        if name == "playbook.schema.validate":
            return self._validate_playbook(name, args)
        if name == "playbook.self_check":
            return self._self_check_playbook(name, args)
        if name == "scene_blueprint.compile":
            return self._compile_scene_blueprint(name, args)
        if name == "animation_tool.list":
            return self._ok(name, {
                "tools": [tool.model_dump(mode="json") for tool in list_animation_tools()]
            })
        if name == "animation_tool.expand":
            result = safe_expand_animation_call(
                str(args.get("tool", "")),
                _dict_arg(args.get("args")),
                path="runtime_tool.animation_tool.expand",
            )
            return self._ok(name, result.model_dump(mode="json"))
        if name == "geometry.assert_orientation":
            validated = self._validate_args(name, _OrientationArgs, args)
            if isinstance(validated, ToolExecutionResult):
                return validated
            result = check_orientation(
                validated.expression_x,
                validated.expression_y,
                validated.t_min,
                validated.t_max,
            )
            return self._ok(name, asdict(result))
        if name == "geometry.assert_passes_through":
            validated = self._validate_args(name, _PassesThroughArgs, args)
            if isinstance(validated, ToolExecutionResult):
                return validated
            result = check_point_on_curve(
                validated.expression_x,
                validated.expression_y,
                validated.t_min,
                validated.t_max,
                validated.target_x,
                validated.target_y,
                validated.tol,
            )
            return self._ok(name, asdict(result))
        if name == "geometry.assert_monotonic":
            validated = self._validate_args(name, _MonotonicArgs, args)
            if isinstance(validated, ToolExecutionResult):
                return validated
            result = check_monotonic(
                validated.expression,
                validated.x_min,
                validated.x_max,
            )
            return self._ok(name, asdict(result))
        return self._error(
            name,
            "runtime_tool.unknown_tool",
            f"Unknown runtime tool: {name}",
        )

    async def _execute_skill_tool(
        self,
        name: str,
        args: dict[str, Any],
    ) -> ToolExecutionResult:
        skill_id = name.removeprefix("skill.").removesuffix(".solve")
        skill = self._skill_registry.get(skill_id)
        if skill is None:
            return self._error(
                name,
                "runtime_tool.unknown_tool",
                f"Unknown SkillPack runtime tool: {name}",
            )
        prompt = str(args.get("prompt", ""))
        route_match = self._coerce_route_match(skill_id, args)
        problem_spec = None
        if isinstance(args.get("problem_spec"), dict):
            problem_spec = skill.validate_problem_spec(args["problem_spec"])
        if problem_spec is None and route_match.problem_spec:
            problem_spec = skill.validate_problem_spec(route_match.problem_spec)
        if problem_spec is None:
            heuristic = skill.heuristic_match(
                SkillRouteInput(
                    prompt=prompt,
                    source_code=_optional_str(args.get("source_code")),
                    language=_optional_str(args.get("language")),
                )
            )
            if heuristic is not None:
                route_match = heuristic
                if heuristic.problem_spec:
                    problem_spec = skill.validate_problem_spec(heuristic.problem_spec)
        result = await skill.execute(
            SkillExecutionContext(
                run_id=str(args.get("run_id", "runtime-tool")),
                prompt=prompt,
                route_match=route_match,
            ),
            problem_spec,
        )
        payload = result.model_dump(mode="json")
        if result.playbook_json:
            try:
                payload["playbook"] = PlaybookScript.model_validate_json(
                    result.playbook_json
                ).model_dump(mode="json")
            except ValidationError as exc:
                return self._error(
                    name,
                    "runtime_tool.invalid_skill_playbook",
                    f"SkillPack produced invalid PlaybookScript: {exc}",
                )
        return self._ok(name, payload)

    def _coerce_route_match(
        self,
        skill_id: str,
        args: dict[str, Any],
    ) -> SkillRouteMatch:
        route_match = args.get("route_match")
        if isinstance(route_match, dict):
            return SkillRouteMatch.model_validate(route_match)
        skill = self._skill_registry.get(skill_id)
        manifest = skill.manifest if skill is not None else None
        return SkillRouteMatch(
            skill_id=skill_id,
            domain=manifest.domain if manifest is not None else "unknown",
            confidence=1.0,
            reason="runtime_tool",
            problem_spec=_dict_arg(args.get("problem_spec")) or None,
        )

    def _validate_playbook(
        self,
        name: str,
        args: dict[str, Any],
    ) -> ToolExecutionResult:
        try:
            playbook = PlaybookScript.model_validate(args.get("playbook"))
        except ValidationError as exc:
            return self._error(
                name,
                "playbook.schema.invalid",
                "PlaybookScript schema validation failed.",
                {"errors": exc.errors()},
            )
        return self._ok(name, {"valid": True, "playbook": playbook.model_dump(mode="json")})

    def _validate_args(
        self,
        name: str,
        model: type[ArgModelT],
        args: dict[str, Any],
    ) -> ArgModelT | ToolExecutionResult:
        try:
            return model.model_validate(args)
        except ValidationError as exc:
            return self._error(
                name,
                "runtime_tool.invalid_args",
                "Runtime tool arguments are invalid.",
                {"errors": exc.errors(include_url=False)},
            )

    def _self_check_playbook(
        self,
        name: str,
        args: dict[str, Any],
    ) -> ToolExecutionResult:
        try:
            playbook = PlaybookScript.model_validate(args.get("playbook"))
        except ValidationError as exc:
            return self._error(
                name,
                "playbook.schema.invalid",
                "PlaybookScript schema validation failed.",
                {"errors": exc.errors()},
            )
        verdict = self_check_playbook(playbook, str(args.get("prompt", "")))
        return self._ok(name, verdict.model_dump(mode="json"))

    def _compile_scene_blueprint(
        self,
        name: str,
        args: dict[str, Any],
    ) -> ToolExecutionResult:
        blueprint = args.get("blueprint")
        if not isinstance(blueprint, dict):
            return self._error(
                name,
                "scene_blueprint.invalid_args",
                "scene_blueprint.compile requires a blueprint object.",
            )
        schema_errors = validate_scene_blueprint(blueprint)
        if schema_errors:
            return self._error(
                name,
                "scene_blueprint.schema_invalid",
                "SceneBlueprint schema validation failed.",
                {"errors": schema_errors},
            )
        try:
            playbook = compile_scene_blueprint_to_playbook(blueprint)
        except (ValueError, ValidationError) as exc:
            return self._error(
                name,
                "scene_blueprint.compile_failed",
                str(exc),
            )
        playbook_json = playbook.model_dump(mode="json")
        self_check = self_check_playbook(
            playbook,
            str(args.get("prompt") or blueprint.get("caption") or blueprint.get("title") or ""),
        )
        visual_quality = _metaview_core().validate_visual_quality(
            playbook_script=playbook_json,
        )
        return self._ok(
            name,
            {
                "valid": True,
                "sceneType": blueprint.get("sceneType"),
                "scene_blueprint": blueprint,
                "scene_blueprint_schema": scene_blueprint_schema_metadata(valid=True),
                "playbook": playbook_json,
                "self_check": self_check.model_dump(mode="json"),
                "visual_quality": visual_quality,
            },
        )

    def _ok(self, tool: str, result: Any) -> ToolExecutionResult:
        return ToolExecutionResult(tool=tool, ok=True, result=result)

    def _error(
        self,
        tool: str,
        code: str,
        message: str,
        extra: dict[str, Any] | None = None,
    ) -> ToolExecutionResult:
        error = {"code": code, "message": message}
        if extra:
            error.update(extra)
        return ToolExecutionResult(tool=tool, ok=False, error=error)


def _dict_arg(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _optional_str(value: Any) -> str | None:
    return value if isinstance(value, str) else None


@lru_cache
def _metaview_core() -> MetaViewCoreService:
    asset_packs: list[dict[str, Any]] = []
    for manifest_path in sorted(ASSET_MANIFEST_ROOT.glob("*/manifest.json")):
        asset_packs.append(json.loads(manifest_path.read_text(encoding="utf-8")))
    return MetaViewCoreService(asset_packs=asset_packs)
