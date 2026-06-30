from __future__ import annotations

import pytest

from app.domain.models.playbook import PlaybookScript
from app.domain.models.review import PlaybookReviewStatus
from app.domain.services.molecule_preset_resolver import resolve_molecule_preset_for_renderer
from app.domain.services.playbook_quality import self_check_playbook
from app.domain.services.scene_blueprint_compiler import compile_scene_blueprint_to_playbook


@pytest.mark.parametrize(
    ("scene_type", "subject", "snapshot_kind", "pack_id"),
    [
        ("east_asia_monsoon", "geography", "geo_map_scene", "geography-earth-basic"),
        ("projectile_motion", "physics", "physics_force_scene", "physics-basic"),
        ("cell_structure", "biology", "bio_cell_scene", "biology-basic"),
        ("dna_replication", "biology", "bio_process_scene", "biology-basic"),
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
        "dna_replication": ("steps", "asset_id", "replication-fork"),
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


def test_scene_blueprint_compiler_hydrates_water_from_molecule_preset() -> None:
    preset = resolve_molecule_preset_for_renderer("chemistry-basic", "water")
    assert preset is not None

    playbook = compile_scene_blueprint_to_playbook(
        {
            "id": "molecule_2d_water",
            "subject": "chemistry",
            "sceneType": "molecule_2d_water",
            "title": "Water molecule",
            "visualIntent": ["render_structured_molecule"],
        },
    )

    snapshot = playbook.steps[0].snapshot.model_dump(mode="json", by_alias=True)

    assert snapshot["molecule_asset_id"] == preset.molecule_asset_id
    assert snapshot["formula_latex"] == preset.formula_latex
    assert snapshot["caption"] == preset.caption
    assert snapshot["callouts"] == [
        callout.model_dump(mode="json") for callout in preset.callouts
    ]
    assert snapshot["atoms"] == [
        {**atom.model_dump(mode="json"), "asset_id": "atom-core"} for atom in preset.atoms
    ]
    assert snapshot["bonds"] == [
        {**bond.model_dump(mode="json", by_alias=True), "asset_id": "bond-line"}
        for bond in preset.bonds
    ]


def test_scene_blueprint_compiler_builds_dna_replication_process_scene() -> None:
    playbook = compile_scene_blueprint_to_playbook(
        {
            "id": "dna_replication",
            "subject": "biology",
            "sceneType": "dna_replication",
            "title": "DNA replication",
            "visualIntent": ["show_process_steps", "show_complementary_base_pairing"],
            "emphasisPoints": ["template DNA", "replication fork", "new strands"],
        },
    )

    snapshot = playbook.steps[0].snapshot.model_dump(mode="json", by_alias=True)

    assert snapshot["kind"] == "bio_process_scene"
    assert snapshot["pack_id"] == "biology-basic"
    assert snapshot["process_id"] == "dna_replication"
    assert [step["asset_id"] for step in snapshot["steps"]] == [
        "dna-helix",
        "replication-fork",
        "dna-helix",
    ]
    assert {connection["asset_id"] for connection in snapshot["connections"]} == {
        "core-flow-arrow"
    }
    assert snapshot["callouts"][0]["target_id"] == "fork"
    assert "base pairing" in snapshot["callouts"][0]["label"]

    verdict = self_check_playbook(playbook, "Explain DNA replication.")
    assert verdict.status == PlaybookReviewStatus.CLEAN


@pytest.mark.parametrize(
    ("scene_type", "subject", "prompt"),
    [
        ("east_asia_monsoon", "geography", "讲解东亚夏季风的海陆热力差异"),
        ("projectile_motion", "physics", "讲解平抛运动的速度分解和重力加速度"),
    ],
)
def test_scene_blueprint_compiler_outputs_launch_safe_self_check_clean_playbooks(
    scene_type: str,
    subject: str,
    prompt: str,
) -> None:
    playbook = compile_scene_blueprint_to_playbook(
        {
            "id": scene_type,
            "subject": subject,
            "sceneType": scene_type,
            "title": scene_type,
        },
    )

    verdict = self_check_playbook(playbook, prompt)

    assert verdict.status == PlaybookReviewStatus.CLEAN


def _subject_for(scene_type: str) -> str:
    return {
        "bfs_graph": "algorithm",
        "cell_structure": "biology",
        "dna_replication": "biology",
        "derivative_tangent": "math",
        "east_asia_monsoon": "geography",
        "molecule_2d_water": "chemistry",
        "projectile_motion": "physics",
    }[scene_type]
