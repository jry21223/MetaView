import type {
  ChemistrySceneSnapshot,
  ChemParticle,
} from "../../../../features/playbook/engine/kits/chemistry/sceneTypes";
import type { PlaybookScript } from "../../../../features/playbook/engine/types";
import type {
  TemplatePreviewFollowups,
  TemplatePreviewParams,
  TemplatePreviewQuestion,
} from "../../templatePreviewCases";
import { posterFrameForStep } from "../../narrationTiming";
import { defineStandaloneGoldTemplate, type GoldTemplateManifest } from "../manifest";
import { playbook, sceneStep, type StandaloneCaseArgs } from "../standaloneCaseHelpers";

/**
 * Chemistry coursepack scaffolding.
 *
 * A chemistry case is one pure `build(params)` that walks the lesson once
 * and writes each step together with its three Follow-up questions — what to
 * look at, why it happens, how to check it — so the questions can quote the
 * same numbers the narration and the picture use. The manifest, the script
 * and the follow-ups are all derived from that one draft.
 */

export interface ChemQuestion {
  question: string;
  answer: string;
}

export interface ChemStepDraft {
  id: string;
  title: string;
  narration: string;
  scene: ChemistrySceneSnapshot;
  /** Observe, mechanism, self-check — in that order. */
  questions: readonly [ChemQuestion, ChemQuestion, ChemQuestion];
}

export interface ChemLessonDraft {
  title: string;
  summary: string;
  algorithmId: string;
  steps: ChemStepDraft[];
  controls: PlaybookScript["parameter_controls"];
}

export type ChemistryCaseArgs = Omit<
  StandaloneCaseArgs,
  "builder" | "mechanism" | "mechanismByStep" | "transfer" | "subject" | "domain"
> & {
  build: (params: TemplatePreviewParams) => ChemLessonDraft;
};

const QUESTION_KINDS = ["observe", "why", "check"] as const;

export function lessonScript(draft: ChemLessonDraft): PlaybookScript {
  return playbook(
    "chemistry",
    draft.title,
    draft.summary,
    draft.algorithmId,
    draft.steps.map((step, index) => sceneStep(index, step.id, step.title, step.narration, step.scene)),
    draft.controls,
    { teaching_levels: ["宏观", "微观", "符号"] },
  );
}

export function lessonFollowups(draft: ChemLessonDraft): TemplatePreviewFollowups {
  return Object.fromEntries(draft.steps.map((step) => [
    step.id,
    step.questions.map((item, index) => ({
      id: `${step.id}-${QUESTION_KINDS[index]}`,
      question: item.question,
      answer: item.answer,
    })) satisfies TemplatePreviewQuestion[],
  ]));
}

export function chemistryCase(args: ChemistryCaseArgs): GoldTemplateManifest {
  const defaultScript = lessonScript(args.build(args.defaults));
  return defineStandaloneGoldTemplate({
    caseId: args.caseId,
    archetypeId: args.archetypeId,
    subject: "high_school_chemistry",
    domain: "chemistry",
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
    buildPublicPlaybook: (params) => lessonScript(args.build(params)),
    buildFollowups: (params) => lessonFollowups(args.build(params)),
  });
}

// ---------------------------------------------------------------------------
// particle authoring helpers

/** A lattice block of fixed atoms, `columns` × `rows`, inside [x0,x1] × [y0,y1]. */
export function lattice(
  prefix: string,
  species: string,
  columns: number,
  rows: number,
  box: { x0: number; x1: number; y0: number; y1: number },
): ChemParticle[] {
  const particles: ChemParticle[] = [];
  for (let c = 0; c < columns; c += 1) {
    for (let r = 0; r < rows; r += 1) {
      const x = columns === 1 ? (box.x0 + box.x1) / 2 : box.x0 + ((box.x1 - box.x0) * c) / (columns - 1);
      const y = rows === 1 ? (box.y0 + box.y1) / 2 : box.y0 + ((box.y1 - box.y0) * r) / (rows - 1);
      particles.push({ id: `${prefix}-${c}-${r}`, species, x, y, fixed: true });
    }
  }
  return particles;
}

/**
 * Well-spaced slots for loose particles: a jittered grid over the box,
 * visited in a fixed shuffled order, so adding particles never moves the
 * ones already placed.
 */
export function scatterSlots(
  count: number,
  box: { x0: number; x1: number; y0: number; y1: number },
  columns: number,
  rows: number,
  seed = 1,
): Array<{ x: number; y: number }> {
  const slots: Array<{ x: number; y: number; key: number }> = [];
  for (let c = 0; c < columns; c += 1) {
    for (let r = 0; r < rows; r += 1) {
      const key = Math.sin((c + 1) * 12.9898 + (r + 1) * 78.233 + seed * 37.719) * 43758.5453;
      const jx = (key - Math.floor(key) - 0.5) * 0.2;
      const jy = (key * 1.7 - Math.floor(key * 1.7) - 0.5) * 0.2;
      slots.push({
        x: box.x0 + ((c + 0.5 + jx) / columns) * (box.x1 - box.x0),
        y: box.y0 + ((r + 0.5 + jy) / rows) * (box.y1 - box.y0),
        key: key - Math.floor(key),
      });
    }
  }
  if (count > slots.length) throw new Error(`scatterSlots: ${count} particles need more than ${slots.length} slots`);
  return slots.sort((a, b) => a.key - b.key).slice(0, count).map(({ x, y }) => ({ x, y }));
}
