import type { PlaybookScript } from "../../../features/playbook/engine/types";
import {
  resolveConicArchetype,
  type ConicArchetypeMetadata,
  type ConicExpectedFactRule,
  type ConicPedagogicalRubric,
  type ConicVisualInvariant,
} from "../../../shared/domain/conicArchetypeCatalog";
import type {
  TemplatePreviewCase,
  TemplatePreviewControl,
  TemplatePreviewFollowups,
  TemplatePreviewParams,
} from "../templatePreviewCases";
import type { InteractionAdapter } from "../../../features/playbook/interaction/types";
import {
  buildConicFollowupPresets,
  createConicFollowupAdapter,
} from "./conicFollowupAdapter";

export type GoldTemplateVisibility = "public" | "hidden_eval";

export type ExpectedFact = ConicExpectedFactRule;
export type VisualInvariant = ConicVisualInvariant;
export type PedagogicalRubric = ConicPedagogicalRubric;

export interface GoldTemplateManifest extends Omit<ConicArchetypeMetadata, "publicCaseId"> {
  caseId: string;
  archetypeId: string;
  subject: "high_school_math";
  domain: "conic_sections";
  topic: string;
  visibility: GoldTemplateVisibility;
  title: string;
  description: string;
  canonicalPrompt: string;
  parameterSchema?: {
    controls: TemplatePreviewControl[];
    defaults: TemplatePreviewParams;
  };
  poster: {
    url: string;
    alt: string;
    frame: number;
  };
  buildPublicPlaybook: (params: TemplatePreviewParams) => PlaybookScript;
  buildFollowups: (
    params: TemplatePreviewParams,
    script: PlaybookScript,
  ) => TemplatePreviewFollowups;
  interactionAdapter: InteractionAdapter;
}

export type PublicGoldTemplateDefinition = Omit<
  GoldTemplateManifest,
  | "requiredCapabilities"
  | "expectedFacts"
  | "visualInvariants"
  | "pedagogicalRubric"
  | "interactionAdapter"
>;

const CATALOG_METADATA_FIELDS = [
  "requiredCapabilities",
  "expectedFacts",
  "visualInvariants",
  "pedagogicalRubric",
] as const;

export function attachPublicGoldTemplate(
  definition: PublicGoldTemplateDefinition,
): GoldTemplateManifest {
  for (const field of CATALOG_METADATA_FIELDS) {
    if (field in definition) {
      throw new Error(`Public Gold Template metadata ${field} must come from the catalog`);
    }
  }
  const archetype = resolveConicArchetype(definition.archetypeId);
  if (definition.caseId !== archetype.publicCaseId) {
    throw new Error(
      `Public case ${definition.caseId} does not match ${archetype.archetypeId}`,
    );
  }
  const interactionAdapter = createConicFollowupAdapter(definition);
  return {
    ...definition,
    requiredCapabilities: archetype.requiredCapabilities,
    expectedFacts: archetype.expectedFacts,
    visualInvariants: archetype.visualInvariants,
    pedagogicalRubric: archetype.pedagogicalRubric,
    buildFollowups: (params, script) => buildConicFollowupPresets(
      definition,
      script,
      definition.buildFollowups(params, script),
    ),
    interactionAdapter,
  };
}

export function manifestToPreviewCase(
  manifest: GoldTemplateManifest,
): TemplatePreviewCase {
  if (manifest.visibility !== "public") {
    throw new Error(`Hidden evaluation case ${manifest.caseId} cannot become a public preview`);
  }
  return {
    id: manifest.caseId,
    templateId: manifest.caseId,
    posterUrl: manifest.poster.url,
    posterAlt: manifest.poster.alt,
    posterFrame: manifest.poster.frame,
    defaultParams: { ...(manifest.parameterSchema?.defaults ?? {}) },
    controls: [...(manifest.parameterSchema?.controls ?? [])],
    buildScript: manifest.buildPublicPlaybook,
    buildFollowups: manifest.buildFollowups,
    interactionAdapters: [manifest.interactionAdapter],
  };
}
