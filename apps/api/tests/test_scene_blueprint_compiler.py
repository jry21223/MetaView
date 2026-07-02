from __future__ import annotations

import json
from pathlib import Path

import pytest

from app.domain.models.playbook import PlaybookScript
from app.domain.models.review import PlaybookReviewStatus
from app.domain.services.molecule_preset_resolver import (
    resolve_molecule_preset_by_smiles_for_renderer,
    resolve_molecule_preset_for_renderer,
)
from app.domain.services.playbook_quality import self_check_playbook
from app.domain.services.scene_blueprint_compiler import compile_scene_blueprint_to_playbook

CHEMISTRY_CONTRACT_ROOT = (
    Path(__file__).resolve().parents[3]
    / "apps"
    / "web"
    / "public"
    / "assets"
    / "metaview-kits"
    / "chemistry-basic"
    / "contracts"
)


def _read_chemistry_contract(contract_name: str) -> dict:
    return json.loads(
        (CHEMISTRY_CONTRACT_ROOT / f"{contract_name}.contract.json").read_text(
            encoding="utf-8"
        )
    )


def _element_counts(atoms: list[dict]) -> dict[str, int]:
    counts: dict[str, int] = {}
    for atom in atoms:
        element = str(atom["element"])
        counts[element] = counts.get(element, 0) + 1
    return counts


GLUCOSE_SMILES = str(_read_chemistry_contract("glucose")["smiles"])


@pytest.mark.parametrize(
    ("scene_type", "subject", "snapshot_kind", "pack_id"),
    [
        ("east_asia_monsoon", "geography", "geo_map_scene", "geography-earth-basic"),
        ("projectile_motion", "physics", "physics_force_scene", "physics-basic"),
        ("cell_structure", "biology", "bio_cell_scene", "biology-basic"),
        ("dna_replication", "biology", "bio_process_scene", "biology-basic"),
        ("molecule_2d_water", "chemistry", "molecule_2d_scene", "chemistry-basic"),
        ("molecule_2d_methane", "chemistry", "molecule_2d_scene", "chemistry-basic"),
        ("molecule_2d_glucose", "chemistry", "molecule_2d_scene", "chemistry-basic"),
        ("reaction_synthesis_water", "chemistry", "reaction_scene", "chemistry-basic"),
        ("derivative_tangent", "math", "math_plot", "math-basic"),
        ("bfs_graph", "algorithm", "graph_scene", "algorithm-code-basic"),
        ("recursion_stack", "algorithm", "call_stack_scene", "algorithm-code-basic"),
        ("binary_search", "algorithm", "code_trace_scene", "algorithm-code-basic"),
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
        "molecule_2d_methane": ("atoms", "asset_id", "atom-core"),
        "molecule_2d_glucose": ("atoms", "asset_id", "atom-core"),
        "reaction_synthesis_water": ("arrows", "asset_id", "reaction-arrow"),
        "derivative_tangent": ("", "asset_id", "derivative-tangent-preset"),
        "bfs_graph": ("", "asset_id", "bfs-graph-preset"),
        "recursion_stack": ("", "asset_id", "recursion-stack-preset"),
        "binary_search": ("", "asset_id", "binary-search-trace-preset"),
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


def test_scene_blueprint_compiler_builds_geography_from_structured_layout_input() -> None:
    playbook = compile_scene_blueprint_to_playbook(
        {
            "id": "east_asia_custom_flow",
            "subject": "geography",
            "sceneType": "east_asia_monsoon",
            "title": "Custom monsoon flow",
            "visualIntent": ["seasonal_wind_reversal", "land_sea_thermal_contrast"],
            "emphasisPoints": ["custom flow", "custom pressure"],
            "mapRegion": "east_asia",
            "flows": [
                {
                    "id": "winter-monsoon",
                    "semanticRole": "wind",
                    "from": [35, 30],
                    "to": [76, 64],
                    "label": "winter monsoon",
                    "strength": 0.8,
                },
            ],
            "pressureCenters": [
                {"id": "siberian-high", "kind": "high", "x": 34, "y": 28, "label": "Siberian high"},
                {"id": "pacific-low", "kind": "low", "x": 72, "y": 66, "label": "Pacific low"},
            ],
            "particlePreset": "wind_stream",
        },
    )

    snapshot = playbook.steps[0].snapshot.model_dump(mode="json", by_alias=True)

    assert snapshot["kind"] == "geo_map_scene"
    assert snapshot["pack_id"] == "geography-earth-basic"
    assert snapshot["map_region"] == "east_asia"
    assert snapshot["flows"] == [
        {
            "id": "winter-monsoon",
            "semantic_role": "wind",
            "from": [35.0, 30.0],
            "to": [76.0, 64.0],
            "label": "winter monsoon",
            "asset_id": "monsoon-wind-arrow",
            "strength": 0.8,
        }
    ]
    assert [center["id"] for center in snapshot["pressure_centers"]] == [
        "siberian-high",
        "pacific-low",
    ]
    assert snapshot["particle_preset"] == "wind_stream"

    verdict = self_check_playbook(playbook, "Trace East Asia monsoon flow.")
    assert verdict.status == PlaybookReviewStatus.CLEAN


def test_scene_blueprint_compiler_builds_physics_from_structured_layout_input() -> None:
    playbook = compile_scene_blueprint_to_playbook(
        {
            "id": "projectile_custom_layout",
            "subject": "physics",
            "sceneType": "projectile_motion",
            "title": "Custom projectile layout",
            "visualIntent": ["projectile_motion", "velocity_decomposition"],
            "emphasisPoints": ["block object", "custom vector", "custom trajectory"],
            "object": {"id": "cart", "label": "block", "semanticRole": "block", "x": 24, "y": 36, "radius": 8},
            "vectors": [
                {"id": "push", "target": "cart", "semanticRole": "force", "dx": 24, "dy": -6, "label": "F_push"},
                {"id": "gravity", "target": "cart", "semanticRole": "acceleration", "dx": 0, "dy": 28, "label": "g"},
            ],
            "trajectory": [[20, 30], [34, 35], [48, 46], [62, 63]],
            "formulaLatex": "x=v_xt,\\quad y=y_0+\\frac12gt^2",
        },
    )

    snapshot = playbook.steps[0].snapshot.model_dump(mode="json", by_alias=True)

    assert snapshot["kind"] == "physics_force_scene"
    assert snapshot["pack_id"] == "physics-basic"
    assert snapshot["objects"][0] == {
        "id": "cart",
        "label": "block",
        "x": 24.0,
        "y": 36.0,
        "asset_id": "block-body",
        "radius": 8.0,
    }
    assert [vector["id"] for vector in snapshot["vectors"]] == ["push", "gravity"]
    assert snapshot["trajectory"] == [[20.0, 30.0], [34.0, 35.0], [48.0, 46.0], [62.0, 63.0]]
    assert snapshot["formula_latex"] == "x=v_xt,\\quad y=y_0+\\frac12gt^2"

    verdict = self_check_playbook(playbook, "Trace projectile motion vectors.")
    assert verdict.status == PlaybookReviewStatus.CLEAN


def test_scene_blueprint_compiler_builds_biology_from_structured_layout_input() -> None:
    playbook = compile_scene_blueprint_to_playbook(
        {
            "id": "custom_cell_layout",
            "subject": "biology",
            "sceneType": "cell_structure",
            "title": "Custom cell layout",
            "visualIntent": ["show_cell_structure", "use_structured_layout"],
            "cellType": "plant",
            "structures": [
                {"id": "cell-wall", "semanticRole": "cell", "label": "cell wall", "x": 48, "y": 52, "width": 72, "height": 54},
                {"id": "nucleus", "semanticRole": "nucleus", "label": "nucleus", "x": 38, "y": 44, "width": 18, "height": 16},
                {
                    "id": "mitochondrion-right",
                    "semanticRole": "mitochondrion",
                    "label": "mitochondrion",
                    "x": 65,
                    "y": 60,
                    "width": 14,
                    "height": 9,
                },
            ],
            "callouts": [
                {"id": "nucleus-note", "targetId": "nucleus", "label": "controls gene expression", "side": "left"},
            ],
        },
    )

    snapshot = playbook.steps[0].snapshot.model_dump(mode="json", by_alias=True)

    assert snapshot["kind"] == "bio_cell_scene"
    assert snapshot["pack_id"] == "biology-basic"
    assert snapshot["cell_type"] == "plant"
    assert snapshot["structures"] == [
        {"id": "cell-wall", "semantic_role": "cell", "label": "cell wall", "x": 48.0, "y": 52.0, "width": 72.0, "height": 54.0, "asset_id": "cell-outline"},
        {"id": "nucleus", "semantic_role": "nucleus", "label": "nucleus", "x": 38.0, "y": 44.0, "width": 18.0, "height": 16.0, "asset_id": "nucleus"},
        {
            "id": "mitochondrion-right",
            "semantic_role": "mitochondrion",
            "label": "mitochondrion",
            "x": 65.0,
            "y": 60.0,
            "width": 14.0,
            "height": 9.0,
            "asset_id": "mitochondrion",
        },
    ]
    assert snapshot["callouts"] == [
        {"id": "nucleus-note", "target_id": "nucleus", "label": "controls gene expression", "side": "left"},
    ]

    verdict = self_check_playbook(playbook, "Explain custom cell layout.")
    assert verdict.status == PlaybookReviewStatus.CLEAN


def test_scene_blueprint_compiler_builds_molecule_from_structured_layout_input() -> None:
    playbook = compile_scene_blueprint_to_playbook(
        {
            "id": "carbon_dioxide",
            "subject": "chemistry",
            "sceneType": "molecule_2d_scene",
            "title": "Carbon dioxide molecule",
            "visualIntent": ["render_structured_molecule", "use_structured_layout"],
            "moleculeId": "carbon_dioxide",
            "smiles": "O=C=O",
            "atoms": [
                {"id": "o1", "element": "O", "x": 30, "y": 50, "label": "oxygen"},
                {"id": "c", "element": "C", "x": 50, "y": 50, "label": "carbon"},
                {"id": "o2", "element": "O", "x": 70, "y": 50, "label": "oxygen"},
            ],
            "bonds": [
                {"id": "o1-c", "from": "o1", "to": "c", "order": 2},
                {"id": "c-o2", "from": "c", "to": "o2", "order": 2},
            ],
            "callouts": [
                {"id": "linear", "targetId": "c", "label": "linear geometry", "side": "top"},
            ],
            "formulaLatex": "CO_2",
        },
    )

    snapshot = playbook.steps[0].snapshot.model_dump(mode="json", by_alias=True)

    assert snapshot["kind"] == "molecule_2d_scene"
    assert snapshot["pack_id"] == "chemistry-basic"
    assert snapshot["molecule_id"] == "carbon_dioxide"
    assert snapshot["smiles"] == "O=C=O"
    assert snapshot["atoms"] == [
        {"id": "o1", "element": "O", "x": 30.0, "y": 50.0, "charge": None, "label": "oxygen", "asset_id": "atom-core"},
        {"id": "c", "element": "C", "x": 50.0, "y": 50.0, "charge": None, "label": "carbon", "asset_id": "atom-core"},
        {"id": "o2", "element": "O", "x": 70.0, "y": 50.0, "charge": None, "label": "oxygen", "asset_id": "atom-core"},
    ]
    assert snapshot["bonds"] == [
        {"id": "o1-c", "from": "o1", "to": "c", "order": 2, "label": None, "asset_id": "bond-line"},
        {"id": "c-o2", "from": "c", "to": "o2", "order": 2, "label": None, "asset_id": "bond-line"},
    ]
    assert snapshot["callouts"] == [
        {"id": "linear", "target_id": "c", "label": "linear geometry", "side": "top"},
    ]
    assert snapshot["formula_latex"] == "CO_2"

    verdict = self_check_playbook(playbook, "Explain carbon dioxide structure.")
    assert verdict.status == PlaybookReviewStatus.CLEAN


def test_scene_blueprint_compiler_hydrates_water_from_molecule_preset() -> None:
    contract = _read_chemistry_contract("water")
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

    assert snapshot["molecule_id"] == contract["moleculeId"]
    assert snapshot["molecule_asset_id"] == contract["assetId"]
    assert snapshot["formula_latex"] == contract["formulaLatex"]
    assert _element_counts(snapshot["atoms"]) == contract["elementCounts"]
    assert len(snapshot["bonds"]) >= contract["minBondCount"]
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


def test_scene_blueprint_compiler_hydrates_methane_from_smiles_preset() -> None:
    contract = _read_chemistry_contract("methane")
    preset = resolve_molecule_preset_by_smiles_for_renderer(
        "chemistry-basic", contract["smiles"]
    )
    assert preset is not None

    playbook = compile_scene_blueprint_to_playbook(
        {
            "id": "molecule_2d_methane",
            "subject": "chemistry",
            "sceneType": "molecule_2d_methane",
            "title": "Methane molecule",
            "visualIntent": ["render_structured_molecule", "show_tetrahedral_geometry"],
            "smiles": contract["smiles"],
        },
    )

    snapshot = playbook.steps[0].snapshot.model_dump(mode="json", by_alias=True)

    assert snapshot["kind"] == "molecule_2d_scene"
    assert snapshot["pack_id"] == "chemistry-basic"
    assert snapshot["molecule_id"] == contract["moleculeId"]
    assert snapshot["smiles"] == contract["smiles"]
    assert snapshot["molecule_asset_id"] == contract["assetId"]
    assert snapshot["formula_latex"] == contract["formulaLatex"]
    assert _element_counts(snapshot["atoms"]) == contract["elementCounts"]
    assert len(snapshot["bonds"]) >= contract["minBondCount"]
    assert snapshot["atoms"] == [
        {**atom.model_dump(mode="json"), "asset_id": "atom-core"} for atom in preset.atoms
    ]
    assert snapshot["bonds"] == [
        {**bond.model_dump(mode="json", by_alias=True), "asset_id": "bond-line"}
        for bond in preset.bonds
    ]

    verdict = self_check_playbook(playbook, "Explain methane molecule geometry.")
    assert verdict.status == PlaybookReviewStatus.CLEAN


def test_scene_blueprint_compiler_builds_glucose_from_rdkit_smiles() -> None:
    playbook = compile_scene_blueprint_to_playbook(
        {
            "id": "molecule_2d_glucose",
            "subject": "chemistry",
            "sceneType": "molecule_2d_glucose",
            "title": "Glucose molecule",
            "visualIntent": ["render_structured_molecule", "use_rdkit_smiles"],
            "emphasisPoints": ["SMILES", "atoms", "bonds"],
            "smiles": GLUCOSE_SMILES,
        },
    )

    snapshot = playbook.steps[0].snapshot.model_dump(mode="json", by_alias=True)

    assert snapshot["kind"] == "molecule_2d_scene"
    assert snapshot["pack_id"] == "chemistry-basic"
    assert snapshot["molecule_id"] == "glucose"
    assert snapshot["smiles"] == GLUCOSE_SMILES
    assert snapshot["molecule_asset_id"] == "rdkit-smiles-glucose"
    assert snapshot["formula_latex"] == "C_6H_12O_6"
    assert len(snapshot["atoms"]) == 12
    assert len(snapshot["bonds"]) >= 12
    assert {atom["element"] for atom in snapshot["atoms"]} == {"C", "O"}
    assert all(atom["asset_id"] == "atom-core" for atom in snapshot["atoms"])
    assert all(bond["asset_id"] == "bond-line" for bond in snapshot["bonds"])

    verdict = self_check_playbook(playbook, "Explain glucose molecule from SMILES.")
    assert verdict.status == PlaybookReviewStatus.CLEAN


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


def test_scene_blueprint_compiler_builds_recursion_call_stack_scene() -> None:
    playbook = compile_scene_blueprint_to_playbook(
        {
            "id": "recursion_stack",
            "subject": "algorithm",
            "sceneType": "recursion_stack",
            "title": "Recursion stack",
            "visualIntent": ["show_call_stack", "highlight_active_line"],
            "emphasisPoints": ["active call frame", "pending multiplication"],
        },
    )

    snapshot = playbook.steps[0].snapshot.model_dump(mode="json", by_alias=True)

    assert snapshot["kind"] == "call_stack_scene"
    assert snapshot["pack_id"] == "algorithm-code-basic"
    assert snapshot["asset_id"] == "recursion-stack-preset"
    assert snapshot["current_frame_id"] == "factorial-4"
    assert [frame["asset_id"] for frame in snapshot["frames"]] == [
        "call-frame",
        "stack-frame",
        "stack-frame",
    ]
    assert snapshot["frames"][0]["variables"] == {"n": "4"}
    assert snapshot["code_trace"]["asset_id"] == "active-line"
    assert snapshot["code_trace"]["active_lines"] == [3]
    assert "factorial(n - 1)" in snapshot["code_trace"]["lines"][3]
    assert playbook.steps[0].code_highlight is not None
    assert playbook.steps[0].code_highlight.active_line == 3

    verdict = self_check_playbook(playbook, "Trace factorial recursion stack.")
    assert verdict.status == PlaybookReviewStatus.CLEAN


def test_scene_blueprint_compiler_builds_bfs_graph_from_structured_input() -> None:
    playbook = compile_scene_blueprint_to_playbook(
        {
            "id": "bfs_graph_custom",
            "subject": "algorithm",
            "sceneType": "bfs_graph",
            "title": "BFS custom graph",
            "visualIntent": ["show_graph_traversal", "show_queue_state"],
            "emphasisPoints": ["current node", "queue", "visited set"],
            "graphNodes": [
                {"id": "root", "label": "R", "x": -2, "y": 0},
                {"id": "left", "label": "L", "x": 0, "y": -1},
                {"id": "right", "label": "Q", "x": 2, "y": 1},
            ],
            "graphEdges": [
                {"id": "root-left", "source": "root", "target": "left"},
                {"id": "root-right", "source": "root", "target": "right"},
            ],
            "currentNodeId": "left",
            "visitedNodeIds": ["root"],
            "queueNodeIds": ["right"],
            "activeEdgeIds": ["root-left"],
        },
    )

    snapshot = playbook.steps[0].snapshot.model_dump(mode="json", by_alias=True)

    assert snapshot["kind"] == "graph_scene"
    assert [node["id"] for node in snapshot["nodes"]] == ["root", "left", "right"]
    assert [edge["id"] for edge in snapshot["edges"]] == ["root-left", "root-right"]
    assert snapshot["current_node_id"] == "left"
    assert snapshot["visited_node_ids"] == ["root"]
    assert snapshot["queue_node_ids"] == ["right"]
    assert snapshot["active_edge_ids"] == ["root-left"]

    verdict = self_check_playbook(playbook, "Trace BFS graph state.")
    assert verdict.status == PlaybookReviewStatus.CLEAN


def test_scene_blueprint_compiler_builds_binary_search_code_trace_scene() -> None:
    playbook = compile_scene_blueprint_to_playbook(
        {
            "id": "binary_search",
            "subject": "algorithm",
            "sceneType": "binary_search",
            "title": "Binary search",
            "visualIntent": ["show_search_window", "highlight_midpoint", "trace_branch"],
            "emphasisPoints": ["low pointer", "mid pointer", "high pointer"],
        },
    )

    snapshot = playbook.steps[0].snapshot.model_dump(mode="json", by_alias=True)

    assert snapshot["kind"] == "code_trace_scene"
    assert snapshot["pack_id"] == "algorithm-code-basic"
    assert snapshot["asset_id"] == "binary-search-trace-preset"
    assert snapshot["active_line_asset_id"] == "active-line"
    assert snapshot["array_values"] == ["2", "4", "7", "11", "18", "25", "31"]
    assert snapshot["active_indices"] == [3]
    assert snapshot["search_range"] == [0, 6]
    assert [pointer["id"] for pointer in snapshot["pointers"]] == ["low", "mid", "high"]
    assert {pointer["asset_id"] for pointer in snapshot["pointers"]} == {"pointer-marker"}
    assert "binarySearch" in snapshot["lines"][0]
    assert playbook.steps[0].code_highlight is not None
    assert playbook.steps[0].code_highlight.active_line == 2

    verdict = self_check_playbook(playbook, "Trace binary search midpoint narrowing.")
    assert verdict.status == PlaybookReviewStatus.CLEAN


def test_scene_blueprint_compiler_builds_binary_search_from_structured_input() -> None:
    playbook = compile_scene_blueprint_to_playbook(
        {
            "id": "binary_search_custom",
            "subject": "algorithm",
            "sceneType": "binary_search",
            "title": "Binary search custom target",
            "visualIntent": ["show_search_window", "highlight_midpoint", "trace_branch"],
            "emphasisPoints": ["low pointer", "mid pointer", "high pointer"],
            "arrayValues": ["1", "3", "8", "13", "21", "34", "55", "89"],
            "target": "21",
        },
    )

    snapshot = playbook.steps[0].snapshot.model_dump(mode="json", by_alias=True)

    assert snapshot["kind"] == "code_trace_scene"
    assert snapshot["asset_id"] == "binary-search-trace-preset"
    assert snapshot["array_values"] == ["1", "3", "8", "13", "21", "34", "55", "89"]
    assert snapshot["variables"]["target"] == "21"
    assert snapshot["search_range"] == [0, 7]
    assert [(pointer["id"], pointer["index"]) for pointer in snapshot["pointers"]] == [
        ("low", 0),
        ("mid", 3),
        ("high", 7),
    ]
    assert snapshot["active_indices"] == [3]
    assert snapshot["active_line"] == 2
    assert playbook.steps[0].code_highlight is not None
    assert playbook.steps[0].code_highlight.variables["target"] == "21"

    verdict = self_check_playbook(playbook, "Trace binary search midpoint narrowing.")
    assert verdict.status == PlaybookReviewStatus.CLEAN


def test_scene_blueprint_compiler_builds_water_synthesis_reaction_scene() -> None:
    contract = _read_chemistry_contract("reaction-synthesis-water")
    playbook = compile_scene_blueprint_to_playbook(
        {
            "id": "reaction_synthesis_water",
            "subject": "chemistry",
            "sceneType": "reaction_synthesis_water",
            "title": "Water synthesis reaction",
            "visualIntent": ["show_balanced_reaction", "show_electron_flow"],
            "emphasisPoints": ["reactants", "products", "atom conservation"],
        },
    )

    snapshot = playbook.steps[0].snapshot.model_dump(mode="json", by_alias=True)

    assert snapshot["kind"] == "reaction_scene"
    assert snapshot["pack_id"] == "chemistry-basic"
    assert snapshot["reaction_id"] == contract["reactionId"]
    assert [participant["formula_latex"] for participant in snapshot["reactants"]] == [
        *contract["reactantFormulas"],
    ]
    assert [participant["formula_latex"] for participant in snapshot["products"]] == [
        *contract["productFormulas"],
    ]
    assert {arrow["asset_id"] for arrow in snapshot["arrows"]} == {
        contract["arrowAssetId"]
    }
    assert {flow["asset_id"] for flow in snapshot["electron_flows"]} == {
        contract["electronFlowAssetId"]
    }
    assert snapshot["formula_latex"] == contract["formulaLatex"]

    verdict = self_check_playbook(playbook, "Explain water synthesis.")
    assert verdict.status == PlaybookReviewStatus.CLEAN


def test_scene_blueprint_compiler_builds_math_plot_from_structured_layout_input() -> None:
    playbook = compile_scene_blueprint_to_playbook(
        {
            "id": "cubic_tangent",
            "subject": "math",
            "sceneType": "math_plot",
            "title": "Cubic tangent",
            "visualIntent": ["show_function_curve", "highlight_tangent_slope"],
            "assetId": "derivative-tangent-preset",
            "curves": [
                {"expression": "x^3", "label": "f(x)=x^3", "emphasis": "primary", "semanticRole": "curve"},
                {"expression": "3*x - 2", "label": "tangent slope = 3", "emphasis": "accent", "semanticRole": "tangent"},
            ],
            "params": {"a": 3},
            "xMin": -2,
            "xMax": 2,
            "yMin": -4,
            "yMax": 4,
            "markerX": 1,
            "shadeFrom": 0.9,
            "shadeTo": 1.1,
            "xLabel": "x",
            "yLabel": "f(x)",
            "formulaLatex": "f'(1)=3",
            "caption": "The cubic tangent slope at x=1 is 3.",
        },
    )

    snapshot = playbook.steps[0].snapshot.model_dump(mode="json", by_alias=True)

    assert snapshot == {
        "kind": "math_plot",
        "pack_id": "math-basic",
        "asset_id": "derivative-tangent-preset",
        "curves": [
            {"expression": "x^3", "label": "f(x)=x^3", "emphasis": "primary", "semantic_role": "curve"},
            {"expression": "3*x - 2", "label": "tangent slope = 3", "emphasis": "accent", "semantic_role": "tangent"},
        ],
        "params": {"a": 3.0},
        "x_min": -2.0,
        "x_max": 2.0,
        "y_min": -4.0,
        "y_max": 4.0,
        "marker_x": 1.0,
        "shade_from": 0.9,
        "shade_to": 1.1,
        "x_label": "x",
        "y_label": "f(x)",
        "formula_latex": "f'(1)=3",
        "caption": "The cubic tangent slope at x=1 is 3.",
    }

    verdict = self_check_playbook(playbook, "Explain the cubic tangent slope.")
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
        "recursion_stack": "algorithm",
        "binary_search": "algorithm",
        "cell_structure": "biology",
        "dna_replication": "biology",
        "derivative_tangent": "math",
        "east_asia_monsoon": "geography",
        "molecule_2d_glucose": "chemistry",
        "molecule_2d_methane": "chemistry",
        "molecule_2d_water": "chemistry",
        "projectile_motion": "physics",
        "reaction_synthesis_water": "chemistry",
    }[scene_type]
