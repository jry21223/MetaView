from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import PurePosixPath
from typing import Any

DOMAIN_CAPABILITIES: dict[str, dict[str, str]] = {
    "algorithm": {"domain": "algorithm", "support": "full", "primaryRenderer": "algorithm"},
    "code": {"domain": "code", "support": "partial", "primaryRenderer": "algorithm/code"},
    "math": {
        "domain": "math",
        "support": "full",
        "primaryRenderer": "math_scene/math_plot/math_formula",
    },
    "physics": {
        "domain": "physics",
        "support": "partial",
        "primaryRenderer": "physics_force_scene/math_scene/formula/domain_cards",
        "message": (
            "Physics has a force-scene renderer for flagship motion cases and falls back "
            "to formula/card renderers."
        ),
    },
    "chemistry": {
        "domain": "chemistry",
        "support": "fallback",
        "primaryRenderer": "domain_cards",
        "message": "Chemistry currently uses fallback concept cards.",
    },
    "biology": {
        "domain": "biology",
        "support": "fallback",
        "primaryRenderer": "domain_cards",
        "message": "Biology currently uses fallback concept cards.",
    },
    "geography": {
        "domain": "geography",
        "support": "partial",
        "primaryRenderer": "geo_map_scene/motion_scene/domain_cards",
        "message": (
            "Geography has a map-scene renderer for flagship map cases and falls back "
            "to motion/card renderers."
        ),
    },
}

FLAGSHIP_CASES_BY_SUBJECT = {
    "geography": ["east_asia_monsoon"],
    "physics": ["projectile_motion"],
}

ARRAY_FALLBACK_BLOCKED_DOMAINS = {"geography", "biology", "chemistry"}


@dataclass(frozen=True)
class MetaViewCoreService:
    asset_packs: list[dict[str, Any]]

    def list_capabilities(self) -> dict[str, Any]:
        subjects = []
        for capability in DOMAIN_CAPABILITIES.values():
            subject = capability["domain"]
            packs = [pack for pack in self.asset_packs if pack.get("subject") == subject]
            renderers = _unique_sorted(
                [
                    *_split_renderers(capability["primaryRenderer"]),
                    *[kind for pack in packs for kind in pack.get("rendererKinds", [])],
                ],
            )
            summary = {
                "id": subject,
                "support": capability["support"],
                "renderers": renderers,
                "assetPacks": [pack["packId"] for pack in packs],
                "flagshipCases": FLAGSHIP_CASES_BY_SUBJECT.get(subject, []),
            }
            if capability.get("message"):
                summary["message"] = capability["message"]
            subjects.append(summary)
        return {"generatedBy": "metaview-core", "subjects": subjects}

    def list_asset_packs(self, subject: str | None = None) -> dict[str, Any]:
        packs = [
            _pack_summary(pack)
            for pack in self.asset_packs
            if subject is None or pack.get("subject") == subject
        ]
        return {"generatedBy": "metaview-core", "packs": packs}

    def resolve_assets(
        self,
        *,
        subject: str,
        scene_type: str,
        semantic_roles: list[str],
    ) -> dict[str, Any]:
        assets: list[dict[str, Any]] = []
        missing: list[str] = []
        for semantic_role in semantic_roles:
            match = self._find_asset_by_role(subject, semantic_role)
            if match is None:
                missing.append(semantic_role)
                continue
            pack, asset = match
            assets.append(
                {
                    "semanticRole": semantic_role,
                    "assetId": asset["id"],
                    "packId": pack["packId"],
                    "resourceUri": _asset_resource_uri(pack, asset),
                    "license": asset["license"],
                    "attribution": asset.get("attribution"),
                    "commercialUseStatus": asset.get("commercialUseStatus"),
                    "sourceUrl": asset.get("sourceUrl"),
                    "licenseUrl": asset.get("licenseUrl"),
                    "modifiedFrom": asset.get("modifiedFrom"),
                },
            )
        return {
            "generatedBy": "metaview-core",
            "subject": subject,
            "sceneType": scene_type,
            "assets": assets,
            "missing": missing,
        }

    def compile_scene_blueprint(
        self,
        *,
        topic: str,
        subject: str | None = None,
        audience: str | None = None,
        duration_seconds: int | None = None,
        style: str | None = None,
        language: str | None = None,
    ) -> dict[str, Any]:
        inferred_subject = _infer_subject(topic, subject)
        normalized_topic = topic.lower()
        if inferred_subject == "geography" and re.search(
            r"季风|monsoon|海陆|风向",
            normalized_topic,
        ):
            blueprint = _monsoon_blueprint(topic, audience, duration_seconds, style, language)
        elif inferred_subject == "physics" and re.search(
            r"平抛|projectile|motion|速度|重力",
            normalized_topic,
        ):
            blueprint = _projectile_blueprint(topic, audience, duration_seconds, style, language)
        else:
            blueprint = _fallback_blueprint(
                topic,
                inferred_subject,
                audience,
                duration_seconds,
                style,
                language,
            )

        if blueprint["subject"] == "unknown":
            missing = blueprint["requiredAssets"]
        else:
            resolved = self.resolve_assets(
                subject=blueprint["subject"],
                scene_type=blueprint["sceneType"],
                semantic_roles=blueprint["requiredAssets"],
            )
            missing = resolved["missing"]
        return {
            "generatedBy": "metaview-core",
            "sceneBlueprint": blueprint,
            "warnings": [
                f'No registered asset currently resolves semantic role "{role}".'
                for role in missing
            ],
        }

    def validate_visual_quality(self, *, playbook_script: dict[str, Any]) -> dict[str, Any]:
        warnings = [
            _report_warning(warning)
            for warning in self._visual_quality_warnings(playbook_script)
        ]
        high_count = sum(1 for warning in warnings if warning["severity"] == "high")
        medium_count = sum(1 for warning in warnings if warning["severity"] == "medium")
        low_count = len(warnings) - high_count - medium_count
        score = max(0, round(1 - high_count * 0.35 - medium_count * 0.2 - low_count * 0.1, 2))
        return {
            "generatedBy": "metaview-core",
            "score": score,
            "pass": len(warnings) == 0,
            "warnings": warnings,
            "provenance": {
                "renderingContract": "PlaybookScript",
                "qualityGate": "visualQualityGate",
            },
        }

    def _find_asset_by_id(
        self,
        asset_id: str | None,
        pack_id: str | None = None,
    ) -> dict[str, Any] | None:
        if not asset_id:
            return None
        for pack in self.asset_packs:
            if pack_id and pack.get("packId") != pack_id:
                continue
            for asset in pack.get("assets", []):
                if asset.get("id") == asset_id:
                    return asset
        return None

    def _find_asset_by_role(
        self,
        subject: str,
        semantic_role: str,
    ) -> tuple[dict[str, Any], dict[str, Any]] | None:
        for pack in self.asset_packs:
            if pack.get("subject") != subject:
                continue
            for asset in pack.get("assets", []):
                if semantic_role in asset.get("semanticRoles", []):
                    return pack, asset
        return None

    def _visual_quality_warnings(self, script: dict[str, Any]) -> list[dict[str, Any]]:
        warnings: list[dict[str, Any]] = []
        domain = str(script.get("domain") or "")
        for step in script.get("steps", []):
            snapshots = [(step.get("snapshot") or {}, "snapshot")]
            for index, layer in enumerate(step.get("layers") or []):
                snapshots.append((layer.get("body") or {}, f"layers[{index}].body"))
            for snapshot, snapshot_path in snapshots:
                kind = snapshot.get("kind")
                context = {
                    "domain": domain,
                    "step_id": step.get("step_id", ""),
                    "snapshot_kind": kind,
                    "snapshot_path": snapshot_path,
                }
                if kind == "algorithm_array" and domain in ARRAY_FALLBACK_BLOCKED_DOMAINS:
                    warnings.append(
                        _warning(
                            context,
                            code="unsupported_array_fallback",
                            message=f"{domain} scenes should not fall back to algorithm_array.",
                        ),
                    )
                if kind == "geo_map_scene":
                    self._check_geo_map_scene(warnings, context, snapshot)
                if kind == "physics_force_scene":
                    self._check_physics_force_scene(warnings, context, snapshot)
        return warnings

    def _check_geo_map_scene(
        self,
        warnings: list[dict[str, Any]],
        context: dict[str, Any],
        snapshot: dict[str, Any],
    ) -> None:
        pack_id = snapshot.get("pack_id")
        if not pack_id:
            warnings.append(
                _warning(
                    context,
                    code="missing_pack_id",
                    pack_id=pack_id,
                    message=(
                        "geography geo_map_scene should declare pack_id so visual assets "
                        "resolve deterministically."
                    ),
                ),
            )
        for layer in snapshot.get("layers", []):
            self._check_asset_id(warnings, context, layer.get("asset_id"), pack_id)
        for flow in snapshot.get("flows", []):
            self._check_asset_id(warnings, context, flow.get("asset_id"), pack_id)

    def _check_physics_force_scene(
        self,
        warnings: list[dict[str, Any]],
        context: dict[str, Any],
        snapshot: dict[str, Any],
    ) -> None:
        has_object = len(snapshot.get("objects", [])) > 0
        has_vector = len(snapshot.get("vectors", [])) > 0
        has_trajectory = len(snapshot.get("trajectory", [])) > 0
        if not has_object and not has_vector and not has_trajectory:
            warnings.append(
                _warning(
                    context,
                    code="empty_physics_force_scene",
                    pack_id=snapshot.get("pack_id"),
                    message=(
                        "physics_force_scene should include at least one object, vector, "
                        "or trajectory."
                    ),
                ),
            )
        for object_item in snapshot.get("objects", []):
            self._check_asset_id(
                warnings,
                context,
                object_item.get("asset_id"),
                snapshot.get("pack_id"),
            )

    def _check_asset_id(
        self,
        warnings: list[dict[str, Any]],
        context: dict[str, Any],
        asset_id: str | None,
        pack_id: str | None,
    ) -> None:
        if not asset_id or self._find_asset_by_id(asset_id, pack_id):
            return
        warnings.append(
            _warning(
                context,
                code="missing_asset",
                asset_id=asset_id,
                pack_id=pack_id,
                message=f'Asset "{asset_id}" could not be resolved from pack "{pack_id or "any"}".',
            ),
        )


def _unique_sorted(values: list[str]) -> list[str]:
    return sorted(set(values))


def _split_renderers(primary_renderer: str) -> list[str]:
    return [item.strip() for item in primary_renderer.split("/") if item.strip()]


def _semantic_roles(pack: dict[str, Any]) -> list[str]:
    return _unique_sorted(
        [
            role
            for asset in pack.get("assets", [])
            for role in asset.get("semanticRoles", [])
        ],
    )


def _pack_summary(pack: dict[str, Any]) -> dict[str, Any]:
    return {
        "packId": pack["packId"],
        "subject": pack["subject"],
        "version": pack["version"],
        "license": pack["license"],
        "sceneTemplates": list(pack.get("sceneTemplates", [])),
        "rendererKinds": list(pack.get("rendererKinds", [])),
        "semanticRoles": _semantic_roles(pack),
        "resourceUri": f"metaview://kits/{pack['packId']}/manifest",
    }


def _asset_resource_uri(pack: dict[str, Any], asset: dict[str, Any]) -> str:
    return f"metaview://assets/{pack['packId']}/{PurePosixPath(asset['path']).name}"


def _infer_subject(topic: str, subject: str | None) -> str | None:
    if subject:
        return subject
    normalized = topic.lower()
    if re.search(r"季风|海陆|气压|风向|monsoon|climate", normalized):
        return "geography"
    if re.search(r"平抛| projectile|force|velocity|acceleration|motion|力|速度|加速度", normalized):
        return "physics"
    return None


def _blueprint_provenance() -> dict[str, str]:
    return {
        "generatedBy": "metaview-core",
        "route": "deterministic-blueprint",
        "renderingContract": "PlaybookScript",
    }


def _monsoon_blueprint(
    topic: str,
    audience: str | None,
    duration_seconds: int | None,
    style: str | None,
    language: str | None,
) -> dict[str, Any]:
    return {
        "subject": "geography",
        "sceneType": "east_asia_monsoon",
        "topic": topic,
        "audience": audience,
        "durationSeconds": duration_seconds,
        "style": style,
        "language": language,
        "visualIntent": [
            "land_ocean_thermal_contrast",
            "pressure_gradient",
            "seasonal_wind_reversal",
            "moisture_transport",
        ],
        "requiredAssets": ["land", "ocean", "wind", "pressure_high", "pressure_low"],
        "emphasisPoints": [
            "冬夏海陆温差方向相反",
            "气压梯度决定近地面风向",
            "夏季风从海洋吹向陆地并带来水汽",
        ],
        "provenance": _blueprint_provenance(),
    }


def _projectile_blueprint(
    topic: str,
    audience: str | None,
    duration_seconds: int | None,
    style: str | None,
    language: str | None,
) -> dict[str, Any]:
    return {
        "subject": "physics",
        "sceneType": "projectile_motion",
        "topic": topic,
        "audience": audience,
        "durationSeconds": duration_seconds,
        "style": style,
        "language": language,
        "visualIntent": [
            "horizontal_uniform_motion",
            "vertical_free_fall",
            "velocity_decomposition",
            "gravity_acceleration",
        ],
        "requiredAssets": ["object", "velocity", "force"],
        "emphasisPoints": [
            "水平方向速度保持不变",
            "竖直方向只受重力并做自由落体",
            "轨迹由两个独立分运动叠加形成",
        ],
        "provenance": _blueprint_provenance(),
    }


def _fallback_blueprint(
    topic: str,
    subject: str | None,
    audience: str | None,
    duration_seconds: int | None,
    style: str | None,
    language: str | None,
) -> dict[str, Any]:
    normalized_subject = subject or "unknown"
    capability = DOMAIN_CAPABILITIES.get(
        normalized_subject,
        {
            "domain": normalized_subject,
            "support": "fallback",
            "primaryRenderer": "domain_cards",
            "message": "This domain currently uses fallback concept cards.",
        },
    )
    return {
        "subject": normalized_subject,
        "sceneType": capability["primaryRenderer"].split("/")[0] or "domain_cards",
        "topic": topic,
        "audience": audience,
        "durationSeconds": duration_seconds,
        "style": style,
        "language": language,
        "visualIntent": ["explain_core_concept", "show_key_relationships"],
        "requiredAssets": [],
        "emphasisPoints": [topic],
        "provenance": _blueprint_provenance(),
    }


def _warning(context: dict[str, Any], **warning: Any) -> dict[str, Any]:
    return {
        "step_id": context["step_id"],
        "snapshot_kind": context["snapshot_kind"],
        "snapshot_path": context["snapshot_path"],
        "domain": context["domain"],
        **warning,
    }


def _warning_severity(code: str) -> str:
    if code in {"missing_pack_id", "unsupported_array_fallback"}:
        return "high"
    if code in {"missing_asset", "empty_physics_force_scene"}:
        return "medium"
    return "low"


def _report_warning(warning: dict[str, Any]) -> dict[str, Any]:
    return {
        "severity": _warning_severity(warning["code"]),
        "code": warning["code"],
        "message": warning["message"],
        "stepId": warning["step_id"],
        "snapshotKind": warning["snapshot_kind"],
        "path": warning["snapshot_path"],
    }
