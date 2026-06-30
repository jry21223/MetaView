from __future__ import annotations

import re

from rdkit import Chem, RDLogger
from rdkit.Chem import rdDepictor, rdMolDescriptors
from rdkit.Chem.rdchem import BondType

from app.domain.models.playbook import Molecule2DAtom, Molecule2DBond, Molecule2DSceneSnapshot

RDLogger.DisableLog("rdApp.error")


def _formula_to_latex(formula: str) -> str:
    return re.sub(r"(\d+)", r"_\1", formula)


def _bond_order(bond_type: BondType) -> int:
    if bond_type == BondType.DOUBLE:
        return 2
    if bond_type == BondType.TRIPLE:
        return 3
    return 1


def _scaled_positions(mol: Chem.Mol) -> list[tuple[float, float]]:
    conformer = mol.GetConformer()
    raw_points = [
        (float(conformer.GetAtomPosition(index).x), float(conformer.GetAtomPosition(index).y))
        for index in range(mol.GetNumAtoms())
    ]
    min_x = min(x for x, _ in raw_points)
    max_x = max(x for x, _ in raw_points)
    min_y = min(y for _, y in raw_points)
    max_y = max(y for _, y in raw_points)
    width = max(max_x - min_x, 1e-6)
    height = max(max_y - min_y, 1e-6)

    return [
        (
            round(14 + ((x - min_x) / width) * 72, 1),
            round(18 + ((max_y - y) / height) * 64, 1),
        )
        for x, y in raw_points
    ]


def compile_molecule_snapshot_from_smiles(
    *,
    pack_id: str,
    molecule_id: str,
    smiles: str,
    atom_asset_id: str | None = None,
    bond_asset_id: str | None = None,
    caption: str | None = None,
) -> Molecule2DSceneSnapshot:
    mol = Chem.MolFromSmiles(smiles)
    if mol is None:
        raise ValueError(f"Invalid SMILES for molecule {molecule_id!r}: {smiles!r}")

    rdDepictor.Compute2DCoords(mol)
    positions = _scaled_positions(mol)
    formula = rdMolDescriptors.CalcMolFormula(mol)

    atoms = [
        Molecule2DAtom(
            id=f"a{index + 1}",
            element=atom.GetSymbol(),
            x=positions[index][0],
            y=positions[index][1],
            asset_id=atom_asset_id,
        )
        for index, atom in enumerate(mol.GetAtoms())
    ]
    bonds = [
        Molecule2DBond(
            id=f"b{index + 1}",
            **{"from": f"a{bond.GetBeginAtomIdx() + 1}"},
            to=f"a{bond.GetEndAtomIdx() + 1}",
            order=_bond_order(bond.GetBondType()),
            asset_id=bond_asset_id,
        )
        for index, bond in enumerate(mol.GetBonds())
    ]

    return Molecule2DSceneSnapshot(
        pack_id=pack_id,
        molecule_id=molecule_id,
        smiles=smiles,
        molecule_asset_id=f"rdkit-smiles-{molecule_id}",
        atoms=atoms,
        bonds=bonds,
        formula_latex=_formula_to_latex(formula),
        caption=caption or f"{molecule_id} molecule rendered from RDKit SMILES structure data.",
    )
