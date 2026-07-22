import type { PlaybookScript } from "../../../features/playbook/engine/types";
import type {
  TemplatePreviewCase,
  TemplatePreviewCaseId,
  TemplatePreviewControl,
  TemplatePreviewFollowups,
  TemplatePreviewParams,
} from "../templatePreviewCases";

export type GoldTemplateVisibility = "public" | "hidden_eval";

export interface ExpectedFact {
  id: string;
  description: string;
  tolerance?: number;
}

export interface VisualInvariant {
  id: string;
  description: string;
  requiredSemanticRoles: string[];
}

export interface PedagogicalRubric {
  objective: string;
  requiredPhases: string[];
  minimumSteps: number;
}

export interface GoldTemplateManifest {
  caseId: string;
  archetypeId: string;
  subject: "high_school_math";
  domain: "conic_sections";
  topic: string;
  visibility: GoldTemplateVisibility;
  title: string;
  description: string;
  canonicalPrompt: string;
  requiredCapabilities: string[];
  parameterSchema?: {
    controls: TemplatePreviewControl[];
    defaults: TemplatePreviewParams;
  };
  expectedFacts: ExpectedFact[];
  visualInvariants: VisualInvariant[];
  pedagogicalRubric: PedagogicalRubric;
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
}

export function manifestToPreviewCase(
  manifest: GoldTemplateManifest,
): TemplatePreviewCase {
  if (manifest.visibility !== "public") {
    throw new Error(`Hidden evaluation case ${manifest.caseId} cannot become a public preview`);
  }
  return {
    id: manifest.caseId as TemplatePreviewCaseId,
    templateId: manifest.caseId as TemplatePreviewCaseId,
    posterUrl: manifest.poster.url,
    posterAlt: manifest.poster.alt,
    posterFrame: manifest.poster.frame,
    defaultParams: { ...(manifest.parameterSchema?.defaults ?? {}) },
    controls: [...(manifest.parameterSchema?.controls ?? [])],
    buildScript: manifest.buildPublicPlaybook,
    buildFollowups: manifest.buildFollowups,
  };
}
