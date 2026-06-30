from __future__ import annotations

import pytest

from app.domain.services.rdkit_molecule_compiler import compile_molecule_snapshot_from_smiles

GLUCOSE_SMILES = "OC[C@H]1O[C@@H](O)[C@H](O)[C@H](O)[C@@H]1O"


def test_compile_molecule_snapshot_from_smiles_uses_rdkit_structure_data() -> None:
    snapshot = compile_molecule_snapshot_from_smiles(
        pack_id="chemistry-basic",
        molecule_id="glucose",
        smiles=GLUCOSE_SMILES,
        atom_asset_id="atom-core",
        bond_asset_id="bond-line",
        caption="Glucose is rendered from an RDKit SMILES layout.",
    )
    data = snapshot.model_dump(mode="json", by_alias=True, exclude_none=True)

    assert data["kind"] == "molecule_2d_scene"
    assert data["pack_id"] == "chemistry-basic"
    assert data["molecule_id"] == "glucose"
    assert data["smiles"] == GLUCOSE_SMILES
    assert data["formula_latex"] == "C_6H_12O_6"
    assert data["caption"] == "Glucose is rendered from an RDKit SMILES layout."
    assert data["molecule_asset_id"] == "rdkit-smiles-glucose"
    assert len(data["atoms"]) == 12
    assert len(data["bonds"]) >= 12
    assert {atom["element"] for atom in data["atoms"]} == {"C", "O"}
    assert all(atom["asset_id"] == "atom-core" for atom in data["atoms"])
    assert all(8 <= atom["x"] <= 92 and 18 <= atom["y"] <= 82 for atom in data["atoms"])
    assert all(bond["asset_id"] == "bond-line" for bond in data["bonds"])


def test_compile_molecule_snapshot_from_smiles_rejects_invalid_smiles() -> None:
    with pytest.raises(ValueError, match="Invalid SMILES"):
        compile_molecule_snapshot_from_smiles(
            pack_id="chemistry-basic",
            molecule_id="broken",
            smiles="not-a-smiles",
        )
