from __future__ import annotations

import pytest

from app.domain.models.playbook import PlaybookScript
from app.domain.services.scene_blueprint_compiler import compile_scene_blueprint_to_playbook


@pytest.mark.parametrize(
    ("scene_type", "subject", "snapshot_kind", "pack_id"),
    [
        ("east_asia_monsoon", "geography", "geo_map_scene", "geography-earth-basic"),
        ("projectile_motion", "physics", "physics_force_scene", "physics-basic"),
        ("cell_structure", "biology", "bio_cell_scene", "biology-basic"),
        ("molecule_2d_water", "chemistry", "molecule_2d_scene", "chemistry-basic"),
        ("derivative_tangent", "math", "math_plot", "math-basic"),
        ("bfs_graph", "algorithm", "graph_scene", "algorithm-code-basic"),
    ],
)
def test_scene_blueprint_compiler_builds_asset_backed_playbook(
    scene_type: str,
    subject: str,
    snapshot_kind: str,
    pack_id: str,
) -> None:
    playbook = compile_scene_blueprint_to_playbook(
        {
            "id": scene_type,
            "subject": subject,
            "sceneType": scene_type,
            "title": scene_type.replace("_", " ").title(),
            "visualIntent": ["use_semantic_assets", "compile_deterministic_layout"],
            "emphasisPoints": ["asset", "layout"],
        },
    )

    assert isinstance(playbook, PlaybookScript)
    assert playbook.domain == subject
    assert playbook.algorithm_id == scene_type
    assert playbook.initial_data["scene_blueprint"] == [scene_type]
    assert playbook.initial_data["visual_intent"] == [
        "use_semantic_assets",
        "compile_deterministic_layout",
    ]
    assert 8 <= len(playbook.steps) <= 14

    for step in playbook.steps:
        snapshot = step.snapshot.model_dump(mode="json", by_alias=True)
        assert snapshot["kind"] == snapshot_kind
        assert snapshot["pack_id"] == pack_id
        assert step.layers[0].body == step.snapshot

    serialized = playbook.model_dump(mode="json", by_alias=True)
    assert "algorithm_array" not in str(serialized)


def test_scene_blueprint_compiler_preserves_flagship_asset_markers() -> None:
    cases = {
        "east_asia_monsoon": ("layers", "asset_id", "east-asia-land-110m"),
        "projectile_motion": ("objects", "asset_id", "projectile-body-dot"),
        "cell_structure": ("structures", "asset_id", "nucleus"),
        "molecule_2d_water": ("atoms", "asset_id", "atom-core"),
        "derivative_tangent": ("", "asset_id", "derivative-tangent-preset"),
        "bfs_graph": ("", "asset_id", "bfs-graph-preset"),
    }

    for scene_type, (collection_name, field_name, expected_value) in cases.items():
        playbook = compile_scene_blueprint_to_playbook(
            {
                "id": scene_type,
                "subject": _subject_for(scene_type),
                "sceneType": scene_type,
                "title": scene_type,
                "visualIntent": ["asset_resolution"],
            },
        )
        assert 8 <= len(playbook.steps) <= 14
        snapshot = playbook.steps[0].snapshot.model_dump(mode="json", by_alias=True)

        if collection_name:
            assert any(
                item.get(field_name) == expected_value for item in snapshot[collection_name]
            ), scene_type
        else:
            assert snapshot[field_name] == expected_value


def _subject_for(scene_type: str) -> str:
    return {
        "bfs_graph": "algorithm",
        "cell_structure": "biology",
        "derivative_tangent": "math",
        "east_asia_monsoon": "geography",
        "molecule_2d_water": "chemistry",
        "projectile_motion": "physics",
    }[scene_type]
