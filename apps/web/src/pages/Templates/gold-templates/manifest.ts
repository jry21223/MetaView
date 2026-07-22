import type { PlaybookScript } from "../../../features/playbook/engine/types";
import {
  resolveConicArchetype,
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

export type GoldTemplateSubject =
  | "high_school_math"
  | "high_school_physics"
  | "computer_science"
  | "high_school_chemistry"
  | "high_school_biology"
  | "high_school_geography";

export interface ExpectedFact {
  readonly id: string;
  readonly description: string;
  readonly anyOf: readonly string[];
  readonly tolerance?: number;
}

export interface VisualInvariant {
  readonly id: string;
  readonly description: string;
  readonly requiredSemanticRoles: readonly string[];
  readonly requiredStateFields: readonly string[];
}

export interface PedagogicalRubric {
  readonly objective: string;
  readonly requiredPhases: readonly string[];
  readonly minimumSteps: number;
}

export interface GoldTemplateManifest {
  caseId: string;
  archetypeId: string;
  subject: GoldTemplateSubject;
  domain: string;
  topic: string;
  visibility: GoldTemplateVisibility;
  title: string;
  description: string;
  canonicalPrompt: string;
  requiredCapabilities: readonly string[];
  expectedFacts: readonly ExpectedFact[];
  visualInvariants: readonly VisualInvariant[];
  pedagogicalRubric: PedagogicalRubric;
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
  interactionAdapter?: InteractionAdapter;
}

export type PublicGoldTemplateDefinition = Omit<
  GoldTemplateManifest,
  | "requiredCapabilities"
  | "expectedFacts"
  | "visualInvariants"
  | "pedagogicalRubric"
  | "interactionAdapter"
>;

export type StandaloneGoldTemplateDefinition = Omit<
  GoldTemplateManifest,
  "visibility" | "interactionAdapter"
> & {
  visibility?: "public";
  interactionAdapter?: InteractionAdapter;
};

const CATALOG_METADATA_FIELDS = [
  "requiredCapabilities",
  "expectedFacts",
  "visualInvariants",
  "pedagogicalRubric",
] as const;

export function attachPublicGoldTemplate(
  definition: PublicGoldTemplateDefinition,
): GoldTemplateManifest {
  if (definition.subject !== "high_school_math" || definition.domain !== "conic_sections") {
    throw new Error("Catalog-backed public Gold Templates must belong to conic_sections");
  }
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

export function defineStandaloneGoldTemplate(
  definition: StandaloneGoldTemplateDefinition,
): GoldTemplateManifest {
  if (!definition.caseId.trim() || !definition.archetypeId.trim()) {
    throw new Error("Standalone Gold Template IDs must be non-blank");
  }
  if (
    definition.requiredCapabilities.length === 0
    || definition.expectedFacts.length === 0
    || definition.visualInvariants.length === 0
    || definition.pedagogicalRubric.minimumSteps < 1
  ) {
    throw new Error(`Standalone Gold Template ${definition.caseId} is missing quality metadata`);
  }
  return Object.freeze({
    ...definition,
    visibility: "public",
  });
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
    interactionAdapters: manifest.interactionAdapter
      ? [manifest.interactionAdapter]
      : undefined,
  };
}
