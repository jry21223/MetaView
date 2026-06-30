from __future__ import annotations

from typing import Any

from app.domain.models.playbook import (
    PhysicsForceSceneSnapshot,
    PhysicsSceneObject,
    PhysicsSceneVector,
)


def _role_asset_id(role: str) -> str:
    if role == "block":
        return "block-body"
    if role == "force":
        return "force-vector-arrow"
    if role in {"projectile", "object", "velocity"}:
        return "projectile-body-dot"
    return "projectile-body-dot"


def _number(value: Any, default: float) -> float:
    return float(value) if isinstance(value, int | float) else default


def _object(blueprint: dict[str, Any]) -> PhysicsSceneObject:
    source = blueprint.get("object") if isinstance(blueprint.get("object"), dict) else {}
    role = str(source.get("semanticRole") or source.get("semantic_role") or "projectile")
    return PhysicsSceneObject(
        id=str(source.get("id") or "body"),
        label=str(source.get("label") or role),
        x=_number(source.get("x"), 30.0),
        y=_number(source.get("y"), 42.0),
        asset_id=str(source.get("assetId") or source.get("asset_id") or _role_asset_id(role)),
        radius=_number(source.get("radius"), 0.0) if source.get("radius") is not None else None,
    )


def _default_vectors(target_id: str) -> list[PhysicsSceneVector]:
    return [
        PhysicsSceneVector(
            id="vx",
            target=target_id,
            semantic_role="velocity",
            dx=28,
            dy=0,
            label="v_x",
        ),
        PhysicsSceneVector(
            id="vy",
            target=target_id,
            semantic_role="velocity",
            dx=0,
            dy=18,
            label="v_y",
        ),
        PhysicsSceneVector(
            id="g",
            target=target_id,
            semantic_role="acceleration",
            dx=0,
            dy=24,
            label="g",
        ),
        PhysicsSceneVector(
            id="force",
            target=target_id,
            semantic_role="force",
            dx=-16,
            dy=8,
            label="F",
        ),
    ]


def _vectors(blueprint: dict[str, Any], target_id: str) -> list[PhysicsSceneVector]:
    source = blueprint.get("vectors")
    if not isinstance(source, list) or not source:
        return _default_vectors(target_id)

    vectors: list[PhysicsSceneVector] = []
    for index, vector in enumerate(source):
        if not isinstance(vector, dict):
            continue
        semantic_role = str(vector.get("semanticRole") or vector.get("semantic_role") or "force")
        vectors.append(
            PhysicsSceneVector(
                id=str(vector.get("id") or f"{semantic_role}-{index + 1}"),
                target=str(vector.get("target") or target_id),
                semantic_role=semantic_role,
                dx=_number(vector.get("dx"), 0.0),
                dy=_number(vector.get("dy"), 0.0),
                label=str(vector["label"]) if vector.get("label") is not None else None,
                magnitude=str(vector["magnitude"]) if vector.get("magnitude") is not None else None,
            )
        )
    return vectors


def _trajectory(blueprint: dict[str, Any]) -> list[tuple[float, float]]:
    source = blueprint.get("trajectory")
    if not isinstance(source, list) or not source:
        return [(18, 34), (31.5, 36.8), (45, 45), (58.5, 58.8), (72, 78)]

    points: list[tuple[float, float]] = []
    for point in source:
        if isinstance(point, list | tuple) and len(point) >= 2:
            x, y = point[0], point[1]
            if isinstance(x, int | float) and isinstance(y, int | float):
                points.append((float(x), float(y)))
    return points


def compile_physics_force_snapshot(blueprint: dict[str, Any]) -> PhysicsForceSceneSnapshot:
    object_item = _object(blueprint)
    return PhysicsForceSceneSnapshot(
        pack_id=str(blueprint.get("packId") or "physics-basic"),
        objects=[object_item],
        vectors=_vectors(blueprint, object_item.id),
        trajectory=_trajectory(blueprint),
        formula_latex=str(
            blueprint.get("formulaLatex")
            or blueprint.get("formula_latex")
            or "x=v_0t,\\quad y=\\frac12gt^2"
        ),
        caption=str(
            blueprint.get("caption")
            or "Horizontal velocity stays constant while vertical acceleration bends the path."
        ),
    )
