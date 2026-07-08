import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

import { visualQualityGate } from "../assets/visualQualityGate";
import { PlaybookComposition } from "../composition/PlaybookComposition";
import {
  resolveMoleculePresetBySmilesForRenderer,
  resolveMoleculePresetForRenderer,
} from "../kits/chemistry/moleculePresetResolver";
import {
  compileSceneBlueprint,
  compileSceneBlueprintToPlaybookScript,
  type SceneBlueprint,
} from "./sceneBlueprintCompiler";

vi.mock("remotion", async () => {
  const actual = await vi.importActual<typeof import("remotion")>("remotion");
  return {
    ...actual,
    useCurrentFrame: () => 0,
    useVideoConfig: () => ({ fps: 30 }),
  };
});

interface MoleculeContract {
  moleculeId: string;
  assetId: string;
  smiles?: string;
  formula: string;
  formulaLatex: string;
  elementCounts: Record<string, number>;
  minBondCount: number;
}

interface ReactionContract {
  reactionId: string;
  formulaLatex: string;
  reactantFormulas: string[];
  productFormulas: string[];
  arrowAssetId: string;
  electronFlowAssetId: string;
}

function readChemistryContract<T>(contractName: string): T {
  return JSON.parse(
    readFileSync(
      path.resolve(
        process.cwd(),
        `public/assets/metaview-kits/chemistry-basic/contracts/${contractName}.contract.json`,
      ),
      "utf8",
    ),
  ) as T;
}

function readMoleculeContract(contractName: string): MoleculeContract {
  return readChemistryContract<MoleculeContract>(contractName);
}

function readReactionContract(contractName: string): ReactionContract {
  return readChemistryContract<ReactionContract>(contractName);
}

function elementCounts(atoms: Array<{ element: string }>): Record<string, number> {
  return atoms.reduce<Record<string, number>>((counts, atom) => {
    counts[atom.element] = (counts[atom.element] ?? 0) + 1;
    return counts;
  }, {});
}

describe("sceneBlueprintCompiler", () => {
  it("compiles a minimal East Asia monsoon blueprint into an asset-backed geo map scene", () => {
    const script = compileSceneBlueprintToPlaybookScript({
      id: "east_asia_monsoon_blueprint",
      subject: "geography",
      sceneType: "east_asia_monsoon",
      title: "East Asia monsoon",
      visualIntent: ["seasonal_wind_reversal", "land_sea_thermal_contrast"],
      emphasisPoints: ["land low", "ocean high", "moisture transport"],
    });

    expect(script.domain).toBe("geography");
    expect(script.steps).toHaveLength(1);
    expect(script.steps[0].snapshot).toMatchObject({
      kind: "geo_map_scene",
      pack_id: "geography-earth-basic",
      map_region: "east_asia",
      particle_preset: "moisture_particles",
    });

    const snapshot = script.steps[0].snapshot;
    if (snapshot.kind !== "geo_map_scene") {
      throw new Error(`Expected geo_map_scene, got ${snapshot.kind}`);
    }
    expect(snapshot.layers.find((layer) => layer.semantic_role === "map_layer")).toMatchObject({
      asset_id: "east-asia-land-110m",
    });
    expect(snapshot.flows[0]).toMatchObject({
      semantic_role: "monsoon_flow",
      asset_id: "monsoon-wind-arrow",
    });
    expect(visualQualityGate(script)).toEqual([]);

    const markup = renderToStaticMarkup(<PlaybookComposition script={script} showSubtitles={false} />);
    expect(markup).toContain("geo-map-scene");
    expect(markup).toContain('data-asset-id="east-asia-land-110m"');
    expect(markup).toContain('data-asset-id="monsoon-wind-arrow"');
    expect(markup).not.toContain("Unknown snapshot kind");
    expect(markup).not.toContain('data-missing-asset="true"');
  });

  it("compiles geography layout from structured flow and pressure input", () => {
    const script = compileSceneBlueprintToPlaybookScript({
      id: "east_asia_custom_flow",
      subject: "geography",
      sceneType: "east_asia_monsoon",
      title: "Custom monsoon flow",
      visualIntent: ["seasonal_wind_reversal", "land_sea_thermal_contrast"],
      emphasisPoints: ["custom flow", "custom pressure"],
      mapRegion: "east_asia",
      flows: [
        {
          id: "winter-monsoon",
          semanticRole: "wind",
          from: [35, 30],
          to: [76, 64],
          label: "winter monsoon",
          strength: 0.8,
        },
      ],
      pressureCenters: [
        { id: "siberian-high", kind: "high", x: 34, y: 28, label: "Siberian high" },
        { id: "pacific-low", kind: "low", x: 72, y: 66, label: "Pacific low" },
      ],
      particlePreset: "wind_stream",
    });

    const snapshot = script.steps[0].snapshot;
    if (snapshot.kind !== "geo_map_scene") {
      throw new Error(`Expected geo_map_scene, got ${snapshot.kind}`);
    }
    expect(snapshot.flows).toEqual([
      expect.objectContaining({
        id: "winter-monsoon",
        semantic_role: "wind",
        from: [35, 30],
        to: [76, 64],
        label: "winter monsoon",
        asset_id: "monsoon-wind-arrow",
        strength: 0.8,
      }),
    ]);
    expect(snapshot.pressure_centers?.map((center) => center.id)).toEqual(["siberian-high", "pacific-low"]);
    expect(snapshot.particle_preset).toBe("wind_stream");
    expect(visualQualityGate(script)).toEqual([]);
  });

  it("compiles a minimal projectile blueprint into an asset-backed physics force scene", () => {
    const script = compileSceneBlueprintToPlaybookScript({
      id: "projectile_motion_blueprint",
      subject: "physics",
      sceneType: "projectile_motion",
      title: "Projectile motion",
      visualIntent: ["projectile_motion", "velocity_decomposition", "gravity_acceleration"],
      emphasisPoints: ["vx constant", "vy increases", "g downward"],
    });

    expect(script.domain).toBe("physics");
    const snapshot = script.steps[0].snapshot;
    if (snapshot.kind !== "physics_force_scene") {
      throw new Error(`Expected physics_force_scene, got ${snapshot.kind}`);
    }
    expect(snapshot.pack_id).toBe("physics-basic");
    expect(snapshot.objects[0]).toMatchObject({
      id: "body",
      asset_id: "projectile-body-dot",
    });
    expect(snapshot.trajectory?.length).toBeGreaterThanOrEqual(4);
    expect(snapshot.vectors.map((vector) => vector.semantic_role)).toEqual(
      expect.arrayContaining(["velocity", "acceleration", "force"]),
    );
    expect(visualQualityGate(script)).toEqual([]);

    const markup = renderToStaticMarkup(<PlaybookComposition script={script} showSubtitles={false} />);
    expect(markup).toContain("physics-force-scene");
    expect(markup).toContain('data-asset-id="projectile-body-dot"');
    expect(markup).toContain('data-semantic-role="motion_trail"');
    expect(markup).not.toContain("Unknown snapshot kind");
    expect(markup).not.toContain('data-missing-asset="true"');
  });

  it("compiles physics layout from structured object, vector, trajectory, and formula input", () => {
    const script = compileSceneBlueprintToPlaybookScript({
      id: "projectile_custom_layout",
      subject: "physics",
      sceneType: "projectile_motion",
      title: "Custom projectile layout",
      visualIntent: ["projectile_motion", "velocity_decomposition"],
      emphasisPoints: ["block object", "custom vector", "custom trajectory"],
      object: { id: "cart", label: "block", semanticRole: "block", x: 24, y: 36, radius: 8 },
      vectors: [
        { id: "push", target: "cart", semanticRole: "force", dx: 24, dy: -6, label: "F_push" },
        { id: "gravity", target: "cart", semanticRole: "acceleration", dx: 0, dy: 28, label: "g" },
      ],
      trajectory: [
        [20, 30],
        [34, 35],
        [48, 46],
        [62, 63],
      ],
      formulaLatex: "x=v_xt,\\quad y=y_0+\\frac12gt^2",
    });

    const snapshot = script.steps[0].snapshot;
    if (snapshot.kind !== "physics_force_scene") {
      throw new Error(`Expected physics_force_scene, got ${snapshot.kind}`);
    }
    expect(snapshot.objects[0]).toMatchObject({
      id: "cart",
      label: "block",
      x: 24,
      y: 36,
      asset_id: "block-body",
      radius: 8,
    });
    expect(snapshot.vectors.map((vector) => vector.id)).toEqual(["push", "gravity"]);
    expect(snapshot.trajectory).toEqual([
      [20, 30],
      [34, 35],
      [48, 46],
      [62, 63],
    ]);
    expect(snapshot.formula_latex).toBe("x=v_xt,\\quad y=y_0+\\frac12gt^2");
    expect(visualQualityGate(script)).toEqual([]);
  });

  it("reports quality warnings when a blueprint pins an unresolved asset id", () => {
    const result = compileSceneBlueprint({
      subject: "physics",
      sceneType: "projectile_motion",
      title: "Projectile missing asset",
      visualIntent: ["projectile_motion"],
      object: {
        semanticRole: "projectile",
        assetId: "missing-projectile-asset",
      },
    });

    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "missing_asset",
          asset_id: "missing-projectile-asset",
          snapshot_kind: "physics_force_scene",
        }),
      ]),
    );

    const markup = renderToStaticMarkup(<PlaybookComposition script={result.playbookScript} showSubtitles={false} />);
    expect(markup).toContain('data-missing-asset="true"');
    expect(markup).toContain('data-asset-id="missing-projectile-asset"');
  });

  it("ignores raw SVG path hints so blueprint input stays an intent contract", () => {
    const blueprint = {
      subject: "geography",
      sceneType: "geo_map_scene",
      title: "Raw path should not leak",
      visualIntent: ["seasonal_wind_reversal"],
      rawSvgPath: "M 0 0 L 100 100",
    } satisfies SceneBlueprint & { rawSvgPath: string };

    const script = compileSceneBlueprintToPlaybookScript(blueprint);

    expect(JSON.stringify(script)).not.toContain("M 0 0 L 100 100");
    expect(script.steps[0].snapshot.kind).toBe("geo_map_scene");
  });

  it("compiles a cell structure blueprint into an asset-backed biology scene", () => {
    const script = compileSceneBlueprintToPlaybookScript({
      subject: "biology",
      sceneType: "cell_structure",
      title: "Cell structure",
      visualIntent: ["show_cell_structure", "label_core_organelles"],
      emphasisPoints: ["nucleus", "mitochondrion", "cell membrane"],
    });

    expect(script.domain).toBe("biology");
    const snapshot = script.steps[0].snapshot;
    if (snapshot.kind !== "bio_cell_scene") {
      throw new Error(`Expected bio_cell_scene, got ${snapshot.kind}`);
    }
    expect(snapshot.pack_id).toBe("biology-basic");
    expect(snapshot.structures.map((structure) => structure.asset_id)).toEqual(
      expect.arrayContaining(["cell-outline", "nucleus", "mitochondrion"]),
    );
    expect(visualQualityGate(script)).toEqual([]);

    const markup = renderToStaticMarkup(<PlaybookComposition script={script} showSubtitles={false} />);
    expect(markup).toContain("bio-cell-scene");
    expect(markup).toContain('data-asset-id="cell-outline"');
    expect(markup).toContain('data-asset-id="nucleus"');
    expect(markup).toContain('data-semantic-role="callout"');
    expect(markup).not.toContain('data-missing-asset="true"');
  });

  it("compiles biology cell layout from structured input", () => {
    const script = compileSceneBlueprintToPlaybookScript({
      subject: "biology",
      sceneType: "cell_structure",
      title: "Custom cell layout",
      visualIntent: ["show_cell_structure", "use_structured_layout"],
      cellType: "plant",
      structures: [
        { id: "cell-wall", semanticRole: "cell", label: "cell wall", x: 48, y: 52, width: 72, height: 54 },
        { id: "nucleus", semanticRole: "nucleus", label: "nucleus", x: 38, y: 44, width: 18, height: 16 },
        { id: "mitochondrion-right", semanticRole: "mitochondrion", label: "mitochondrion", x: 65, y: 60, width: 14, height: 9 },
      ],
      callouts: [
        { id: "nucleus-note", targetId: "nucleus", label: "controls gene expression", side: "left" },
      ],
    } as SceneBlueprint);

    const snapshot = script.steps[0].snapshot;
    if (snapshot.kind !== "bio_cell_scene") {
      throw new Error(`Expected bio_cell_scene, got ${snapshot.kind}`);
    }

    expect(snapshot.cell_type).toBe("plant");
    expect(snapshot.structures).toEqual([
      { id: "cell-wall", semantic_role: "cell", label: "cell wall", x: 48, y: 52, width: 72, height: 54, asset_id: "cell-outline" },
      { id: "nucleus", semantic_role: "nucleus", label: "nucleus", x: 38, y: 44, width: 18, height: 16, asset_id: "nucleus" },
      { id: "mitochondrion-right", semantic_role: "mitochondrion", label: "mitochondrion", x: 65, y: 60, width: 14, height: 9, asset_id: "mitochondrion" },
    ]);
    expect(snapshot.callouts).toEqual([
      { id: "nucleus-note", target_id: "nucleus", label: "controls gene expression", side: "left" },
    ]);
    expect(visualQualityGate(script)).toEqual([]);
  });

  it("compiles a dna replication blueprint into an asset-backed biology process scene", () => {
    const script = compileSceneBlueprintToPlaybookScript({
      subject: "biology",
      sceneType: "dna_replication",
      title: "DNA replication",
      visualIntent: ["show_process_steps", "show_complementary_base_pairing"],
      emphasisPoints: ["template DNA", "replication fork", "new strands"],
    });

    expect(script.domain).toBe("biology");
    const snapshot = script.steps[0].snapshot;
    if (snapshot.kind !== "bio_process_scene") {
      throw new Error(`Expected bio_process_scene, got ${snapshot.kind}`);
    }
    expect(snapshot.pack_id).toBe("biology-basic");
    expect(snapshot.process_id).toBe("dna_replication");
    expect(snapshot.steps.map((processStep) => processStep.asset_id)).toEqual(
      expect.arrayContaining(["dna-helix", "replication-fork"]),
    );
    expect(snapshot.connections.map((connection) => connection.asset_id)).toEqual(
      expect.arrayContaining(["core-flow-arrow"]),
    );
    expect(visualQualityGate(script)).toEqual([]);

    const markup = renderToStaticMarkup(<PlaybookComposition script={script} showSubtitles={false} />);
    expect(markup).toContain("bio-process-scene");
    expect(markup).toContain('data-process-id="dna_replication"');
    expect(markup).toContain('data-asset-id="replication-fork"');
    expect(markup).not.toContain('data-missing-asset="true"');
  });

  it("compiles molecule layout from structured atoms and bonds", () => {
    const script = compileSceneBlueprintToPlaybookScript({
      subject: "chemistry",
      sceneType: "molecule_2d_scene",
      title: "Carbon dioxide molecule",
      visualIntent: ["render_structured_molecule", "use_structured_layout"],
      moleculeId: "carbon_dioxide",
      smiles: "O=C=O",
      atoms: [
        { id: "o1", element: "O", x: 30, y: 50, label: "oxygen" },
        { id: "c", element: "C", x: 50, y: 50, label: "carbon" },
        { id: "o2", element: "O", x: 70, y: 50, label: "oxygen" },
      ],
      bonds: [
        { id: "o1-c", from: "o1", to: "c", order: 2 },
        { id: "c-o2", from: "c", to: "o2", order: 2 },
      ],
      callouts: [
        { id: "linear", targetId: "c", label: "linear geometry", side: "top" },
      ],
      formulaLatex: "CO_2",
    } as SceneBlueprint);

    const snapshot = script.steps[0].snapshot;
    if (snapshot.kind !== "molecule_2d_scene") {
      throw new Error(`Expected molecule_2d_scene, got ${snapshot.kind}`);
    }

    expect(snapshot.molecule_id).toBe("carbon_dioxide");
    expect(snapshot.smiles).toBe("O=C=O");
    expect(snapshot.atoms).toEqual([
      { id: "o1", element: "O", x: 30, y: 50, label: "oxygen", asset_id: "atom-core" },
      { id: "c", element: "C", x: 50, y: 50, label: "carbon", asset_id: "atom-core" },
      { id: "o2", element: "O", x: 70, y: 50, label: "oxygen", asset_id: "atom-core" },
    ]);
    expect(snapshot.bonds).toEqual([
      { id: "o1-c", from: "o1", to: "c", order: 2, asset_id: "bond-line" },
      { id: "c-o2", from: "c", to: "o2", order: 2, asset_id: "bond-line" },
    ]);
    expect(snapshot.callouts).toEqual([
      { id: "linear", target_id: "c", label: "linear geometry", side: "top" },
    ]);
    expect(snapshot.formula_latex).toBe("CO_2");
    expect(visualQualityGate(script)).toEqual([]);
  });

  it("compiles a water molecule blueprint into a structured chemistry scene", () => {
    const contract = readMoleculeContract("water");
    const preset = resolveMoleculePresetForRenderer("chemistry-basic", "water");
    const script = compileSceneBlueprintToPlaybookScript({
      subject: "chemistry",
      sceneType: "molecule_2d_water",
      title: "Water molecule",
      visualIntent: ["render_structured_molecule", "show_polar_bonds"],
      emphasisPoints: ["oxygen", "hydrogen", "bent geometry"],
    });

    expect(script.domain).toBe("chemistry");
    const snapshot = script.steps[0].snapshot;
    if (snapshot.kind !== "molecule_2d_scene") {
      throw new Error(`Expected molecule_2d_scene, got ${snapshot.kind}`);
    }
    expect(snapshot.pack_id).toBe("chemistry-basic");
    expect(snapshot.molecule_id).toBe(contract.moleculeId);
    expect(snapshot.molecule_asset_id).toBe(contract.assetId);
    expect(snapshot.formula_latex).toBe(contract.formulaLatex);
    expect(elementCounts(snapshot.atoms)).toEqual(contract.elementCounts);
    expect(snapshot.bonds.length).toBeGreaterThanOrEqual(contract.minBondCount);
    expect(preset).toBeTruthy();
    expect(snapshot.atoms).toEqual(preset!.atoms.map((atom) => ({ ...atom, asset_id: "atom-core" })));
    expect(snapshot.bonds).toEqual(preset!.bonds.map((bond) => ({ ...bond, asset_id: "bond-line" })));
    expect(snapshot.callouts).toEqual(preset!.callouts);
    expect(snapshot.caption).toBe(preset!.caption);
    expect(snapshot.atoms.map((atom) => atom.asset_id)).toEqual(
      expect.arrayContaining(["atom-core"]),
    );
    expect(snapshot.bonds.map((bond) => bond.asset_id)).toEqual(
      expect.arrayContaining(["bond-line"]),
    );
    expect(visualQualityGate(script)).toEqual([]);

    const markup = renderToStaticMarkup(<PlaybookComposition script={script} showSubtitles={false} />);
    expect(markup).toContain("molecule-2d-scene");
    expect(markup).toContain('data-structured-molecule="true"');
    expect(markup).toContain(`data-molecule-id="${contract.moleculeId}"`);
    expect(markup).toContain(`data-asset-id="${contract.assetId}"`);
    expect(markup).toContain(contract.formula);
    expect(markup).toContain('data-element="O"');
    expect(markup).toContain('data-element="H"');
    expect(markup).not.toContain('data-missing-asset="true"');
  });

  it("compiles a methane molecule blueprint from a SMILES-addressable structured preset", () => {
    const contract = readMoleculeContract("methane");
    const preset = resolveMoleculePresetBySmilesForRenderer("chemistry-basic", contract.smiles);
    const script = compileSceneBlueprintToPlaybookScript({
      subject: "chemistry",
      sceneType: "molecule_2d_methane",
      title: "Methane molecule",
      visualIntent: ["render_structured_molecule", "show_tetrahedral_geometry"],
      emphasisPoints: ["carbon", "hydrogen", "tetrahedral geometry"],
      smiles: contract.smiles,
    });

    expect(script.domain).toBe("chemistry");
    const snapshot = script.steps[0].snapshot;
    if (snapshot.kind !== "molecule_2d_scene") {
      throw new Error(`Expected molecule_2d_scene, got ${snapshot.kind}`);
    }
    expect(snapshot.pack_id).toBe("chemistry-basic");
    expect(snapshot.molecule_id).toBe(contract.moleculeId);
    expect(snapshot.smiles).toBe(contract.smiles);
    expect(snapshot.molecule_asset_id).toBe(contract.assetId);
    expect(snapshot.formula_latex).toBe(contract.formulaLatex);
    expect(elementCounts(snapshot.atoms)).toEqual(contract.elementCounts);
    expect(snapshot.bonds.length).toBeGreaterThanOrEqual(contract.minBondCount);
    expect(preset).toBeTruthy();
    expect(snapshot.atoms).toEqual(preset!.atoms.map((atom) => ({ ...atom, asset_id: "atom-core" })));
    expect(snapshot.bonds).toEqual(preset!.bonds.map((bond) => ({ ...bond, asset_id: "bond-line" })));
    expect(snapshot.atoms).toHaveLength(5);
    expect(snapshot.bonds).toHaveLength(4);
    expect(visualQualityGate(script)).toEqual([]);

    const markup = renderToStaticMarkup(<PlaybookComposition script={script} showSubtitles={false} />);
    expect(markup).toContain("molecule-2d-scene");
    expect(markup).toContain(`data-molecule-id="${contract.moleculeId}"`);
    expect(markup).toContain(`data-smiles="${contract.smiles}"`);
    expect(markup).toContain(`data-asset-id="${contract.assetId}"`);
    expect(markup).toContain(contract.formula);
    expect(markup).toContain('data-element="C"');
    expect(markup).toContain('data-element="H"');
    expect(markup).not.toContain('data-missing-asset="true"');
  });

  it("compiles a glucose molecule blueprint from the chemistry SMILES asset without falling back to water", () => {
    const contract = readMoleculeContract("glucose");
    const script = compileSceneBlueprintToPlaybookScript({
      subject: "chemistry",
      sceneType: "molecule_2d_glucose",
      title: "Glucose molecule",
      visualIntent: ["render_structured_molecule", "use_smiles_asset"],
      emphasisPoints: ["glucose ring", "hydroxyl groups", "C6H12O6"],
      smiles: contract.smiles,
    });

    expect(script.domain).toBe("chemistry");
    const snapshot = script.steps[0].snapshot;
    if (snapshot.kind !== "molecule_2d_scene") {
      throw new Error(`Expected molecule_2d_scene, got ${snapshot.kind}`);
    }

    expect(snapshot.pack_id).toBe("chemistry-basic");
    expect(snapshot.molecule_id).toBe(contract.moleculeId);
    expect(snapshot.smiles).toBe(contract.smiles);
    expect(snapshot.molecule_asset_id).toBe(contract.assetId);
    expect(snapshot.formula_latex).toBe(contract.formulaLatex);
    expect(snapshot.caption).toContain("glucose");
    expect(snapshot.caption).not.toContain("Water");
    expect(elementCounts(snapshot.atoms)).toEqual(contract.elementCounts);
    expect(snapshot.bonds.length).toBeGreaterThanOrEqual(contract.minBondCount);
    expect(visualQualityGate(script)).toEqual([]);

    const markup = renderToStaticMarkup(<PlaybookComposition script={script} showSubtitles={false} />);
    expect(markup).toContain("molecule-2d-scene");
    expect(markup).toContain(`data-molecule-id="${contract.moleculeId}"`);
    expect(markup).toContain(`data-smiles="${contract.smiles}"`);
    expect(markup).toContain(`data-asset-id="${contract.assetId}"`);
    expect(markup).toContain('data-element="C"');
    expect(markup).toContain('data-element="O"');
    expect(markup).toContain(contract.formula);
    expect(markup).not.toContain("H2O");
    expect(markup).not.toContain('data-missing-asset="true"');
  });

  it("compiles a water synthesis blueprint into an asset-backed reaction scene", () => {
    const contract = readReactionContract("reaction-synthesis-water");
    const script = compileSceneBlueprintToPlaybookScript({
      subject: "chemistry",
      sceneType: "reaction_synthesis_water",
      title: "Water synthesis reaction",
      visualIntent: ["show_balanced_reaction", "show_electron_flow"],
      emphasisPoints: ["reactants", "products", "atom conservation"],
    });

    expect(script.domain).toBe("chemistry");
    const snapshot = script.steps[0].snapshot;
    if (snapshot.kind !== "reaction_scene") {
      throw new Error(`Expected reaction_scene, got ${snapshot.kind}`);
    }
    expect(snapshot.pack_id).toBe("chemistry-basic");
    expect(snapshot.reaction_id).toBe(contract.reactionId);
    expect(snapshot.arrows.map((arrow) => arrow.asset_id)).toEqual(
      expect.arrayContaining([contract.arrowAssetId]),
    );
    expect(snapshot.electron_flows.map((flow) => flow.asset_id)).toEqual(
      expect.arrayContaining([contract.electronFlowAssetId]),
    );
    expect(snapshot.reactants.map((participant) => participant.formula_latex)).toEqual(
      contract.reactantFormulas,
    );
    expect(snapshot.products.map((participant) => participant.formula_latex)).toEqual(
      contract.productFormulas,
    );
    expect(snapshot.formula_latex).toBe(contract.formulaLatex);
    expect(visualQualityGate(script)).toEqual([]);

    const markup = renderToStaticMarkup(<PlaybookComposition script={script} showSubtitles={false} />);
    expect(markup).toContain("reaction-scene");
    expect(markup).toContain(`data-reaction-id="${contract.reactionId}"`);
    expect(markup).toContain(`data-asset-id="${contract.arrowAssetId}"`);
    expect(markup).toContain(`data-asset-id="${contract.electronFlowAssetId}"`);
    expect(markup).not.toContain('data-missing-asset="true"');
  });

  it("compiles a derivative tangent blueprint into a math plot scene", () => {
    const script = compileSceneBlueprintToPlaybookScript({
      subject: "math",
      sceneType: "derivative_tangent",
      title: "Derivative tangent",
      visualIntent: ["show_function_curve", "highlight_tangent_slope"],
      emphasisPoints: ["formula", "curve", "tangent"],
    });

    expect(script.domain).toBe("math");
    const snapshot = script.steps[0].snapshot;
    if (snapshot.kind !== "math_plot") {
      throw new Error(`Expected math_plot, got ${snapshot.kind}`);
    }
    expect(snapshot.pack_id).toBe("math-basic");
    expect(snapshot.asset_id).toBe("derivative-tangent-preset");
    expect(snapshot.curves.map((curve) => curve.semantic_role)).toEqual(
      expect.arrayContaining(["curve", "tangent"]),
    );
    expect(visualQualityGate(script)).toEqual([]);

    const markup = renderToStaticMarkup(<PlaybookComposition script={script} showSubtitles={false} />);
    expect(markup).toContain("math-plot-renderer");
    expect(markup).toContain('data-plot-asset-id="derivative-tangent-preset"');
    expect(markup).toContain('data-semantic-role="tangent"');
  });

  it("compiles math plot layout from structured curve input", () => {
    const script = compileSceneBlueprintToPlaybookScript({
      subject: "math",
      sceneType: "math_plot",
      title: "Cubic tangent",
      visualIntent: ["show_function_curve", "highlight_tangent_slope"],
      assetId: "derivative-tangent-preset",
      curves: [
        { expression: "x^3", label: "f(x)=x^3", emphasis: "primary", semanticRole: "curve" },
        { expression: "3*x - 2", label: "tangent slope = 3", emphasis: "accent", semanticRole: "tangent" },
      ],
      params: { a: 3 },
      xMin: -2,
      xMax: 2,
      yMin: -4,
      yMax: 4,
      markerX: 1,
      shadeFrom: 0.9,
      shadeTo: 1.1,
      xLabel: "x",
      yLabel: "f(x)",
      formulaLatex: "f'(1)=3",
      caption: "The cubic tangent slope at x=1 is 3.",
    } as SceneBlueprint);

    const snapshot = script.steps[0].snapshot;
    if (snapshot.kind !== "math_plot") {
      throw new Error(`Expected math_plot, got ${snapshot.kind}`);
    }

    expect(snapshot).toMatchObject({
      pack_id: "math-basic",
      asset_id: "derivative-tangent-preset",
      curves: [
        { expression: "x^3", label: "f(x)=x^3", emphasis: "primary", semantic_role: "curve" },
        { expression: "3*x - 2", label: "tangent slope = 3", emphasis: "accent", semantic_role: "tangent" },
      ],
      params: { a: 3 },
      x_min: -2,
      x_max: 2,
      y_min: -4,
      y_max: 4,
      marker_x: 1,
      shade_from: 0.9,
      shade_to: 1.1,
      x_label: "x",
      y_label: "f(x)",
      formula_latex: "f'(1)=3",
      caption: "The cubic tangent slope at x=1 is 3.",
    });
    expect(visualQualityGate(script)).toEqual([]);
  });

  it("compiles a BFS blueprint into a graph scene with algorithm state", () => {
    const script = compileSceneBlueprintToPlaybookScript({
      subject: "algorithm",
      sceneType: "bfs_graph",
      title: "BFS graph",
      visualIntent: ["show_graph_traversal", "show_queue_state", "highlight_active_edge"],
      emphasisPoints: ["current node", "queue", "visited set"],
    });

    expect(script.domain).toBe("algorithm");
    const snapshot = script.steps[0].snapshot;
    if (snapshot.kind !== "graph_scene") {
      throw new Error(`Expected graph_scene, got ${snapshot.kind}`);
    }
    expect(snapshot.pack_id).toBe("algorithm-code-basic");
    expect(snapshot.asset_id).toBe("bfs-graph-preset");
    expect(snapshot.current_node_id).toBe("A");
    expect(snapshot.queue_node_ids).toEqual(["B", "C"]);
    expect(visualQualityGate(script)).toEqual([]);

    const markup = renderToStaticMarkup(<PlaybookComposition script={script} showInlineCode={true} showSubtitles={false} />);
    expect(markup).toContain("graph-scene-renderer");
    expect(markup).toContain('data-graph-asset-id="bfs-graph-preset"');
    expect(markup).toContain('data-node-state="current"');
    expect(markup).toContain('data-node-state="queue"');
    expect(markup).toContain('data-edge-state="active"');
  });

  it("compiles BFS graph layout from structured blueprint input", () => {
    const script = compileSceneBlueprintToPlaybookScript({
      subject: "algorithm",
      sceneType: "bfs_graph",
      title: "BFS custom graph",
      visualIntent: ["show_graph_traversal", "show_queue_state", "highlight_active_edge"],
      emphasisPoints: ["current node", "queue", "visited set"],
      graphNodes: [
        { id: "root", label: "R", x: -2, y: 0 },
        { id: "left", label: "L", x: 0, y: -1 },
        { id: "right", label: "Q", x: 2, y: 1 },
      ],
      graphEdges: [
        { id: "root-left", source: "root", target: "left" },
        { id: "root-right", source: "root", target: "right" },
      ],
      currentNodeId: "left",
      visitedNodeIds: ["root"],
      queueNodeIds: ["right"],
      activeEdgeIds: ["root-left"],
    });

    const snapshot = script.steps[0].snapshot;
    if (snapshot.kind !== "graph_scene") {
      throw new Error(`Expected graph_scene, got ${snapshot.kind}`);
    }
    expect(snapshot.nodes.map((node) => node.id)).toEqual(["root", "left", "right"]);
    expect(snapshot.edges.map((edge) => edge.id)).toEqual(["root-left", "root-right"]);
    expect(snapshot.current_node_id).toBe("left");
    expect(snapshot.visited_node_ids).toEqual(["root"]);
    expect(snapshot.queue_node_ids).toEqual(["right"]);
    expect(snapshot.active_edge_ids).toEqual(["root-left"]);
    expect(visualQualityGate(script)).toEqual([]);
  });

  it("compiles binary search layout from structured blueprint input", () => {
    const script = compileSceneBlueprintToPlaybookScript({
      subject: "algorithm",
      sceneType: "binary_search",
      title: "Binary search custom target",
      visualIntent: ["show_search_window", "highlight_midpoint", "trace_branch"],
      emphasisPoints: ["low pointer", "mid pointer", "high pointer"],
      arrayValues: ["1", "3", "8", "13", "21", "34", "55", "89"],
      target: "21",
    });

    expect(script.domain).toBe("algorithm");
    const snapshot = script.steps[0].snapshot;
    if (snapshot.kind !== "code_trace_scene") {
      throw new Error(`Expected code_trace_scene, got ${snapshot.kind}`);
    }
    expect(snapshot.pack_id).toBe("algorithm-code-basic");
    expect(snapshot.asset_id).toBe("binary-search-trace-preset");
    expect(snapshot.array_values).toEqual(["1", "3", "8", "13", "21", "34", "55", "89"]);
    expect(snapshot.variables?.target).toBe("21");
    expect(snapshot.search_range).toEqual([0, 7]);
    expect(snapshot.pointers?.map((pointer) => [pointer.id, pointer.index])).toEqual([
      ["low", 0],
      ["mid", 3],
      ["high", 7],
    ]);
    expect(snapshot.active_indices).toEqual([3]);
    expect(snapshot.active_line).toBe(2);
    expect(script.steps[0].code_highlight?.variables?.target).toBe("21");
    expect(visualQualityGate(script)).toEqual([]);

    const markup = renderToStaticMarkup(<PlaybookComposition script={script} showInlineCode={true} showSubtitles={false} />);
    expect(markup).toContain("code-trace-scene");
    expect(markup).toContain('data-trace-asset-id="binary-search-trace-preset"');
    expect(markup).toContain('data-pointer-id="mid"');
    expect(markup).toContain("21");
  });

  it("compiles recursion stack layout from structured blueprint input", () => {
    const script = compileSceneBlueprintToPlaybookScript({
      subject: "algorithm",
      sceneType: "recursion_stack",
      title: "Fibonacci recursion stack",
      visualIntent: ["show_call_stack", "trace_active_recursive_call"],
      emphasisPoints: ["active frame", "waiting frame", "return line"],
      stackFrames: [
        {
          id: "fib-5",
          label: "fib(5)",
          depth: 0,
          state: "waiting",
          variables: { n: "5", pending: "fib(4)+fib(3)" },
        },
        {
          id: "fib-4",
          label: "fib(4)",
          depth: 1,
          state: "active",
          variables: { n: "4", branch: "left" },
        },
      ],
      currentFrameId: "fib-4",
      codeTrace: {
        language: "python",
        lines: [
          "def fib(n):",
          "    if n <= 1:",
          "        return n",
          "    return fib(n - 1) + fib(n - 2)",
        ],
        activeLines: [3],
        activeLine: 3,
      },
      caption: "Custom recursion stack should come from the blueprint, not the factorial demo.",
    } as SceneBlueprint & {
      stackFrames: Array<{
        id: string;
        label: string;
        depth: number;
        state: string;
        variables: Record<string, string>;
      }>;
      currentFrameId: string;
      codeTrace: {
        language: string;
        lines: string[];
        activeLines: number[];
        activeLine: number;
      };
    });

    const snapshot = script.steps[0].snapshot;
    if (snapshot.kind !== "call_stack_scene") {
      throw new Error(`Expected call_stack_scene, got ${snapshot.kind}`);
    }
    expect(snapshot.pack_id).toBe("algorithm-code-basic");
    expect(snapshot.asset_id).toBe("recursion-stack-preset");
    expect(snapshot.frames).toEqual([
      {
        id: "fib-5",
        label: "fib(5)",
        depth: 0,
        state: "waiting",
        asset_id: "stack-frame",
        variables: { n: "5", pending: "fib(4)+fib(3)" },
      },
      {
        id: "fib-4",
        label: "fib(4)",
        depth: 1,
        state: "active",
        asset_id: "call-frame",
        variables: { n: "4", branch: "left" },
      },
    ]);
    expect(snapshot.current_frame_id).toBe("fib-4");
    expect(snapshot.code_trace).toEqual({
      language: "python",
      lines: [
        "def fib(n):",
        "    if n <= 1:",
        "        return n",
        "    return fib(n - 1) + fib(n - 2)",
      ],
      active_lines: [3],
      active_line: 3,
      asset_id: "active-line",
    });
    expect(visualQualityGate(script)).toEqual([]);

    const markup = renderToStaticMarkup(<PlaybookComposition script={script} showInlineCode={true} showSubtitles={false} />);
    expect(markup).toContain("call-stack-scene");
    expect(markup).toContain('data-stack-asset-id="recursion-stack-preset"');
    expect(markup).toContain('data-frame-id="fib-4"');
    expect(markup).toContain("fib(4)");
    expect(markup).toContain("return fib(n - 1) + fib(n - 2)");
    expect(markup).not.toContain("factorial(4)");
    expect(markup).not.toContain('data-missing-asset="true"');
  });
});
