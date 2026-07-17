from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any

from pydantic import BaseModel

from app.domain.models.playbook import Molecule2DAtom, Molecule2DBond, Molecule2DCallout

ASSET_ROOT = (
    Path(__file__).resolve().parents[5]
    / "apps"
    / "web"
    / "public"
    / "assets"
    / "metaview-kits"
)


class ResolvedMoleculePreset(BaseModel):
    molecule_id: str
    molecule_asset_id: str
    source: str
    smiles: str | None = None
    formula: str
    formula_latex: str
    geometry: str | None = None
    caption: str
    atoms: list[Molecule2DAtom]
    bonds: list[Molecule2DBond]
    callouts: list[Molecule2DCallout]


def _formula_to_latex(formula: str) -> str:
    result: list[str] = []
    for char in formula:
        result.append(f"_{char}" if char.isdigit() else char)
    return "".join(result)


@lru_cache
def _load_molecule_preset(pack_id: str, molecule_id: str) -> dict[str, Any] | None:
    preset_path = ASSET_ROOT / pack_id / "molecule-presets" / f"{molecule_id}.json"
    if not preset_path.exists():
        return None
    return json.loads(preset_path.read_text(encoding="utf-8"))


def _normalize_smiles(smiles: str) -> str:
    return smiles.strip()


def resolve_molecule_preset_for_renderer(
    pack_id: str,
    molecule_id: str,
) -> ResolvedMoleculePreset | None:
    raw = _load_molecule_preset(pack_id, molecule_id)
    if not raw or raw.get("source") != "structured-preset":
        return None

    return ResolvedMoleculePreset(
        molecule_id=str(raw["id"]),
        molecule_asset_id=f"{molecule_id}-molecule-preset",
        source=str(raw["source"]),
        smiles=str(raw["smiles"]) if raw.get("smiles") else None,
        formula=str(raw["formula"]),
        formula_latex=str(raw.get("formulaLatex") or _formula_to_latex(str(raw["formula"]))),
        geometry=str(raw["geometry"]) if raw.get("geometry") else None,
        caption=str(
            raw.get("caption")
            or f"{molecule_id} molecule loaded from the {pack_id} structured preset."
        ),
        atoms=[
            Molecule2DAtom(
                id=str(atom["id"]),
                element=str(atom["element"]),
                x=float(atom["x"]),
                y=float(atom["y"]),
                charge=atom.get("charge"),
                label=atom.get("label"),
            )
            for atom in raw.get("atoms", [])
        ],
        bonds=[
            Molecule2DBond(
                id=str(bond["id"]),
                **{"from": str(bond["from"])},
                to=str(bond["to"]),
                order=bond.get("order", 1),
                label=bond.get("label"),
            )
            for bond in raw.get("bonds", [])
        ],
        callouts=[
            Molecule2DCallout(
                id=str(callout["id"]),
                target_id=str(callout["target_id"]),
                label=str(callout["label"]),
                side=callout.get("side"),
            )
            for callout in raw.get("callouts", [])
        ],
    )


def resolve_molecule_preset_by_smiles_for_renderer(
    pack_id: str,
    smiles: str | None,
) -> ResolvedMoleculePreset | None:
    if not smiles:
        return None
    normalized_smiles = _normalize_smiles(smiles)
    preset_dir = ASSET_ROOT / pack_id / "molecule-presets"
    if not preset_dir.exists():
        return None
    for preset_path in sorted(preset_dir.glob("*.json")):
        raw = json.loads(preset_path.read_text(encoding="utf-8"))
        if raw.get("smiles") == normalized_smiles:
            return resolve_molecule_preset_for_renderer(pack_id, str(raw["id"]))
    return None
