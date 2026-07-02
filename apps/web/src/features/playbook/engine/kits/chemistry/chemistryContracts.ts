import glucoseContractJson from "../../../../../../public/assets/metaview-kits/chemistry-basic/contracts/glucose.contract.json";
import methaneContractJson from "../../../../../../public/assets/metaview-kits/chemistry-basic/contracts/methane.contract.json";
import reactionSynthesisWaterContractJson from "../../../../../../public/assets/metaview-kits/chemistry-basic/contracts/reaction-synthesis-water.contract.json";
import waterContractJson from "../../../../../../public/assets/metaview-kits/chemistry-basic/contracts/water.contract.json";

export type ChemistryMoleculeContract = {
  moleculeId: string;
  assetId: string;
  smiles?: string;
  formula: string;
  formulaLatex: string;
  elementCounts: Record<string, number>;
  minBondCount: number;
};

export type ChemistryReactionParticipantContract = {
  id: string;
  formulaLatex: string;
  label: string;
  coefficient: number;
  x: number;
  y: number;
};

export type ChemistryReactionVectorContract = {
  id: string;
  semanticRole: string;
  from: [number, number];
  to: [number, number];
  label: string;
};

export type ChemistryReactionContract = {
  reactionId: string;
  arrowAssetId: string;
  electronFlowAssetId: string;
  reactantFormulas: string[];
  productFormulas: string[];
  formulaLatex: string;
  reactants: ChemistryReactionParticipantContract[];
  products: ChemistryReactionParticipantContract[];
  arrow: ChemistryReactionVectorContract;
  electronFlow: ChemistryReactionVectorContract;
  caption: string;
};

export const CHEMISTRY_MOLECULE_CONTRACTS: Record<string, ChemistryMoleculeContract> = {
  glucose: glucoseContractJson as unknown as ChemistryMoleculeContract,
  methane: methaneContractJson as unknown as ChemistryMoleculeContract,
  water: waterContractJson as unknown as ChemistryMoleculeContract,
};

export const WATER_SYNTHESIS_REACTION_CONTRACT =
  reactionSynthesisWaterContractJson as unknown as ChemistryReactionContract;

export function resolveMoleculeContract(moleculeId: string): ChemistryMoleculeContract | undefined {
  return CHEMISTRY_MOLECULE_CONTRACTS[moleculeId];
}
