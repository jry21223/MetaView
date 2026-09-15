import type {
  MetaStep,
  PlaybookScript,
} from "../../../features/playbook/engine/types";
import type {
  SelectTemplatePreviewControl,
  TemplatePreviewCase,
  TemplatePreviewControl,
  TemplatePreviewFollowups,
  TemplatePreviewParams,
  TemplatePreviewQuestion,
} from "../templatePreviewCases";
import { applyNarrationTimeline, posterFrameForStep } from "../narrationTiming";

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
  const timed = applyNarrationTimeline(args.steps, ALGORITHM_CASE_FPS);
  return {
    schema_version: "2.0.0",
    fps: ALGORITHM_CASE_FPS,
    total_frames: timed.at(-1)?.end_frame ?? 0,
    domain: args.domain ?? "algorithm",
    title: args.title,
    summary: args.summary,
    steps: timed,
    parameter_controls: args.controls ?? [],
    algorithm_id: args.algorithmId,
    initial_data: args.initialData ?? {
      scene_blueprint: [args.algorithmId],
      teaching_phases: ["观察", "机制或推理", "验证", "总结"],
    },
  };
}

/**
 * The `code_highlight` builder for one listing. Every case used to declare its
 * own four-argument `codeHighlight` around the same object literal; this
 * binds the listing once and leaves the per-step arguments.
 */
export function codeHighlightFor(
  lines: readonly string[],
  language = "typescript",
): (
  activeLine: number,
  variables: Record<string, string>,
  operationLabel: string,
  activeLines?: number[],
) => NonNullable<MetaStep["code_highlight"]> {
  const source = [...lines];
  return (activeLine, variables, operationLabel, activeLines = [activeLine]) => ({
    language,
    lines: source,
    active_lines: activeLines,
    active_line: activeLine,
    variables,
    operation_label: operationLabel,
  });
}

export interface PresetParamOption<Id extends string> {
  value: Id;
  label: string;
}

export interface PresetParam<Id extends string> {
  /** Clamp a raw param value to one of the presets. */
  resolve: (params: TemplatePreviewParams) => Id;
  /** The `/templates` select shown beside the player. */
  control: SelectTemplatePreviewControl;
  /** The matching `PlaybookScript.parameter_controls` entry for a resolved value. */
  playbookControl: (value: Id) => PlaybookScript["parameter_controls"][number];
}

/**
 * A "pick one of these" parameter declared once.
 *
 * The preset list, the clamp, the select options and the two control
 * declarations (one for the page, one inside the script) used to be written
 * out separately in every case, so a new preset meant four edits and a
 * forgotten one silently fell back to the default.
 */
export function definePresetParam<Id extends string>(args: {
  id: string;
  label: string;
  /** Shown under the select on the template page. */
  description: string;
  /** Shown in `PlaybookScript.parameter_controls`; defaults to `description`. */
  playbookDescription?: string;
  options: ReadonlyArray<PresetParamOption<Id>>;
  defaultValue: Id;
}): PresetParam<Id> {
  const allowed = args.options.map((option) => option.value);
  return {
    resolve: (params) => stringParam(params, args.id, allowed, args.defaultValue) as Id,
    control: {
      id: args.id,
      kind: "select",
      label: args.label,
      description: args.description,
      resetPlayback: true,
      options: args.options.map((option) => ({ label: option.label, value: option.value })),
    },
    playbookControl: (value) => ({
      id: args.id,
      label: args.label,
      value,
      description: args.playbookDescription ?? args.description,
    }),
  };
}

/** One follow-up as it is written next to the step it belongs to. */
export type AlgorithmQuestionPair = readonly [question: string, answer: string];

/**
 * Every step ships at least three follow-ups (观察 / 机制 / 检验), and the
 * tuple says so in the type system: a draft with two questions will not
 * compile, so the rule is checked before any test runs.
 */
export type AlgorithmQuestionSet = readonly [
  AlgorithmQuestionPair,
  AlgorithmQuestionPair,
  AlgorithmQuestionPair,
  ...AlgorithmQuestionPair[],
];

/**
 * A step and its follow-ups written together, so both come out of one pass
 * over the trace. The old shape asked each case for `buildScript` and
 * `buildFollowups` separately, which meant re-running the trace and keeping
 * two lists of step ids in sync by hand.
 */
export interface AlgorithmStepDraft<T extends MetaStep["snapshot"] = MetaStep["snapshot"]> {
  step_id: string;
  title: string;
  voiceover_text: string;
  snapshot: T;
  code_highlight: NonNullable<MetaStep["code_highlight"]>;
  questions: AlgorithmQuestionSet;
}

/** Everything one parameter set produces: the step drafts plus script fields derived from the same trace. */
export interface AlgorithmCaseFrame<T extends MetaStep["snapshot"] = MetaStep["snapshot"]> {
  steps: ReadonlyArray<AlgorithmStepDraft<T>>;
  controls?: PlaybookScript["parameter_controls"];
  initialData?: PlaybookScript["initial_data"];
}

export interface AlgorithmPreviewCase extends TemplatePreviewCase {
  buildScript: (params?: TemplatePreviewParams) => PlaybookScript;
  buildFollowups: (
    params?: TemplatePreviewParams,
    script?: PlaybookScript,
  ) => TemplatePreviewFollowups;
}

/** Step ids stay unique even if a draft picker collides on labels. */
function uniqueStepIds(drafts: ReadonlyArray<AlgorithmStepDraft>): string[] {
  const used = new Set<string>();
  return drafts.map((draft, index) => {
    const stepId = used.has(draft.step_id) ? `${draft.step_id}-n${index}` : draft.step_id;
    used.add(stepId);
    return stepId;
  });
}

/**
 * Define an algorithm preview case from a single `buildSteps(params)` pass.
 *
 * `buildSteps` walks the trace once and returns each step together with its
 * follow-ups; `buildScript`, `buildFollowups` and `posterFrame` are all
 * derived from that one list, so the step ids cannot drift apart.
 */
export function defineAlgorithmCase<T extends MetaStep["snapshot"] = MetaStep["snapshot"]>(args: {
  id: string;
  posterAlt: string;
  posterStepIndex: number;
  defaultParams: TemplatePreviewParams;
  controls: TemplatePreviewControl[];
  domain?: string;
  title: string;
  summary: string;
  algorithmId: string;
  buildSteps: (params: TemplatePreviewParams) => AlgorithmCaseFrame<T>;
}): AlgorithmPreviewCase {
  const buildScript = (params: TemplatePreviewParams = {}): PlaybookScript => {
    const frame = args.buildSteps(params);
    const stepIds = uniqueStepIds(frame.steps);
    const steps: MetaStep[] = frame.steps.map((draft, index) =>
      algorithmStep(index, {
        step_id: stepIds[index]!,
        title: draft.title,
        voiceover_text: draft.voiceover_text,
        snapshot: draft.snapshot,
        code_highlight: draft.code_highlight,
      }),
    );
    return buildAlgorithmPlaybook({
      domain: args.domain,
      title: args.title,
      summary: args.summary,
      algorithmId: args.algorithmId,
      steps,
      controls: frame.controls,
      initialData: frame.initialData,
    });
  };

  const buildFollowups = (params: TemplatePreviewParams = {}): TemplatePreviewFollowups => {
    const frame = args.buildSteps(params);
    const stepIds = uniqueStepIds(frame.steps);
    const followups: TemplatePreviewFollowups = {};
    frame.steps.forEach((draft, index) => {
      const stepId = stepIds[index]!;
      followups[stepId] = draft.questions.map(([question, answer], questionIndex) => ({
        id: `${stepId}-q${questionIndex + 1}`,
        question,
        answer,
      }));
    });
    return followups;
  };

  return {
    id: args.id,
    templateId: args.id,
    posterUrl: `/template-previews/${args.id}/poster.webp`,
    posterAlt: args.posterAlt,
    posterFrame: posterFrameForStep(buildScript(args.defaultParams), args.posterStepIndex),
    defaultParams: args.defaultParams,
    controls: args.controls,
    buildScript,
    buildFollowups,
  };
}
