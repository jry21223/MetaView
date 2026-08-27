import type { MetaStep, PlaybookScript } from "../../../features/playbook/engine/types";
import type {
  TemplatePreviewFollowups,
  TemplatePreviewParams,
  TemplatePreviewQuestion,
} from "../templatePreviewCases";
import { applyNarrationTimeline, posterFrameForStep } from "../narrationTiming";
import {
  defineStandaloneGoldTemplate,
  type GoldTemplateManifest,
  type GoldTemplateSubject,
} from "./manifest";

/**
 * Shared building blocks for standalone Gold Templates that follow the
 * ecology-coursepack style: narration-paced steps, an observe → mechanism →
 * verify → summary arc, and three step-local Follow-up questions whose
 * mechanism answer can be specialised per step.
 */

export const STANDALONE_FPS = 30;
const STEP_FRAMES = 90;

export function fixed(value: number, digits = 2): string {
  const rounded = Number(value.toFixed(digits));
  return Object.is(rounded, -0) ? "0" : String(rounded);
}

export function boundedNumber(
  params: TemplatePreviewParams,
  key: string,
  fallback: number,
  min: number,
  max: number,
): number {
  const value = Number(params[key]);
  const finite = Number.isFinite(value) ? value : fallback;
  return Math.min(max, Math.max(min, finite));
}

export function stringParam(
  params: TemplatePreviewParams,
  key: string,
  allowed: readonly string[],
  fallback: string,
): string {
  const value = String(params[key] ?? "");
  return allowed.includes(value) ? value : fallback;
}

export function sceneStep<T extends MetaStep["snapshot"]>(
  index: number,
  stepId: string,
  title: string,
  narration: string,
  snapshot: T,
): MetaStep<T> {
  return {
    step_id: stepId,
    end_frame: (index + 1) * STEP_FRAMES,
    title,
    voiceover_text: narration,
    snapshot,
    tokens: [],
  };
}

export function playbook(
  domain: string,
  title: string,
  summary: string,
  algorithmId: string,
  steps: MetaStep[],
  controls: PlaybookScript["parameter_controls"] = [],
  initialData: Record<string, string[]> = {},
): PlaybookScript {
  const timed = applyNarrationTimeline(steps, STANDALONE_FPS);
  return {
    schema_version: "2.0.0",
    fps: STANDALONE_FPS,
    total_frames: timed.at(-1)?.end_frame ?? 0,
    domain,
    title,
    summary,
    steps: timed,
    parameter_controls: controls,
    algorithm_id: algorithmId,
    initial_data: {
      scene_blueprint: [algorithmId],
      teaching_phases: ["观察", "机制或推理", "验证", "总结"],
      ...initialData,
    },
  };
}

export function stepFollowups(
  script: PlaybookScript,
  mechanism: (step: MetaStep) => string,
  transfer: string,
): TemplatePreviewFollowups {
  return Object.fromEntries(script.steps.map((step) => [
    step.step_id,
    [
      {
        id: `${step.step_id}-observe`,
        question: "这一幕先观察什么？",
        answer: step.voiceover_text,
      },
      {
        id: `${step.step_id}-reason`,
        question: "这个变化为什么成立？",
        answer: mechanism(step),
      },
      {
        id: `${step.step_id}-transfer`,
        question: "怎样自己检查这一幕？",
        answer: transfer,
      },
    ] satisfies TemplatePreviewQuestion[],
  ]));
}

export interface StandaloneCaseArgs {
  caseId: string;
  archetypeId: string;
  subject: GoldTemplateSubject;
  domain: string;
  topic: string;
  title: string;
  description: string;
  prompt: string;
  defaults: TemplatePreviewParams;
  controls: NonNullable<GoldTemplateManifest["parameterSchema"]>["controls"];
  requiredCapabilities: readonly string[];
  expectedFacts: GoldTemplateManifest["expectedFacts"];
  visualInvariants: GoldTemplateManifest["visualInvariants"];
  objective: string;
  minimumSteps?: number;
  builder: (params: TemplatePreviewParams) => PlaybookScript;
  mechanism: string;
  mechanismByStep?: Record<string, string>;
  transfer: string;
  posterStepIndex?: number;
  handsOn?: readonly string[];
}

export function standaloneCase(args: StandaloneCaseArgs): GoldTemplateManifest {
  const defaultScript = args.builder(args.defaults);
  return defineStandaloneGoldTemplate({
    caseId: args.caseId,
    archetypeId: args.archetypeId,
    subject: args.subject,
    domain: args.domain,
    topic: args.topic,
    title: args.title,
    description: args.description,
    canonicalPrompt: args.prompt,
    parameterSchema: { defaults: args.defaults, controls: args.controls },
    poster: {
      url: `/template-previews/${args.caseId}/poster.webp`,
      alt: `${args.title}的 Playbook 代表画面`,
      frame: posterFrameForStep(defaultScript, args.posterStepIndex ?? defaultScript.steps.length - 1),
    },
    requiredCapabilities: args.requiredCapabilities,
    handsOnStepIds: args.handsOn,
    expectedFacts: args.expectedFacts,
    visualInvariants: args.visualInvariants,
    pedagogicalRubric: {
      objective: args.objective,
      requiredPhases: ["观察", "机制或推理", "验证", "总结"],
      minimumSteps: args.minimumSteps ?? 6,
    },
    buildPublicPlaybook: args.builder,
    buildFollowups: (_params, script) => stepFollowups(
      script,
      (step) => args.mechanismByStep?.[step.step_id] ?? args.mechanism,
      args.transfer,
    ),
  });
}
