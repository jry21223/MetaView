from __future__ import annotations

import json
from typing import Any

from app.domain.models.playbook import (
    Molecule2DAtom,
    Molecule2DBond,
    Molecule2DCallout,
    Molecule2DSceneSnapshot,
    ReactionArrow,
    ReactionElectronFlow,
    ReactionParticipant,
    ReactionSceneSnapshot,
)
from app.domain.services.asset_manifest_resolver import (
    ASSET_MANIFEST_ROOT,
    resolve_asset_by_role,
    resolve_asset_for_renderer,
)
from app.domain.services.molecule_preset_resolver import (
    resolve_molecule_preset_by_smiles_for_renderer,
    resolve_molecule_preset_for_renderer,
)
from app.domain.services.rdkit_molecule_compiler import compile_molecule_snapshot_from_smiles

DEFAULT_CHEMISTRY_PACK_ID = "chemistry-basic"


def _load_chemistry_contract(contract_name: str) -> dict[str, Any]:
    contract_path = (
        ASSET_MANIFEST_ROOT
        / "chemistry-basic"
        / "contracts"
        / f"{contract_name}.contract.json"
    )
    return json.loads(contract_path.read_text(encoding="utf-8"))


MOLECULE_CONTRACTS = {
    "glucose": _load_chemistry_contract("glucose"),
    "methane": _load_chemistry_contract("methane"),
    "water": _load_chemistry_contract("water"),
}
GLUCOSE_CONTRACT = MOLECULE_CONTRACTS["glucose"]
GLUCOSE_SMILES = str(GLUCOSE_CONTRACT["smiles"])
WATER_SYNTHESIS_REACTION_CONTRACT = _load_chemistry_contract("reaction-synthesis-water")


def _asset_id_for_role(renderer_kind: str, semantic_role: str, pack_id: str) -> str | None:
    asset = (
        resolve_asset_for_renderer(renderer_kind, semantic_role, pack_id=pack_id)
        or resolve_asset_by_role("chemistry", semantic_role, pack_id=pack_id)
        or resolve_asset_for_renderer(renderer_kind, semantic_role)
        or resolve_asset_by_role("chemistry", semantic_role)
    )
    return str(asset["id"]) if asset else None


def _direct_asset_id_for_role(renderer_kind: str, semantic_role: str, pack_id: str) -> str | None:
    asset = resolve_asset_for_renderer(renderer_kind, semantic_role, pack_id=pack_id)
    return str(asset["id"]) if asset else None


def _number(value: Any, fallback: float) -> float:
    return float(value) if isinstance(value, int | float) else fallback


def _molecule_id(blueprint: dict[str, Any], default_molecule_id: str | None) -> str:
    if blueprint.get("moleculeId"):
        return str(blueprint["moleculeId"])
    if default_molecule_id:
        return default_molecule_id
    scene_type = str(blueprint.get("sceneType") or "")
    if scene_type == "molecule_2d_methane":
        return str(MOLECULE_CONTRACTS["methane"]["moleculeId"])
    if scene_type == "molecule_2d_glucose":
        return str(MOLECULE_CONTRACTS["glucose"]["moleculeId"])
    return str(MOLECULE_CONTRACTS["water"]["moleculeId"])


def _callout(raw: dict[str, Any], index: int) -> Molecule2DCallout:
    target_id = str(raw.get("targetId") or raw.get("target_id") or "molecule")
    return Molecule2DCallout(
        id=str(raw.get("id") or f"{target_id}-callout-{index + 1}"),
        target_id=target_id,
        label=str(raw.get("label") or target_id),
        side=raw.get("side"),
    )


def _atom(raw: dict[str, Any], pack_id: str, index: int) -> Molecule2DAtom:
    element = str(raw["element"])
    return Molecule2DAtom(
        id=str(raw.get("id") or f"{element.lower()}-{index + 1}"),
        element=element,
        x=_number(raw.get("x"), 50),
        y=_number(raw.get("y"), 50),
        charge=raw.get("charge"),
        label=raw.get("label"),
        asset_id=raw.get("assetId")
        or raw.get("asset_id")
        or _asset_id_for_role("molecule_2d_scene", "atom", pack_id),
    )


def _bond(raw: dict[str, Any], pack_id: str, index: int) -> Molecule2DBond:
    from_id = str(raw["from"])
    to_id = str(raw["to"])
    return Molecule2DBond(
        id=str(raw.get("id") or f"{from_id}-{to_id}-{index + 1}"),
        **{"from": from_id},
        to=to_id,
        order=raw.get("order", 1),
        stereo=raw.get("stereo"),
        label=raw.get("label"),
        asset_id=raw.get("assetId")
        or raw.get("asset_id")
        or _asset_id_for_role("molecule_2d_scene", "bond", pack_id),
    )


def compile_molecule_2d_snapshot(
    blueprint: dict[str, Any],
    *,
    default_molecule_id: str | None = None,
) -> Molecule2DSceneSnapshot:
    pack_id = str(blueprint.get("packId") or DEFAULT_CHEMISTRY_PACK_ID)
    molecule_id = _molecule_id(blueprint, default_molecule_id)
    molecule_contract = MOLECULE_CONTRACTS.get(molecule_id)
    smiles = (
        str(blueprint["smiles"])
        if blueprint.get("smiles")
        else str(molecule_contract["smiles"])
        if molecule_contract and molecule_contract.get("smiles")
        else None
    )
    atom_asset_id = _asset_id_for_role("molecule_2d_scene", "atom", pack_id)
    bond_asset_id = _asset_id_for_role("molecule_2d_scene", "bond", pack_id)
    raw_atoms = blueprint.get("atoms") or []
    raw_bonds = blueprint.get("bonds") or []
    if raw_atoms and raw_bonds:
        return Molecule2DSceneSnapshot(
            pack_id=pack_id,
            molecule_id=molecule_id,
            smiles=smiles,
            molecule_asset_id=blueprint.get("moleculeAssetId")
            or (str(molecule_contract["assetId"]) if molecule_contract else None)
            or _direct_asset_id_for_role("molecule_2d_scene", molecule_id, pack_id),
            atoms=[_atom(atom, pack_id, index) for index, atom in enumerate(raw_atoms)],
            bonds=[_bond(bond, pack_id, index) for index, bond in enumerate(raw_bonds)],
            highlights=[str(item) for item in blueprint.get("highlights") or []],
            callouts=[
                _callout(callout, index)
                for index, callout in enumerate(blueprint.get("callouts") or [])
            ],
            formula_latex=blueprint.get("formulaLatex")
            or (str(molecule_contract["formulaLatex"]) if molecule_contract else None),
            caption=str(
                blueprint.get("caption")
                or f"{molecule_id} molecule compiled from structured atom and bond input."
            ),
        )

    if molecule_id == "glucose":
        return compile_molecule_snapshot_from_smiles(
            pack_id=pack_id,
            molecule_id=molecule_id,
            smiles=smiles or GLUCOSE_SMILES,
            atom_asset_id=atom_asset_id,
            bond_asset_id=bond_asset_id,
            caption=str(
                blueprint.get("caption")
                or "Glucose is rendered from RDKit SMILES structure data."
            ),
        )

    preset = (
        resolve_molecule_preset_by_smiles_for_renderer(pack_id, smiles)
        or resolve_molecule_preset_for_renderer(pack_id, molecule_id)
    )
    if preset is not None:
        return Molecule2DSceneSnapshot(
            pack_id=pack_id,
            molecule_id=(
                str(molecule_contract["moleculeId"])
                if molecule_contract
                else preset.molecule_id
            ),
            smiles=smiles or preset.smiles,
            molecule_asset_id=blueprint.get("moleculeAssetId")
            or (str(molecule_contract["assetId"]) if molecule_contract else None)
            or preset.molecule_asset_id,
            atoms=[
                atom.model_copy(update={"asset_id": atom_asset_id}) for atom in preset.atoms
            ],
            bonds=[
                bond.model_copy(update={"asset_id": bond_asset_id}) for bond in preset.bonds
            ],
            callouts=preset.callouts,
            formula_latex=blueprint.get("formulaLatex")
            or (str(molecule_contract["formulaLatex"]) if molecule_contract else None)
            or preset.formula_latex,
            caption=str(blueprint.get("caption") or preset.caption),
        )

    return Molecule2DSceneSnapshot(
        pack_id=pack_id,
        molecule_id=molecule_id,
        smiles=smiles,
        molecule_asset_id=_direct_asset_id_for_role("molecule_2d_scene", molecule_id, pack_id),
        atoms=[
            Molecule2DAtom(id="o", element="O", x=50, y=42, asset_id=atom_asset_id, label="oxygen"),
            Molecule2DAtom(
                id="h1", element="H", x=35, y=62, asset_id=atom_asset_id, label="hydrogen"
            ),
            Molecule2DAtom(
                id="h2", element="H", x=65, y=62, asset_id=atom_asset_id, label="hydrogen"
            ),
        ],
        bonds=[
            Molecule2DBond(id="oh1", **{"from": "o"}, to="h1", order=1, asset_id=bond_asset_id),
            Molecule2DBond(id="oh2", **{"from": "o"}, to="h2", order=1, asset_id=bond_asset_id),
        ],
        callouts=[
            Molecule2DCallout(id="bent-shape", target_id="o", label="bent geometry", side="top"),
            Molecule2DCallout(id="polar-bond", target_id="h2", label="polar bonds", side="right"),
        ],
        formula_latex=str(
            blueprint.get("formulaLatex")
            or (molecule_contract["formulaLatex"] if molecule_contract else "H_2O")
        ),
        caption=str(
            blueprint.get("caption")
            or "Water is a bent polar molecule built from structured atom and bond data."
        ),
    )


def _participant(raw: dict[str, Any], index: int) -> ReactionParticipant:
    return ReactionParticipant(
        id=str(raw.get("id") or f"participant-{index + 1}"),
        formula_latex=str(raw.get("formulaLatex") or raw.get("formula_latex") or ""),
        label=raw.get("label"),
        coefficient=raw.get("coefficient"),
        x=_number(raw.get("x"), 20 + index * 18),
        y=_number(raw.get("y"), 48),
        asset_id=raw.get("assetId") or raw.get("asset_id"),
    )


def _arrow(raw: dict[str, Any], pack_id: str, index: int) -> ReactionArrow:
    semantic_role = str(raw.get("semanticRole") or raw.get("semantic_role") or "reaction_arrow")
    return ReactionArrow(
        id=str(raw.get("id") or f"reaction-arrow-{index + 1}"),
        semantic_role=semantic_role,
        **{"from": tuple(raw.get("from") or (48, 48))},
        to=tuple(raw.get("to") or (66, 48)),
        label=raw.get("label"),
        asset_id=raw.get("assetId")
        or raw.get("asset_id")
        or _asset_id_for_role("reaction_scene", semantic_role, pack_id),
    )


def _electron_flow(raw: dict[str, Any], pack_id: str, index: int) -> ReactionElectronFlow:
    semantic_role = str(raw.get("semanticRole") or raw.get("semantic_role") or "electron_flow")
    return ReactionElectronFlow(
        id=str(raw.get("id") or f"electron-flow-{index + 1}"),
        semantic_role=semantic_role,
        **{"from": tuple(raw.get("from") or (39, 38))},
        to=tuple(raw.get("to") or (58, 36)),
        label=raw.get("label"),
        asset_id=raw.get("assetId")
        or raw.get("asset_id")
        or _asset_id_for_role("reaction_scene", semantic_role, pack_id),
    )


def compile_reaction_snapshot(blueprint: dict[str, Any]) -> ReactionSceneSnapshot:
    pack_id = str(blueprint.get("packId") or DEFAULT_CHEMISTRY_PACK_ID)
    raw_electron_flows = blueprint.get("electronFlows") or blueprint.get("electron_flows") or []
    reaction_contract = WATER_SYNTHESIS_REACTION_CONTRACT
    return ReactionSceneSnapshot(
        pack_id=pack_id,
        reaction_id=str(blueprint.get("reactionId") or reaction_contract["reactionId"]),
        reactants=[
            _participant(participant, index)
            for index, participant in enumerate(blueprint.get("reactants") or [])
        ]
        or [
            _participant(participant, index)
            for index, participant in enumerate(reaction_contract["reactants"])
        ],
        products=[
            _participant(product, index)
            for index, product in enumerate(blueprint.get("products") or [])
        ]
        or [
            _participant(product, index)
            for index, product in enumerate(reaction_contract["products"])
        ],
        arrows=[
            _arrow(arrow, pack_id, index)
            for index, arrow in enumerate(blueprint.get("arrows") or [])
        ]
        or [_arrow(reaction_contract["arrow"], pack_id, 0)],
        electron_flows=[
            _electron_flow(flow, pack_id, index)
            for index, flow in enumerate(raw_electron_flows)
        ],
        callouts=[
            _callout(callout, index)
            for index, callout in enumerate(blueprint.get("callouts") or [])
        ]
        or [
            Molecule2DCallout(
                id="balanced", target_id="main-arrow", label="balanced atoms", side="top"
            ),
        ],
        formula_latex=str(
            blueprint.get("formulaLatex") or reaction_contract["formulaLatex"]
        ),
        caption=str(
            blueprint.get("caption")
            or reaction_contract["caption"]
        ),
    )
