import type {
  MetaStep,
  PlaybookScript,
} from "../../../features/playbook/engine/types";
import type {
  TemplatePreviewCase,
  TemplatePreviewControl,
  TemplatePreviewFollowups,
  TemplatePreviewParams,
  TemplatePreviewQuestion,
} from "../templatePreviewCases";

export const ALGORITHM_CASE_FPS = 30;
export const ALGORITHM_CASE_STEP_FRAMES = 90;

export function algorithmStep<T extends MetaStep["snapshot"]>(
  index: number,
  value: Omit<MetaStep<T>, "end_frame" | "tokens">,
): MetaStep<T> {
  return {
    ...value,
    end_frame: (index + 1) * ALGORITHM_CASE_STEP_FRAMES,
    tokens: [],
  };
}

export function algorithmQuestions(
  stepId: string,
  first: [string, string],
  second: [string, string],
  third?: [string, string],
): TemplatePreviewQuestion[] {
  return [first, second, ...(third ? [third] : [])].map(([question, answer], index) => ({
    id: `${stepId}-q${index + 1}`,
    question,
    answer,
  }));
}

export function finiteNumber(
  params: TemplatePreviewParams,
  key: string,
  fallback: number,
): number {
  const value = Number(params[key]);
  return Number.isFinite(value) ? value : fallback;
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

export function buildAlgorithmPlaybook(args: {
  domain?: string;
  title: string;
  summary: string;
  algorithmId: string;
  steps: MetaStep[];
  controls?: PlaybookScript["parameter_controls"];
  initialData?: PlaybookScript["initial_data"];
}): PlaybookScript {
  return {
    schema_version: "2.0.0",
    fps: ALGORITHM_CASE_FPS,
    total_frames: args.steps.at(-1)?.end_frame ?? 0,
    domain: args.domain ?? "algorithm",
    title: args.title,
    summary: args.summary,
    steps: args.steps,
    parameter_controls: args.controls ?? [],
    algorithm_id: args.algorithmId,
    initial_data: args.initialData ?? {
      scene_blueprint: [args.algorithmId],
      teaching_phases: ["观察", "机制或推理", "验证", "总结"],
    },
  };
}

export function defineAlgorithmPreviewCase(args: {
  id: string;
  posterAlt: string;
  posterFrame: number;
  defaultParams: TemplatePreviewParams;
  controls: TemplatePreviewControl[];
  buildScript: (params: TemplatePreviewParams) => PlaybookScript;
  buildFollowups: (
    params: TemplatePreviewParams,
    script: PlaybookScript,
  ) => TemplatePreviewFollowups;
}): TemplatePreviewCase {
  return {
    id: args.id,
    templateId: args.id,
    posterUrl: `/template-previews/${args.id}/poster.webp`,
    posterAlt: args.posterAlt,
    posterFrame: args.posterFrame,
    defaultParams: args.defaultParams,
    controls: args.controls,
    buildScript: args.buildScript,
    buildFollowups: args.buildFollowups,
  };
}
