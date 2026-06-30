export type SubjectVisualKitSubject =
  | "math"
  | "physics"
  | "chemistry"
  | "biology"
  | "geography"
  | "algorithm"
  | "code";

export type AssetLicense =
  | "public-domain"
  | "cc0"
  | "cc-by"
  | "mit"
  | "internal";

export interface AssetManifestEntry {
  id: string;
  type: "svg" | "image" | "lottie" | "json";
  path: string;
  tags: string[];
  semanticRoles: string[];
  attribution?: string | null;
  license: AssetLicense;
}

export interface SubjectVisualKit {
  packId: string;
  subject: SubjectVisualKitSubject;
  version: string;
  license: AssetLicense;
  sceneTemplates: string[];
  rendererKinds: string[];
  assets: AssetManifestEntry[];
}

const ASSET_PACKS: SubjectVisualKit[] = [
  {
    packId: "geography-basic",
    subject: "geography",
    version: "0.1.0",
    license: "internal",
    sceneTemplates: ["geo_map_scene"],
    rendererKinds: ["narration_card"],
    assets: [
      {
        id: "east-asia-map-placeholder",
        type: "svg",
        path: "/assets/metaview-kits/geography-basic/east-asia-map-placeholder.svg",
        tags: ["map", "land", "ocean", "monsoon"],
        semanticRoles: ["land", "ocean", "map_layer"],
        attribution: "MetaView internal placeholder",
        license: "internal",
      },
      {
        id: "monsoon-wind-arrow",
        type: "svg",
        path: "/assets/metaview-kits/geography-basic/monsoon-wind-arrow.svg",
        tags: ["wind", "monsoon", "arrow"],
        semanticRoles: ["wind"],
        attribution: "MetaView internal placeholder",
        license: "internal",
      },
    ],
  },
  {
    packId: "physics-basic",
    subject: "physics",
    version: "0.1.0",
    license: "internal",
    sceneTemplates: ["physics_force_scene"],
    rendererKinds: ["motion_scene"],
    assets: [
      {
        id: "force-vector-arrow",
        type: "svg",
        path: "/assets/metaview-kits/physics-basic/force-vector-arrow.svg",
        tags: ["force", "vector", "arrow"],
        semanticRoles: ["force"],
        attribution: "MetaView internal placeholder",
        license: "internal",
      },
      {
        id: "projectile-body-dot",
        type: "svg",
        path: "/assets/metaview-kits/physics-basic/projectile-body-dot.svg",
        tags: ["object", "projectile", "motion"],
        semanticRoles: ["object", "velocity"],
        attribution: "MetaView internal placeholder",
        license: "internal",
      },
    ],
  },
];

export function listAssetPacks(): SubjectVisualKit[] {
  return ASSET_PACKS;
}

export function getAssetPack(packId: string): SubjectVisualKit | undefined {
  return ASSET_PACKS.find((pack) => pack.packId === packId);
}

export function findAssetByRole(
  subject: SubjectVisualKitSubject,
  semanticRole: string,
): AssetManifestEntry | undefined {
  return ASSET_PACKS.find((pack) => pack.subject === subject)?.assets.find((asset) =>
    asset.semanticRoles.includes(semanticRole),
  );
}
