import { expect } from "vitest";

import { visualQualityGate } from "../../../../features/playbook/engine/assets/visualQualityGate";
import type { PlaybookScript } from "../../../../features/playbook/engine/types";
import type {
  TemplatePreviewCase,
  TemplatePreviewParams,
} from "../../templatePreviewCases";
import { expectSpeakableNarration } from "./expectSpeakableNarration";

/**
 * The invariants every algorithm preview case has to hold, checked across the
 * whole parameter matrix a visitor can reach.
 *
 * Each of the eight case tests used to copy some subset of these by hand, so
 * which invariant a case was actually checked against depended on when it was
 * written — and the parameter-dependent ones were usually only checked at the
 * default parameters. A case test now declares its matrix and keeps only the
 * assertions that are about *that* algorithm.
 */
export interface DeterministicCaseOptions {
  /** Fewest steps a case may have. The catalog contract is five. */
  minSteps?: number;
  /**
   * How many steps may repeat a picture an earlier step already showed.
   * Zero — every step looks different — is the rule; a case that needs a
   * number here is carrying a known gap, not declaring a preference.
   */
  allowedRepeatedSnapshots?: number;
}

function assertScriptShape(
  script: PlaybookScript,
  label: string,
  minSteps: number,
  allowedRepeatedSnapshots: number,
): void {
  expect(script.schema_version, `${label}: schema_version`).toBe("2.0.0");
  expect(script.fps, `${label}: fps`).toBe(30);
  expect(script.steps.length, `${label}: step count`).toBeGreaterThanOrEqual(minSteps);

  const stepIds = script.steps.map((step) => step.step_id);
  expect(new Set(stepIds).size, `${label}: step ids are unique`).toBe(stepIds.length);

  // Steps that show the same picture waste a beat of the lesson.
  const snapshots = script.steps.map((step) => JSON.stringify(step.snapshot));
  const repeated = snapshots.length - new Set(snapshots).size;
  expect(repeated, `${label}: steps repeating an earlier picture`).toBeLessThanOrEqual(
    allowedRepeatedSnapshots,
  );

  expect(script.total_frames, `${label}: total_frames`).toBe(script.steps.at(-1)?.end_frame);
  for (const step of script.steps) {
    expect(step.end_frame, `${label}: ${step.step_id} end_frame`).toBeGreaterThan(0);

    const code = step.code_highlight;
    expect(code, `${label}: ${step.step_id} has a code overlay`).toBeTruthy();
    if (!code) continue;
    expect(code.active_line, `${label}: ${step.step_id} active_line`).toBeGreaterThanOrEqual(0);
    expect(code.active_line, `${label}: ${step.step_id} active_line`).toBeLessThan(code.lines.length);
    for (const line of code.active_lines) {
      expect(line, `${label}: ${step.step_id} active_lines`).toBeGreaterThanOrEqual(0);
      expect(line, `${label}: ${step.step_id} active_lines`).toBeLessThan(code.lines.length);
    }
  }
}

export function expectDeterministicCase(
  previewCase: TemplatePreviewCase,
  paramMatrix: readonly TemplatePreviewParams[] = [{}],
  options: DeterministicCaseOptions = {},
): void {
  const minSteps = options.minSteps ?? 5;
  const allowedRepeatedSnapshots = options.allowedRepeatedSnapshots ?? 0;
  expect(previewCase.templateId, "templateId matches id").toBe(previewCase.id);
  expect(previewCase.posterUrl).toBe(`/template-previews/${previewCase.id}/poster.webp`);

  for (const overrides of paramMatrix) {
    const params = { ...previewCase.defaultParams, ...overrides };
    const label = `${previewCase.id} ${JSON.stringify(overrides)}`;
    const script = previewCase.buildScript(params);

    assertScriptShape(script, label, minSteps, allowedRepeatedSnapshots);

    // Pure: the same parameters always give the same lesson, so the poster,
    // the exported playbook and the player cannot disagree.
    expect(previewCase.buildScript(params), `${label}: buildScript is pure`).toEqual(script);

    expect(visualQualityGate(script), `${label}: visual quality gate`).toEqual([]);
    expectSpeakableNarration(script, label);

    const followups = previewCase.buildFollowups(params, script);
    expect(Object.keys(followups).sort(), `${label}: a follow-up set per step`)
      .toEqual(script.steps.map((step) => step.step_id).sort());
    for (const step of script.steps) {
      expect(followups[step.step_id]?.length, `${label}: ${step.step_id} follow-ups`)
        .toBeGreaterThanOrEqual(3);
      for (const question of followups[step.step_id] ?? []) {
        expect(question.id, `${label}: ${step.step_id} question id`).toContain(step.step_id);
        expect(question.question.length, `${label}: ${step.step_id} question text`).toBeGreaterThan(0);
        expect(question.answer.length, `${label}: ${step.step_id} answer text`).toBeGreaterThan(0);
      }
    }
  }

  // The poster frame is taken from the default script, so it must land inside it.
  const defaultScript = previewCase.buildScript(previewCase.defaultParams);
  expect(previewCase.posterFrame, "posterFrame is inside the default script").toBeLessThan(
    defaultScript.total_frames,
  );
  expect(previewCase.posterFrame).toBeGreaterThanOrEqual(0);
}
