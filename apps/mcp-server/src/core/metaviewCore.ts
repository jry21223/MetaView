import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { fileURLToPath } from "node:url";

import { DOMAIN_CAPABILITIES, domainCapability, type DomainSupportLevel } from "../../../web/src/features/playbook/engine/domainCapabilities";
import {
  listAssetPacks as listRegistryAssetPacks,
  type AssetLicense,
  type AssetManifestEntry,
  type SubjectVisualKit,
  type SubjectVisualKitSubject,
} from "../../../web/src/features/playbook/engine/assets/assetRegistry";
import type { DirectorScript, PlaybookScript } from "../../../web/src/features/playbook/engine/types";
import assetManifestSchema from "../../../web/public/assets/metaview-kits/manifest.schema.json";

export interface SubjectCapabilitySummary {
  id: string;
  support: DomainSupportLevel;
  renderers: string[];
  assetPacks: string[];
  flagshipCases: string[];
  message?: string;
}

export interface ListCapabilitiesResult {
  generatedBy: "metaview-core";
  subjects: SubjectCapabilitySummary[];
}

export interface AssetPackSummary {
  packId: string;
  subject: SubjectVisualKitSubject;
  version: string;
  license: AssetLicense;
  sceneTemplates: string[];
  rendererKinds: string[];
  semanticRoles: string[];
  resourceUri: string;
}

export interface ListAssetPacksInput {
  subject?: SubjectVisualKitSubject;
}

export interface ListAssetPacksResult {
  generatedBy: "metaview-core";
  packs: AssetPackSummary[];
}

export interface MetaViewResource {
  uri: string;
  mimeType: "application/json" | "image/svg+xml" | "text/plain";
  text: string;
}

export interface ListedMetaViewResource {
  uri: string;
  name: string;
  mimeType: MetaViewResource["mimeType"];
  description?: string;
}

export interface AssetResolutionInput {
  subject: SubjectVisualKitSubject;
  sceneType: string;
  semanticRoles: string[];
}

export interface ResolvedAsset {
  semanticRole: string;
  assetId: string;
  packId: string;
  resourceUri: string;
  license: AssetLicense;
  attribution?: string | null;
  commercialUseStatus: AssetManifestEntry["commercialUseStatus"];
  sourceUrl?: string | null;
  licenseUrl?: string | null;
}

export interface AssetResolutionResult {
  generatedBy: "metaview-core";
  subject: SubjectVisualKitSubject;
  sceneType: string;
  assets: ResolvedAsset[];
  missing: string[];
}

export interface CompileSceneBlueprintInput {
  topic: string;
  subject?: SubjectVisualKitSubject;
  audience?: string;
  durationSeconds?: number;
  style?: string;
  language?: string;
}

export interface SceneBlueprint {
  subject: SubjectVisualKitSubject | "unknown";
  sceneType: string;
  topic: string;
  audience?: string;
  durationSeconds?: number;
  style?: string;
  language?: string;
  visualIntent: string[];
  requiredAssets: string[];
  emphasisPoints: string[];
  provenance: {
    generatedBy: "metaview-core";
    route: "deterministic-blueprint";
    renderingContract: "PlaybookScript";
  };
}

export interface CompileSceneBlueprintResult {
  generatedBy: "metaview-core";
  sceneBlueprint: SceneBlueprint;
  warnings: string[];
}

export interface VisualQualityReportWarning {
  severity: "high" | "medium" | "low";
  code: string;
  message: string;
  stepId?: string;
  snapshotKind?: string;
  path?: string;
}

export interface VisualQualityReport {
  generatedBy: "metaview-core";
  score: number;
  pass: boolean;
  warnings: VisualQualityReportWarning[];
  provenance: {
    renderingContract: "PlaybookScript";
    qualityGate: "visualQualityGate";
  };
}

export interface ValidateVisualQualityInput {
  playbookScript: PlaybookScript;
  directorScript?: DirectorScript | null;
}

export interface MetaViewCore {
  listCapabilities(): ListCapabilitiesResult;
  listAssetPacks(input?: ListAssetPacksInput): ListAssetPacksResult;
  listResources(): ListedMetaViewResource[];
  readResource(uri: string): MetaViewResource;
}

const FLAGSHIP_CASES_BY_SUBJECT: Partial<Record<SubjectVisualKitSubject, string[]>> = {
  geography: ["east_asia_monsoon"],
  physics: ["projectile_motion"],
};

const SCHEMA_SUMMARIES = {
  "playbook-script": {
    title: "MetaView PlaybookScript",
    description:
      "Summary resource for the PlaybookScript rendering contract. The authoritative contracts remain in apps/api/app/domain/models/playbook.py and apps/web/src/features/playbook/engine/types.ts.",
    authoritativeSources: [
      "apps/api/app/domain/models/playbook.py",
      "apps/web/src/features/playbook/engine/types.ts",
    ],
    requiredTopLevelFields: ["version", "title", "domain", "total_frames", "steps"],
    renderingBoundary: "PlaybookScript is the only rendering exit for MetaView preview/export.",
  },
  "director-script": {
    title: "MetaView DirectorScript",
    description:
      "Summary resource for the DirectorScript direction contract. The authoritative contracts remain in apps/api/app/domain/models/director.py and apps/web/src/features/playbook/engine/director/types.ts.",
    authoritativeSources: [
      "apps/api/app/domain/models/director.py",
      "apps/web/src/features/playbook/engine/director/types.ts",
    ],
    requiredTopLevelFields: ["version", "beats"],
    boundary: "DirectorScript controls framing and pacing; it does not replace PlaybookScript content.",
  },
  "asset-manifest": assetManifestSchema,
} as const;

const PUBLIC_ASSET_ROOT = fileURLToPath(new URL("../../../web/public", import.meta.url));

function uniqueSorted(values: string[]): string[] {
  return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b));
}

function splitRendererKinds(primaryRenderer: string): string[] {
  return primaryRenderer
    .split("/")
    .map((item) => item.trim())
    .filter(Boolean);
}

function resourceUriForPack(packId: string): string {
  return `metaview://kits/${packId}/manifest`;
}

function assetBasename(asset: AssetManifestEntry): string {
  if (!asset.path) {
    throw new Error(`MetaView asset is missing a path: ${asset.id}`);
  }
  return basename(asset.path);
}

function resourceUriForAsset(pack: SubjectVisualKit, asset: AssetManifestEntry): string {
  return `metaview://assets/${pack.packId}/${assetBasename(asset)}`;
}

function semanticRolesForPack(pack: SubjectVisualKit): string[] {
  return uniqueSorted(pack.assets.flatMap((asset) => asset.semanticRoles));
}

function packSummary(pack: SubjectVisualKit): AssetPackSummary {
  return {
    packId: pack.packId,
    subject: pack.subject,
    version: pack.version,
    license: pack.license,
    sceneTemplates: [...pack.sceneTemplates],
    rendererKinds: [...pack.rendererKinds],
    semanticRoles: semanticRolesForPack(pack),
    resourceUri: resourceUriForPack(pack.packId),
  };
}

function packManifestForResource(pack: SubjectVisualKit): SubjectVisualKit & {
  assets: Array<AssetManifestEntry & { resourceUri: string; usage: string }>;
} {
  return {
    ...pack,
    assets: pack.assets.map((asset) => ({
      ...asset,
      resourceUri: resourceUriForAsset(pack, asset),
      usage: `Use through ${pack.rendererKinds.join(", ")} semantic roles; do not hand-place raw SVG paths in generated output.`,
    })),
  };
}

function jsonResource(uri: string, value: unknown): MetaViewResource {
  return {
    uri,
    mimeType: "application/json",
    text: `${JSON.stringify(value, null, 2)}\n`,
  };
}

function findPack(packId: string): SubjectVisualKit {
  const pack = listRegistryAssetPacks().find((item) => item.packId === packId);
  if (!pack) {
    throw new Error(`Unknown MetaView asset pack: ${packId}`);
  }
  return pack;
}

function parseResourceUri(uri: string): URL {
  const parsed = new URL(uri);
  if (parsed.protocol !== "metaview:") {
    throw new Error(`Unsupported MetaView resource URI: ${uri}`);
  }
  return parsed;
}

export function createMetaViewCore(): MetaViewCore {
  return {
    listCapabilities(): ListCapabilitiesResult {
      const packs = listRegistryAssetPacks();
      const subjects = Object.values(DOMAIN_CAPABILITIES).map((capability) => {
        const subjectPacks = packs.filter((pack) => pack.subject === capability.domain);
        const subject = capability.domain as SubjectVisualKitSubject;
        return {
          id: capability.domain,
          support: capability.support,
          renderers: uniqueSorted([
            ...splitRendererKinds(capability.primaryRenderer),
            ...subjectPacks.flatMap((pack) => pack.rendererKinds),
          ]),
          assetPacks: subjectPacks.map((pack) => pack.packId),
          flagshipCases: FLAGSHIP_CASES_BY_SUBJECT[subject] ?? [],
          ...(capability.message ? { message: capability.message } : {}),
        };
      });

      return { generatedBy: "metaview-core", subjects };
    },

    listAssetPacks(input: ListAssetPacksInput = {}): ListAssetPacksResult {
      const packs = listRegistryAssetPacks()
        .filter((pack) => !input.subject || pack.subject === input.subject)
        .map(packSummary);

      return { generatedBy: "metaview-core", packs };
    },

    listResources(): ListedMetaViewResource[] {
      const subjectResources = this.listCapabilities().subjects.map((subject) => ({
        uri: `metaview://subjects/${subject.id}`,
        name: `MetaView subject: ${subject.id}`,
        mimeType: "application/json" as const,
        description: `Capability metadata for ${subject.id}.`,
      }));
      const schemaResources = Object.keys(SCHEMA_SUMMARIES).map((schemaId) => ({
        uri: `metaview://schemas/${schemaId}`,
        name: `MetaView schema: ${schemaId}`,
        mimeType: "application/json" as const,
      }));
      const kitResources = listRegistryAssetPacks().map((pack) => ({
        uri: resourceUriForPack(pack.packId),
        name: `MetaView visual kit: ${pack.packId}`,
        mimeType: "application/json" as const,
        description: `${pack.subject} visual kit manifest.`,
      }));
      const assetResources = listRegistryAssetPacks().flatMap((pack) =>
        pack.assets.map((asset) => ({
          uri: resourceUriForAsset(pack, asset),
          name: `MetaView asset: ${asset.id}`,
          mimeType: asset.type === "svg" ? ("image/svg+xml" as const) : ("text/plain" as const),
          description: `${pack.packId}/${asset.id} (${asset.license}).`,
        })),
      );

      return [
        {
          uri: "metaview://subjects",
          name: "MetaView subjects",
          mimeType: "application/json",
          description: "All discoverable subject capabilities.",
        },
        ...subjectResources,
        ...schemaResources,
        ...kitResources,
        ...assetResources,
      ];
    },

    readResource(uri: string): MetaViewResource {
      const parsed = parseResourceUri(uri);
      const pathParts = parsed.pathname.split("/").filter(Boolean);

      if (parsed.hostname === "subjects" && pathParts.length === 0) {
        return jsonResource(uri, this.listCapabilities());
      }

      if (parsed.hostname === "subjects" && pathParts.length === 1) {
        const capability = domainCapability(pathParts[0]);
        const assetPacks = this.listAssetPacks({ subject: capability.domain as SubjectVisualKitSubject }).packs;
        return jsonResource(uri, {
          ...capability,
          renderers: splitRendererKinds(capability.primaryRenderer),
          assetPacks,
        });
      }

      if (parsed.hostname === "schemas" && pathParts.length === 1) {
        const schema = SCHEMA_SUMMARIES[pathParts[0] as keyof typeof SCHEMA_SUMMARIES];
        if (!schema) {
          throw new Error(`Unknown MetaView schema resource: ${pathParts[0]}`);
        }
        return jsonResource(uri, schema);
      }

      if (parsed.hostname === "kits" && pathParts.length === 2 && pathParts[1] === "manifest") {
        return jsonResource(uri, packManifestForResource(findPack(pathParts[0])));
      }

      if (parsed.hostname === "assets" && pathParts.length === 2) {
        const [packId, assetFileName] = pathParts as [string, string];
        const pack = findPack(packId);
        const asset = pack.assets.find((item) => assetBasename(item) === assetFileName);
        if (!asset) {
          throw new Error(`Unknown MetaView asset: ${packId}/${assetFileName}`);
        }
        if (!asset.license || !asset.attribution || asset.commercialUseStatus !== "allowed") {
          throw new Error(`MetaView asset is missing license metadata: ${packId}/${asset.id}`);
        }
        if (asset.license !== "internal" && (!asset.sourceUrl || !asset.licenseUrl)) {
          throw new Error(`MetaView public asset is missing source/license URL metadata: ${packId}/${asset.id}`);
        }
        return {
          uri,
          mimeType: asset.type === "svg" ? "image/svg+xml" : "text/plain",
          text: readFileSync(`${PUBLIC_ASSET_ROOT}${asset.path}`, "utf8"),
        };
      }

      throw new Error(`Unknown MetaView resource URI: ${uri}`);
    },
  };
}
