from __future__ import annotations

import builtins
import json
from pathlib import Path

import pytest

from app.domain.services import rdkit_molecule_compiler
from app.domain.services.rdkit_molecule_compiler import compile_molecule_snapshot_from_smiles

GLUCOSE_SMILES = "OC[C@H]1O[C@@H](O)[C@H](O)[C@H](O)[C@@H]1O"
CONTRACT_PATH = (
    Path(__file__).resolve().parents[3]
    / "apps"
    / "web"
    / "public"
    / "assets"
    / "metaview-kits"
    / "chemistry-basic"
    / "contracts"
    / "glucose.contract.json"
)


def _glucose_contract() -> dict:
    return json.loads(CONTRACT_PATH.read_text(encoding="utf-8"))


def _element_counts(atoms: list[dict]) -> dict[str, int]:
    counts: dict[str, int] = {}
    for atom in atoms:
        element = str(atom["element"])
        counts[element] = counts.get(element, 0) + 1
    return counts


def test_compile_molecule_snapshot_from_smiles_uses_rdkit_structure_data() -> None:
    contract = _glucose_contract()
    snapshot = compile_molecule_snapshot_from_smiles(
        pack_id="chemistry-basic",
        molecule_id=contract["moleculeId"],
        smiles=contract["smiles"],
        atom_asset_id="atom-core",
        bond_asset_id="bond-line",
        caption="Glucose is rendered from an RDKit SMILES layout.",
    )
    data = snapshot.model_dump(mode="json", by_alias=True, exclude_none=True)

    assert data["kind"] == "molecule_2d_scene"
    assert data["pack_id"] == "chemistry-basic"
    assert data["molecule_id"] == contract["moleculeId"]
    assert data["smiles"] == contract["smiles"]
    assert data["formula_latex"] == contract["formulaLatex"]
    assert data["caption"] == "Glucose is rendered from an RDKit SMILES layout."
    assert data["molecule_asset_id"] == contract["assetId"]
    assert _element_counts(data["atoms"]) == contract["elementCounts"]
    assert len(data["bonds"]) >= contract["minBondCount"]
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


def test_missing_rdkit_fails_only_when_a_smiles_scene_is_requested(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    rdkit_molecule_compiler._load_rdkit.cache_clear()
    real_import = builtins.__import__

    def import_without_rdkit(name: str, *args, **kwargs):
        if name == "rdkit" or name.startswith("rdkit."):
            raise ModuleNotFoundError("No module named 'rdkit'", name="rdkit")
        return real_import(name, *args, **kwargs)

    monkeypatch.setattr(builtins, "__import__", import_without_rdkit)

    with pytest.raises(RuntimeError, match="required only for SMILES molecule scenes"):
        compile_molecule_snapshot_from_smiles(
            pack_id="chemistry-basic",
            molecule_id="glucose",
            smiles=GLUCOSE_SMILES,
        )
