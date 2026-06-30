import { resolveAssetById, resolveAssetByRole, resolveAssetForRenderer } from "../assets/assetResolver";
import { visualQualityGate, type VisualQualityWarning } from "../assets/visualQualityGate";
import type {
  GeoMapFlow,
  GeoMapSceneSnapshot,
  GeoPressureCenter,
  MetaStep,
  PhysicsForceSceneSnapshot,
  PhysicsSceneVector,
  PlaybookScript,
} from "../types";

type GeoSceneType = "geo_map_scene" | "east_asia_monsoon";
type PhysicsSceneType = "physics_force_scene" | "projectile_motion";
type SceneBlueprintSubject = "geography" | "physics";

interface SceneBlueprintBase {
  id?: string;
  subject: SceneBlueprintSubject;
  sceneType: GeoSceneType | PhysicsSceneType;
  title: string;
  visualIntent: string[];
  emphasisPoints?: string[];
  packId?: string;
  durationFrames?: number;
  caption?: string;
}

export interface GeoFlowIntent {
  id?: string;
  semanticRole?: "wind" | "monsoon_flow" | string;
  from?: [number, number];
  to?: [number, number];
  label?: string;
  assetId?: string;
  strength?: number;
}

export interface GeographySceneBlueprint extends SceneBlueprintBase {
  subject: "geography";
  sceneType: GeoSceneType;
  mapRegion?: "east_asia" | "world" | string;
  flows?: GeoFlowIntent[];
  pressureCenters?: GeoPressureCenter[];
  particlePreset?: GeoMapSceneSnapshot["particle_preset"];
}

export interface PhysicsObjectIntent {
  id?: string;
  label?: string;
  semanticRole?: "projectile" | "object" | "block" | string;
  assetId?: string;
  x?: number;
  y?: number;
  radius?: number;
}

export interface PhysicsVectorIntent {
  id?: string;
  target?: string;
  semanticRole: "force" | "velocity" | "acceleration" | string;
  dx: number;
  dy: number;
  label?: string;
  magnitude?: string;
}

export interface PhysicsForceSceneBlueprint extends SceneBlueprintBase {
  subject: "physics";
  sceneType: PhysicsSceneType;
  object?: PhysicsObjectIntent;
  vectors?: PhysicsVectorIntent[];
  trajectory?: Array<[number, number]>;
  formulaLatex?: string;
}

export type SceneBlueprint = GeographySceneBlueprint | PhysicsForceSceneBlueprint;

export interface SceneBlueprintCompileResult {
  playbookScript: PlaybookScript;
  warnings: VisualQualityWarning[];
}

const DEFAULT_GEO_PACK_ID = "geography-earth-basic";
const DEFAULT_PHYSICS_PACK_ID = "physics-basic";
const DEFAULT_DURATION_FRAMES = 90;

function normalizeDurationFrames(durationFrames: number | undefined): number {
  if (typeof durationFrames !== "number" || !Number.isFinite(durationFrames)) return DEFAULT_DURATION_FRAMES;
  return Math.max(1, Math.round(durationFrames));
}

function stepIdFor(blueprint: SceneBlueprint): string {
  const source = blueprint.id ?? `${blueprint.subject}_${blueprint.sceneType}`;
  return source
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "") || `${blueprint.subject}_scene`;
}

function resolveAssetIdByRole(
  rendererKind: "geo_map_scene" | "physics_force_scene",
  subject: "geography" | "physics",
  packId: string,
  semanticRole: string,
  fallbacks: string[] = [],
): string | undefined {
  for (const role of [semanticRole, ...fallbacks]) {
    const asset =
      resolveAssetForRenderer(rendererKind, role, packId) ??
      resolveAssetByRole(subject, role, packId) ??
      resolveAssetForRenderer(rendererKind, role) ??
      resolveAssetByRole(subject, role);
    if (asset) return asset.id;
  }
  return undefined;
}

function resolveExplicitOrRoleAssetId(
  explicitAssetId: string | undefined,
  rendererKind: "geo_map_scene" | "physics_force_scene",
  subject: "geography" | "physics",
  packId: string,
  semanticRole: string,
  fallbacks: string[] = [],
): string | undefined {
  if (explicitAssetId) return explicitAssetId;
  return resolveAssetIdByRole(rendererKind, subject, packId, semanticRole, fallbacks);
}

function defaultGeoFlow(): GeoFlowIntent & Required<Pick<GeoFlowIntent, "id" | "semanticRole" | "from" | "to" | "label" | "strength">> {
  return {
    id: "summer-monsoon",
    semanticRole: "monsoon_flow",
    from: [78, 68],
    to: [42, 38],
    label: "summer monsoon",
    strength: 1.1,
  };
}

function compileGeoFlows(flows: GeoFlowIntent[] | undefined, packId: string): GeoMapFlow[] {
  const sourceFlows = flows?.length ? flows : [defaultGeoFlow()];
  return sourceFlows.map((flow, index) => {
    const semanticRole = flow.semanticRole ?? "monsoon_flow";
    return {
      id: flow.id ?? `flow-${index + 1}`,
      semantic_role: semanticRole,
      from: flow.from ?? defaultGeoFlow().from,
      to: flow.to ?? defaultGeoFlow().to,
      label: flow.label ?? (semanticRole === "monsoon_flow" ? "summer monsoon" : semanticRole),
      asset_id: resolveExplicitOrRoleAssetId(
        flow.assetId,
        "geo_map_scene",
        "geography",
        packId,
        semanticRole,
        ["wind"],
      ),
      strength: flow.strength ?? 1,
    };
  });
}

function defaultPressureCenters(): GeoPressureCenter[] {
  return [
    { id: "land-low", kind: "low", x: 38, y: 35, label: "land low" },
    { id: "ocean-high", kind: "high", x: 76, y: 64, label: "ocean high" },
  ];
}

function compileGeographySnapshot(blueprint: GeographySceneBlueprint): GeoMapSceneSnapshot {
  const packId = blueprint.packId ?? DEFAULT_GEO_PACK_ID;
  const mapAssetId = resolveAssetIdByRole("geo_map_scene", "geography", packId, "map_layer", ["land"]);
  const landAssetId = resolveAssetIdByRole("geo_map_scene", "geography", packId, "land", ["map_layer"]);
  const oceanAssetId = resolveAssetIdByRole("geo_map_scene", "geography", packId, "ocean");
  const mapRegion = blueprint.mapRegion ?? "east_asia";

  return {
    kind: "geo_map_scene",
    pack_id: packId,
    map_region: mapRegion,
    layers: [
      {
        id: "map",
        semantic_role: "map_layer",
        label: mapRegion === "east_asia" ? "East Asia map" : `${mapRegion} map`,
        asset_id: mapAssetId,
      },
      {
        id: "land",
        semantic_role: "land",
        label: "heated continent",
        asset_id: landAssetId === mapAssetId ? undefined : landAssetId,
      },
      {
        id: "ocean",
        semantic_role: "ocean",
        label: "western Pacific",
        asset_id: oceanAssetId,
      },
    ],
    flows: compileGeoFlows(blueprint.flows, packId),
    pressure_centers: blueprint.pressureCenters ?? defaultPressureCenters(),
    particle_preset: blueprint.particlePreset ?? "moisture_particles",
    caption: blueprint.caption ?? "Land-sea thermal contrast reverses seasonal wind direction.",
  };
}

function roundToOneDecimal(value: number): number {
  return Math.round(value * 10) / 10;
}

function compileProjectileTrajectory(): Array<[number, number]> {
  return Array.from({ length: 5 }, (_, index) => {
    const t = index / 4;
    return [roundToOneDecimal(18 + 54 * t), roundToOneDecimal(34 + 44 * t * t)];
  });
}

function defaultPhysicsVectors(targetId: string): PhysicsSceneVector[] {
  return [
    { id: "vx", target: targetId, semantic_role: "velocity", dx: 28, dy: 0, label: "v_x" },
    { id: "vy", target: targetId, semantic_role: "velocity", dx: 0, dy: 18, label: "v_y" },
    { id: "g", target: targetId, semantic_role: "acceleration", dx: 0, dy: 24, label: "g" },
    { id: "force", target: targetId, semantic_role: "force", dx: -16, dy: 8, label: "F" },
  ];
}

function compilePhysicsVectors(vectors: PhysicsVectorIntent[] | undefined, targetId: string): PhysicsSceneVector[] {
  if (!vectors?.length) return defaultPhysicsVectors(targetId);
  return vectors.map((vector, index) => ({
    id: vector.id ?? `${vector.semanticRole}-${index + 1}`,
    target: vector.target ?? targetId,
    semantic_role: vector.semanticRole,
    dx: vector.dx,
    dy: vector.dy,
    label: vector.label,
    magnitude: vector.magnitude,
  }));
}

function compilePhysicsSnapshot(blueprint: PhysicsForceSceneBlueprint): PhysicsForceSceneSnapshot {
  const packId = blueprint.packId ?? DEFAULT_PHYSICS_PACK_ID;
  const objectIntent = blueprint.object ?? {};
  const objectId = objectIntent.id ?? "body";
  const objectRole = objectIntent.semanticRole ?? "projectile";
  const explicitAsset = objectIntent.assetId ? resolveAssetById(packId, objectIntent.assetId) : undefined;
  const objectAssetId =
    objectIntent.assetId ??
    explicitAsset?.id ??
    resolveAssetIdByRole("physics_force_scene", "physics", packId, objectRole, ["object"]);

  return {
    kind: "physics_force_scene",
    pack_id: packId,
    objects: [
      {
        id: objectId,
        label: objectIntent.label ?? "projectile",
        x: objectIntent.x ?? 30,
        y: objectIntent.y ?? 42,
        asset_id: objectAssetId,
        radius: objectIntent.radius,
      },
    ],
    vectors: compilePhysicsVectors(blueprint.vectors, objectId),
    trajectory: blueprint.trajectory ?? compileProjectileTrajectory(),
    formula_latex: blueprint.formulaLatex ?? "x=v_0t,\\quad y=\\frac12gt^2",
    caption:
      blueprint.caption ??
      "Horizontal velocity stays constant while vertical acceleration bends the path.",
  };
}

function compileSnapshot(blueprint: SceneBlueprint): GeoMapSceneSnapshot | PhysicsForceSceneSnapshot {
  if (blueprint.subject === "geography") return compileGeographySnapshot(blueprint);
  return compilePhysicsSnapshot(blueprint);
}

function compileStep(blueprint: SceneBlueprint): MetaStep<GeoMapSceneSnapshot | PhysicsForceSceneSnapshot> {
  const snapshot = compileSnapshot(blueprint);
  const endFrame = normalizeDurationFrames(blueprint.durationFrames);
  return {
    step_id: stepIdFor(blueprint),
    end_frame: endFrame,
    title: blueprint.title,
    voiceover_text: snapshot.caption ?? blueprint.title,
    snapshot,
    code_highlight: null,
    tokens: [],
  };
}

export function compileSceneBlueprintToPlaybookScript(blueprint: SceneBlueprint): PlaybookScript {
  const endFrame = normalizeDurationFrames(blueprint.durationFrames);
  const step = compileStep(blueprint);
  return {
    schema_version: "1.0.0",
    fps: 30,
    total_frames: endFrame,
    domain: blueprint.subject,
    title: blueprint.title,
    summary: blueprint.caption ?? blueprint.title,
    parameter_controls: [],
    steps: [step],
  };
}

export function compileSceneBlueprint(blueprint: SceneBlueprint): SceneBlueprintCompileResult {
  const playbookScript = compileSceneBlueprintToPlaybookScript(blueprint);
  return {
    playbookScript,
    warnings: visualQualityGate(playbookScript),
  };
}
