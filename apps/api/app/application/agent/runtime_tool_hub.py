from __future__ import annotations

from dataclasses import asdict
from typing import Any

from pydantic import ValidationError

from app.application.agent.types import ToolExecutionResult, ToolManifest
from app.domain.animation_tools import list_animation_tools, safe_expand_animation_call
from app.domain.models.playbook import PlaybookScript
from app.domain.services.geometry_validators import (
    check_monotonic,
    check_orientation,
    check_point_on_curve,
)
from app.domain.services.playbook_quality import self_check_playbook
from app.domain.skills.base import SkillExecutionContext, SkillRouteInput, SkillRouteMatch
from app.domain.skills.registry import SkillRegistry, build_default_skill_registry


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
                args_schema={
                    "type": "object",
                    "properties": {
                        "expression_x": {"type": "string"},
                        "expression_y": {"type": "string"},
                        "t_min": {"type": "number"},
                        "t_max": {"type": "number"},
                    },
                    "required": ["expression_x", "expression_y", "t_min", "t_max"],
                },
                domain="geometry",
                deterministic=True,
            ),
            ToolManifest(
                name="geometry.assert_passes_through",
                description="Check whether a parametric curve passes through a point.",
                args_schema={
                    "type": "object",
                    "properties": {
                        "expression_x": {"type": "string"},
                        "expression_y": {"type": "string"},
                        "t_min": {"type": "number"},
                        "t_max": {"type": "number"},
                        "target_x": {"type": "number"},
                        "target_y": {"type": "number"},
                        "tol": {"type": "number"},
                    },
                    "required": [
                        "expression_x",
                        "expression_y",
                        "t_min",
                        "t_max",
                        "target_x",
                        "target_y",
                    ],
                },
                domain="geometry",
                deterministic=True,
            ),
            ToolManifest(
                name="geometry.assert_monotonic",
                description="Check monotonicity of a function on an interval.",
                args_schema={
                    "type": "object",
                    "properties": {
                        "expression": {"type": "string"},
                        "x_min": {"type": "number"},
                        "x_max": {"type": "number"},
                    },
                    "required": ["expression", "x_min", "x_max"],
                },
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
            result = check_orientation(
                str(args.get("expression_x", "")),
                str(args.get("expression_y", "")),
                float(args.get("t_min")),
                float(args.get("t_max")),
            )
            return self._ok(name, asdict(result))
        if name == "geometry.assert_passes_through":
            result = check_point_on_curve(
                str(args.get("expression_x", "")),
                str(args.get("expression_y", "")),
                float(args.get("t_min")),
                float(args.get("t_max")),
                float(args.get("target_x")),
                float(args.get("target_y")),
                float(args.get("tol", 1e-2)),
            )
            return self._ok(name, asdict(result))
        if name == "geometry.assert_monotonic":
            result = check_monotonic(
                str(args.get("expression", "")),
                float(args.get("x_min")),
                float(args.get("x_max")),
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
