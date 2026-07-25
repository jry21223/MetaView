import type { MetaStepOutput, PlaybookOutput } from "./types.js";

export type PatchOperation =
  | { op: "add" | "replace"; path: string; value: unknown }
  | { op: "remove"; path: string };

const MUTABLE_ROOTS = new Set([
  "title",
  "summary",
  "steps",
  "parameter_controls",
  "algorithm_id",
  "initial_data",
]);

const IMMUTABLE_STEP_FIELDS = new Set(["step_id", "end_frame"]);
/** Reject prototype-pollution path segments (case-sensitive exact match). */
const FORBIDDEN_PATH_SEGMENTS = new Set(["__proto__", "prototype", "constructor"]);
const MIN_STEP_SECONDS = 5.5;
const MAX_STEP_SECONDS = 12;
const VOICEOVER_HOLD_SECONDS = 0.6;
const CHINESE_CHAR_PER_SECOND = 4.8;
const ENGLISH_WORD_PER_SECOND = 2.4;
const FRAME_INCREMENT = 6;

export interface RepairScope {
  allowedPrefixes: string[];
  issueCodes: string[];
}

export function deriveRepairScope(issues: unknown): RepairScope {
  const rows = Array.isArray(issues) ? issues : [];
  const prefixes = new Set<string>();
  const codes = new Set<string>();
  let sawProcessableIssue = false;

  for (const item of rows) {
    if (!isRecord(item)) continue;
    const code = typeof item.code === "string" ? item.code : "unknown";
    const path = typeof item.path === "string" ? item.path : "playbook";
    codes.add(code);
    sawProcessableIssue = true;
    for (const prefix of prefixesForIssuePath(path)) prefixes.add(prefix);
  }

  // Full-root fallback only for malformed/empty reports (no processable issues).
  // Director-only issues intentionally yield an empty allowlist so patches fail.
  // Explicit playbook/schema failures already expand via prefixesForIssuePath.
  if (prefixes.size === 0 && !sawProcessableIssue) {
    for (const root of MUTABLE_ROOTS) prefixes.add(`/${root}`);
  }
  return { allowedPrefixes: [...prefixes].sort(), issueCodes: [...codes].sort() };
}

export function applyPlaybookPatch(
  original: PlaybookOutput,
  operations: PatchOperation[],
  scope: RepairScope,
): PlaybookOutput {
  if (!Array.isArray(operations) || operations.length === 0) {
    throw new Error("repair patch must contain at least one operation");
  }
  if (operations.length > 24) {
    throw new Error("repair patch exceeds the 24-operation safety limit");
  }

  const target = structuredClone(original) as unknown as Record<string, unknown>;
  for (const operation of operations) {
    validateOperation(operation, scope);
    applySingleOperation(target, operation);
  }
  return normalizeDerivedFields(target as unknown as PlaybookOutput, original, operations);
}

function validateOperation(operation: PatchOperation, scope: RepairScope): void {
  if (!operation || !["add", "remove", "replace"].includes(operation.op)) {
    throw new Error("repair operation must use add, remove, or replace");
  }
  if (typeof operation.path !== "string" || !operation.path.startsWith("/")) {
    throw new Error("repair path must be an RFC 6901 pointer beginning with '/'");
  }
  const segments = decodePointer(operation.path);
  assertSafePathSegments(segments, operation.path);
  const root = segments[0];
  if (!root || !MUTABLE_ROOTS.has(root)) {
    throw new Error(`repair path ${JSON.stringify(operation.path)} targets an immutable root`);
  }
  if (root === "steps" && segments.length >= 3 && IMMUTABLE_STEP_FIELDS.has(segments[2])) {
    throw new Error(`repair path ${JSON.stringify(operation.path)} targets compiler-owned step identity/timing`);
  }
  if (
    root === "steps" &&
    segments.length >= 5 &&
    segments[2] === "layers" &&
    segments[3] === "0" &&
    segments[4] === "timing"
  ) {
    throw new Error("primary layer timing is compiler-owned");
  }
  if (
    scope.allowedPrefixes.length === 0 ||
    !scope.allowedPrefixes.some((prefix) => pathMatchesPrefix(operation.path, prefix))
  ) {
    throw new Error(
      `repair path ${JSON.stringify(operation.path)} is outside the issue-scoped allowlist ${JSON.stringify(scope.allowedPrefixes)}`,
    );
  }
}

function assertSafePathSegments(segments: string[], path: string): void {
  for (const segment of segments) {
    if (FORBIDDEN_PATH_SEGMENTS.has(segment)) {
      throw new Error(
        `repair path ${JSON.stringify(path)} contains forbidden segment ${JSON.stringify(segment)}`,
      );
    }
  }
}

function prefixesForIssuePath(path: string): string[] {
  const normalized = path.trim();
  const stepMatch = normalized.match(/steps\[(\d+)\]/);
  if (stepMatch) return [`/steps/${stepMatch[1]}`];
  // RFC 6901-style step paths from structured validators.
  const pointerStep = normalized.match(/^\/?steps\/(\d+)(?:\/|$)/);
  if (pointerStep) return [`/steps/${pointerStep[1]}`];
  if (normalized === "steps" || normalized.startsWith("steps.")) return ["/steps"];
  if (normalized.startsWith("title") || normalized === "/title") return ["/title"];
  if (normalized.startsWith("summary") || normalized === "/summary") return ["/summary"];
  if (normalized.startsWith("parameter_controls") || normalized.startsWith("/parameter_controls")) {
    return ["/parameter_controls"];
  }
  if (normalized.startsWith("initial_data") || normalized.startsWith("/initial_data")) {
    return ["/initial_data"];
  }
  if (normalized.startsWith("algorithm_id") || normalized === "/algorithm_id") {
    return ["/algorithm_id"];
  }
  if (normalized.startsWith("director") || normalized.startsWith("/director")) return [];
  if (normalized.startsWith("lesson_plan") || normalized.startsWith("/lesson_plan")) {
    return ["/steps", "/summary"];
  }
  if (
    normalized === "playbook" ||
    normalized === "/playbook" ||
    normalized.startsWith("schema") ||
    normalized.startsWith("/schema")
  ) {
    return [...MUTABLE_ROOTS].map((root) => `/${root}`);
  }
  // Fail closed: unknown issue paths must not unlock the entire step tree.
  return [];
}

function pathMatchesPrefix(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(`${prefix}/`);
}

function applySingleOperation(
  document: Record<string, unknown>,
  operation: PatchOperation,
): void {
  const segments = decodePointer(operation.path);
  if (segments.length === 0) throw new Error("root replacement is not allowed");
  // Defense in depth: re-check even if validateOperation was skipped.
  assertSafePathSegments(segments, operation.path);
  let parent: unknown = document;
  for (const segment of segments.slice(0, -1)) {
    parent = getChild(parent, segment, operation.path);
  }
  const key = segments.at(-1)!;

  if (Array.isArray(parent)) {
    applyArrayOperation(parent, key, operation);
    return;
  }
  if (!isRecord(parent)) {
    throw new Error(`repair path ${JSON.stringify(operation.path)} has a non-container parent`);
  }
  if (operation.op === "remove") {
    if (!Object.prototype.hasOwnProperty.call(parent, key)) {
      throw new Error(`repair remove path does not exist: ${operation.path}`);
    }
    delete parent[key];
    return;
  }
  if (operation.op === "replace" && !Object.prototype.hasOwnProperty.call(parent, key)) {
    throw new Error(`repair replace path does not exist: ${operation.path}`);
  }
  // Own-property assignment avoids __proto__ setter pollution even if a
  // forbidden segment check is ever bypassed.
  Object.defineProperty(parent, key, {
    value: structuredClone(operation.value),
    writable: true,
    enumerable: true,
    configurable: true,
  });
}

function applyArrayOperation(
  parent: unknown[],
  key: string,
  operation: PatchOperation,
): void {
  if (key === "-") {
    if (operation.op !== "add") throw new Error("'-' array index is valid only for add");
    parent.push(structuredClone(operation.value));
    return;
  }
  if (!/^\d+$/.test(key)) throw new Error(`invalid array index ${JSON.stringify(key)}`);
  const index = Number(key);
  if (operation.op === "add") {
    if (index < 0 || index > parent.length) throw new Error(`array add index ${index} is out of range`);
    parent.splice(index, 0, structuredClone(operation.value));
    return;
  }
  if (index < 0 || index >= parent.length) throw new Error(`array index ${index} is out of range`);
  if (operation.op === "remove") parent.splice(index, 1);
  else parent[index] = structuredClone(operation.value);
}

function getChild(parent: unknown, key: string, path: string): unknown {
  if (Array.isArray(parent)) {
    if (!/^\d+$/.test(key)) throw new Error(`invalid array index in ${JSON.stringify(path)}`);
    const index = Number(key);
    if (index < 0 || index >= parent.length) throw new Error(`path does not exist: ${path}`);
    return parent[index];
  }
  if (!isRecord(parent) || !Object.prototype.hasOwnProperty.call(parent, key)) {
    throw new Error(`path does not exist: ${path}`);
  }
  return parent[key];
}

function normalizeDerivedFields(
  playbook: PlaybookOutput,
  original: PlaybookOutput,
  operations: PatchOperation[],
): PlaybookOutput {
  const next = structuredClone(playbook);
  const fps = Number.isFinite(next.fps) && next.fps > 0 ? Math.round(next.fps) : 30;
  next.fps = fps;
  // Index-keyed durations so whole-step replaces cannot break identity lookup by
  // smuggling a different step_id into the patched object.
  const originalDurationsByIndex = stepDurationsByIndex(original.steps);
  const originalStepIdsByIndex = original.steps.map(
    (step, index) => step.step_id || `step_${String(index + 1).padStart(2, "0")}`,
  );
  const recomputeDurations = durationRecomputeStepIndices(operations);
  let cursor = 0;
  next.steps = next.steps.map((step, index) => {
    const compilerOwnedId =
      originalStepIdsByIndex[index] ?? `step_${String(index + 1).padStart(2, "0")}`;
    const normalized = normalizeStep(step, index, fps, compilerOwnedId);
    const preservedDuration = originalDurationsByIndex.get(index);
    const duration = recomputeDurations === null || recomputeDurations.has(index)
      ? estimateStepFrames(normalized.voiceover_text, fps)
      : preservedDuration ?? estimateStepFrames(normalized.voiceover_text, fps);
    cursor += Math.max(1, duration);
    normalized.end_frame = cursor;
    return normalized;
  });
  next.total_frames = Math.max(cursor, 1);
  next.parameter_controls = (next.parameter_controls ?? []).map((control) => ({
    ...control,
    value: String(control.value),
  }));
  return next;
}

function stepDurationsByIndex(steps: MetaStepOutput[]): Map<number, number> {
  const durations = new Map<number, number>();
  let previousEnd = 0;
  for (let index = 0; index < steps.length; index += 1) {
    const step = steps[index];
    durations.set(index, Math.max(1, step.end_frame - previousEnd));
    previousEnd = step.end_frame;
  }
  return durations;
}

function durationRecomputeStepIndices(operations: PatchOperation[]): Set<number> | null {
  const indices = new Set<number>();
  for (const operation of operations) {
    const segments = decodePointer(operation.path);
    if (segments[0] !== "steps") continue;
    if (segments.length < 2 || !/^\d+$/.test(segments[1])) return null;
    const index = Number(segments[1]);
    if (segments.length === 2 && operation.op !== "replace") return null;
    if (
      segments.length === 2 ||
      segments[2] === "voiceover_text" ||
      segments[2] === "narration_template"
    ) {
      indices.add(index);
    }
  }
  return indices;
}

function normalizeStep(
  step: MetaStepOutput,
  index: number,
  fps: number,
  compilerOwnedStepId: string,
): MetaStepOutput {
  if (!isRecord(step.snapshot) || typeof step.snapshot.kind !== "string") {
    throw new Error(`steps[${index}] requires a typed snapshot`);
  }
  const snapshot = structuredClone(step.snapshot);
  const layers = Array.isArray(step.layers) ? structuredClone(step.layers) : [];
  const primary = {
    timing: { enter_at: 0, exit_at: 1, appear_anim: "fade" as const, z_order: 0 },
    body: structuredClone(snapshot),
  };
  if (layers.length === 0) layers.push(primary);
  else {
    layers[0] = {
      ...layers[0],
      timing: normalizeTiming(layers[0]?.timing),
      body: structuredClone(snapshot),
    };
  }
  for (let layerIndex = 1; layerIndex < layers.length; layerIndex += 1) {
    layers[layerIndex] = {
      ...layers[layerIndex],
      timing: normalizeTiming(layers[layerIndex]?.timing),
    };
  }
  const narration = Array.isArray(step.narration_template)
    ? step.narration_template
    : [step.voiceover_text];
  return {
    ...step,
    // Whole-step replace may smuggle a different step_id; identity stays compiler-owned.
    step_id: compilerOwnedStepId,
    title: String(step.title ?? "").trim(),
    voiceover_text: String(step.voiceover_text ?? "").trim(),
    narration_template: narration,
    tokens: Array.isArray(step.tokens) ? step.tokens : [],
    code_highlight: step.code_highlight ?? null,
    snapshot,
    layers,
    end_frame: Math.max(1, estimateStepFrames(String(step.voiceover_text ?? ""), fps)),
  };
}

function normalizeTiming(value: unknown): {
  enter_at: number;
  exit_at: number;
  appear_anim: "fade" | "draw" | "slide" | "scale" | "none";
  z_order: number;
} {
  const timing = isRecord(value) ? value : {};
  const enter = clamp(Number(timing.enter_at ?? 0), 0, 1);
  const exit = clamp(Number(timing.exit_at ?? 1), enter, 1);
  const animation = ["fade", "draw", "slide", "scale", "none"].includes(String(timing.appear_anim))
    ? (String(timing.appear_anim) as "fade" | "draw" | "slide" | "scale" | "none")
    : "fade";
  return {
    enter_at: enter,
    exit_at: exit,
    appear_anim: animation,
    z_order: Number.isFinite(Number(timing.z_order)) ? Math.round(Number(timing.z_order)) : 0,
  };
}

function estimateStepFrames(text: string, fps: number): number {
  if (!text.trim()) return 120;
  const chineseChars = [...text.matchAll(/[\u4e00-\u9fff]/g)].length;
  const englishWords =
    text
      .replace(/[\u4e00-\u9fff]/g, " ")
      .match(/[A-Za-z0-9]+(?:['’][A-Za-z0-9]+)?/g)?.length ?? 0;
  const seconds = Math.min(
    MAX_STEP_SECONDS,
    Math.max(
      MIN_STEP_SECONDS,
      chineseChars / CHINESE_CHAR_PER_SECOND +
        englishWords / ENGLISH_WORD_PER_SECOND +
        VOICEOVER_HOLD_SECONDS,
    ),
  );
  const frames = seconds * fps;
  return Math.max(FRAME_INCREMENT, Math.ceil(frames / FRAME_INCREMENT) * FRAME_INCREMENT);
}

function decodePointer(path: string): string[] {
  if (path === "") return [];
  return path
    .slice(1)
    .split("/")
    .map((segment) => segment.replace(/~1/g, "/").replace(/~0/g, "~"));
}

function clamp(value: number, minimum: number, maximum: number): number {
  if (!Number.isFinite(value)) return minimum;
  return Math.max(minimum, Math.min(maximum, value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
