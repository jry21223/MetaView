import type { PlaybookScript } from "../../features/playbook/engine/types";
import { BFS_TREE_PREVIEW_CASE } from "./algorithm-cases/bfsTreeCase";
import { BINARY_SEARCH_PREVIEW_CASE } from "./algorithm-cases/binarySearchCase";
import { BST_SEARCH_PREVIEW_CASE } from "./algorithm-cases/bstSearchCase";
import { DIJKSTRA_PREVIEW_CASE } from "./algorithm-cases/dijkstraCase";
import { LINKED_LIST_REVERSE_PREVIEW_CASE } from "./algorithm-cases/linkedListReverseCase";
import { MERGE_SORT_PREVIEW_CASE } from "./algorithm-cases/mergeSortCase";
import { MONOTONIC_STACK_PREVIEW_CASE } from "./algorithm-cases/monotonicStackCase";
import { QUICK_SORT_PREVIEW_CASE } from "./algorithm-cases/quickSortCase";
import { SLIDING_WINDOW_PREVIEW_CASE } from "./algorithm-cases/slidingWindowCase";
import { STACK_BRACKETS_PREVIEW_CASE } from "./algorithm-cases/stackBracketsCase";
import { PUBLIC_GOLD_TEMPLATES } from "./gold-templates/publicGoldTemplates";
import { manifestToPreviewCase } from "./gold-templates/manifest";
import type { ConicFollowupCommand } from "../../features/playbook/interaction/types";
import type { InteractionAdapter } from "../../features/playbook/interaction/types";

export type TemplatePreviewCaseId = string;

export type TemplatePreviewParamValue = number | string;
export type TemplatePreviewParams = Record<string, TemplatePreviewParamValue>;

export interface TemplatePreviewQuestion {
  id: string;
  question: string;
  answer: string;
  operation?: ConicFollowupCommand;
}

export type TemplatePreviewFollowups = Record<string, TemplatePreviewQuestion[]>;

interface BaseTemplatePreviewControl {
  id: string;
  label: string;
  description: string;
  resetPlayback: boolean;
  /**
   * Step ids where dragging this control visibly changes the picture.
   * Omitted = the control applies on every step (no per-step badges shown).
   */
  steps?: readonly string[];
}

export interface NumberTemplatePreviewControl extends BaseTemplatePreviewControl {
  kind: "number" | "range";
  min: number;
  max: number;
  step: number;
}

export interface SelectTemplatePreviewControl extends BaseTemplatePreviewControl {
  kind: "select";
  options: Array<{ label: string; value: string }>;
}

export type TemplatePreviewControl =
  | NumberTemplatePreviewControl
  | SelectTemplatePreviewControl;

export interface TemplatePreviewCase {
  /** Curated hands-on moments whose timeline dots get the ring (1–3 ids). */
  handsOnStepIds?: readonly string[];
  id: TemplatePreviewCaseId;
  templateId: TemplatePreviewCaseId;
  posterUrl: string;
  posterAlt: string;
  posterFrame: number;
  defaultParams: TemplatePreviewParams;
  controls: TemplatePreviewControl[];
  buildScript: (params: TemplatePreviewParams) => PlaybookScript;
  buildFollowups: (
    params: TemplatePreviewParams,
    script: PlaybookScript,
  ) => TemplatePreviewFollowups;
  interactionAdapters?: readonly InteractionAdapter[];
}

const TEMPLATE_PREVIEW_CASES: Record<TemplatePreviewCaseId, TemplatePreviewCase> = {
  ...Object.fromEntries(PUBLIC_GOLD_TEMPLATES.map((item) => [
    item.caseId,
    manifestToPreviewCase(item),
  ])),
  "sliding-window": SLIDING_WINDOW_PREVIEW_CASE,
  "merge-sort": MERGE_SORT_PREVIEW_CASE,
  "quick-sort": QUICK_SORT_PREVIEW_CASE,
  "stack-brackets": STACK_BRACKETS_PREVIEW_CASE,
  "monotonic-stack": MONOTONIC_STACK_PREVIEW_CASE,
  "linked-list-reverse": LINKED_LIST_REVERSE_PREVIEW_CASE,
  "bst-search": BST_SEARCH_PREVIEW_CASE,
  dijkstra: DIJKSTRA_PREVIEW_CASE,
  "binary-search": BINARY_SEARCH_PREVIEW_CASE,
  "bfs-tree": BFS_TREE_PREVIEW_CASE,
};

export const TEMPLATE_PREVIEW_CASE_IDS = Object.freeze(
  Object.keys(TEMPLATE_PREVIEW_CASES),
);

export function isTemplatePreviewCaseId(value: string): value is TemplatePreviewCaseId {
  return Object.prototype.hasOwnProperty.call(TEMPLATE_PREVIEW_CASES, value);
}

export function getTemplatePreviewCase(value: string): TemplatePreviewCase | null {
  return isTemplatePreviewCaseId(value) ? TEMPLATE_PREVIEW_CASES[value] : null;
}

export function buildDefaultTemplatePreviewScripts(): Record<TemplatePreviewCaseId, PlaybookScript> {
  return Object.fromEntries(TEMPLATE_PREVIEW_CASE_IDS.map((id) => {
    const item = TEMPLATE_PREVIEW_CASES[id];
    return [id, item.buildScript(item.defaultParams)];
  }));
}
