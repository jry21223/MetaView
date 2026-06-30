from __future__ import annotations

from app.domain.services.molecule_preset_resolver import resolve_molecule_preset_for_renderer


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
        {"id": "h1", "element": "H", "x": 35.0, "y": 62.0, "label": "hydrogen"},
        {"id": "h2", "element": "H", "x": 65.0, "y": 62.0, "label": "hydrogen"},
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


def test_resolve_molecule_preset_for_renderer_does_not_fabricate_unknown_molecule() -> None:
    assert resolve_molecule_preset_for_renderer("chemistry-basic", "methane") is None
