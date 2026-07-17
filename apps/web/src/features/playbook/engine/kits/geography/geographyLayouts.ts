import { resolveAssetByRole, resolveAssetForRenderer } from "../../assets/assetResolver";
import type { SubjectVisualKitSubject } from "../../assets/assetRegistry";
import type { GeoMapFlow, GeoMapSceneSnapshot, GeoPressureCenter } from "../../types";

export interface GeoFlowLayoutInput {
  id?: string;
  semanticRole?: "wind" | "monsoon_flow" | string;
  from?: [number, number];
  to?: [number, number];
  label?: string;
  assetId?: string;
  strength?: number;
}

export interface GeoMapLayoutInput {
  packId: string;
  mapRegion?: "east_asia" | "world" | string;
  flows?: GeoFlowLayoutInput[];
  pressureCenters?: GeoPressureCenter[];
  particlePreset?: GeoMapSceneSnapshot["particle_preset"];
  caption?: string;
}

function resolveAssetIdByRole(
  rendererKind: string,
  subject: SubjectVisualKitSubject,
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

function explicitOrRoleAssetId(
  explicitAssetId: string | undefined,
  packId: string,
  semanticRole: string,
  fallbacks: string[] = [],
): string | undefined {
  if (explicitAssetId) return explicitAssetId;
  return resolveAssetIdByRole("geo_map_scene", "geography", packId, semanticRole, fallbacks);
}

function defaultGeoFlow(): GeoFlowLayoutInput & Required<Pick<GeoFlowLayoutInput, "id" | "semanticRole" | "from" | "to" | "label" | "strength">> {
  return {
    id: "summer-monsoon",
    semanticRole: "monsoon_flow",
    from: [78, 68],
    to: [42, 38],
    label: "summer monsoon",
    strength: 1.1,
  };
}

function compileGeoFlows(flows: GeoFlowLayoutInput[] | undefined, packId: string): GeoMapFlow[] {
  const sourceFlows = flows?.length ? flows : [defaultGeoFlow()];
  return sourceFlows.map((flow, index) => {
    const semanticRole = flow.semanticRole ?? "monsoon_flow";
    return {
      id: flow.id ?? `flow-${index + 1}`,
      semantic_role: semanticRole,
      from: flow.from ?? defaultGeoFlow().from,
      to: flow.to ?? defaultGeoFlow().to,
      label: flow.label ?? (semanticRole === "monsoon_flow" ? "summer monsoon" : semanticRole),
      asset_id: explicitOrRoleAssetId(flow.assetId, packId, semanticRole, ["wind"]),
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

export function compileGeoMapLayout(input: GeoMapLayoutInput): GeoMapSceneSnapshot {
  const mapAssetId = resolveAssetIdByRole("geo_map_scene", "geography", input.packId, "map_layer", ["land"]);
  const landAssetId = resolveAssetIdByRole("geo_map_scene", "geography", input.packId, "land", ["map_layer"]);
  const oceanAssetId = resolveAssetIdByRole("geo_map_scene", "geography", input.packId, "ocean");
  const mapRegion = input.mapRegion ?? "east_asia";

  return {
    kind: "geo_map_scene",
    pack_id: input.packId,
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
    flows: compileGeoFlows(input.flows, input.packId),
    pressure_centers: input.pressureCenters ?? defaultPressureCenters(),
    particle_preset: input.particlePreset ?? "moisture_particles",
    caption: input.caption ?? "Land-sea thermal contrast reverses seasonal wind direction.",
  };
}
