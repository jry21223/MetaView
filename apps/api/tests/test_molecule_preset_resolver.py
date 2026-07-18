from __future__ import annotations

from app.domain.services.molecule_preset_resolver import (
    resolve_molecule_preset_by_smiles_for_renderer,
    resolve_molecule_preset_for_renderer,
)


def test_resolve_molecule_preset_for_renderer_hydrates_water_public_asset() -> None:
    preset = resolve_molecule_preset_for_renderer("chemistry-basic", "water")

    assert preset is not None
    assert preset.molecule_id == "water"
    assert preset.molecule_asset_id == "water-molecule-preset"
    assert preset.source == "structured-preset"
    assert preset.formula_latex == "H_2O"
    assert preset.geometry == "bent"
    assert (
        preset.caption
        == "Water is a bent polar molecule loaded from the chemistry-basic structured preset."
    )
    assert [atom.model_dump(mode="json", exclude_none=True) for atom in preset.atoms] == [
        {"id": "o", "element": "O", "x": 50.0, "y": 42.0, "label": "oxygen"},
        {"id": "h1", "element": "H", "x": 30.2, "y": 57.3, "label": "hydrogen"},
        {"id": "h2", "element": "H", "x": 69.8, "y": 57.3, "label": "hydrogen"},
    ]
    assert [
        bond.model_dump(mode="json", by_alias=True, exclude_none=True)
        for bond in preset.bonds
    ] == [
        {"id": "oh1", "from": "o", "to": "h1", "order": 1, "label": "O-H bond"},
        {"id": "oh2", "from": "o", "to": "h2", "order": 1, "label": "O-H bond"},
    ]
    assert [callout.model_dump(mode="json") for callout in preset.callouts] == [
        {
            "id": "water-bent-geometry",
            "target_id": "o",
            "label": "bent geometry",
            "side": "top",
        },
        {
            "id": "water-polar-bond",
            "target_id": "h2",
            "label": "polar bonds",
            "side": "right",
        },
    ]


def test_resolve_molecule_preset_for_renderer_hydrates_methane_by_smiles() -> None:
    by_id = resolve_molecule_preset_for_renderer("chemistry-basic", "methane")
    by_smiles = resolve_molecule_preset_by_smiles_for_renderer("chemistry-basic", "C")

    assert by_id is not None
    assert by_smiles == by_id
    assert by_id.molecule_id == "methane"
    assert by_id.molecule_asset_id == "methane-molecule-preset"
    assert by_id.smiles == "C"
    assert by_id.formula_latex == "CH_4"
    assert by_id.geometry == "tetrahedral"
    assert (
        by_id.caption
        == "Methane is a tetrahedral molecule loaded from a SMILES-addressable structured preset."
    )
    assert len(by_id.atoms) == 5
    assert len(by_id.bonds) == 4


def test_resolve_molecule_preset_for_renderer_does_not_fabricate_unknown_molecule() -> None:
    assert resolve_molecule_preset_for_renderer("chemistry-basic", "ethane") is None
    assert resolve_molecule_preset_by_smiles_for_renderer("chemistry-basic", "CC") is None
