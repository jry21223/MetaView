import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { visualQualityGate } from "../../../../features/playbook/engine/assets/visualQualityGate";
import { atomConservationBreaches, sceneSystems } from "../../../../features/playbook/engine/kits/chemistry/atomLedger";
import {
  equationImbalance,
  parseChemEquation,
} from "../../../../features/playbook/engine/kits/chemistry/equationBalance";
import {
  chemistryLayoutProblems,
  layoutChemistryScene,
} from "../../../../features/playbook/engine/kits/chemistry/sceneLayout";
import type { ChemistrySceneSnapshot } from "../../../../features/playbook/engine/kits/chemistry/sceneTypes";
import type { TemplatePreviewParams } from "../../templatePreviewCases";
import { expectSpeakableNarration } from "../../algorithm-cases/testing/expectSpeakableNarration";
import { CHEMISTRY_PUBLIC_GOLD_TEMPLATES } from "./chemistryGoldTemplates";

/**
 * A hand-picked parameter matrix per case: every option value and both ends
 * of every slider appear at least once (not the full cartesian product).
 */
const PARAM_MATRIX: Record<string, readonly TemplatePreviewParams[]> = {
  "galvanic-cell": [
    { anode: "Zn", electrons: 0.1 },
    { anode: "Zn", electrons: 0.2 },
    { anode: "Zn", electrons: 0.4 },
    { anode: "Fe", electrons: 0.1 },
    { anode: "Fe", electrons: 0.3 },
  ],
  "esterification-mechanism": [
    { alcohol: "ethanol", model: "ball_stick" },
    { alcohol: "ethanol", model: "space_fill" },
    { alcohol: "methanol", model: "ball_stick" },
    { alcohol: "methanol", model: "space_fill" },
  ],
  "collision-activation": [
    { temperature: 750, catalyst: "none" },
    { temperature: 725, catalyst: "pt" },
    { temperature: 800, catalyst: "none" },
    { temperature: 775, catalyst: "pt" },
  ],
  "haber-le-chatelier": [
    { addN2: 0.6, compression: "2", heat: 100 },
    { addN2: 1.0, compression: "1.5", heat: 50 },
    { addN2: 0.8, compression: "2", heat: 150 },
    { addN2: 0.6, compression: "1.5", heat: 125 },
  ],
  "acid-base-titration": [
    { conc: "0.1", indicator: "phenolphthalein", volume: 20 },
    { conc: "0.1", indicator: "methyl_orange", volume: 0 },
    { conc: "0.01", indicator: "methyl_orange", volume: 19.98 },
    { conc: "0.01", indicator: "phenolphthalein", volume: 40 },
    { conc: "1", indicator: "phenolphthalein", volume: 20.02 },
    { conc: "1", indicator: "methyl_orange", volume: 5 },
  ],
};

function matrixFor(caseId: string): readonly TemplatePreviewParams[] {
  return PARAM_MATRIX[caseId] ?? [{}];
}

const MARKUP = /[\^_{}]/;

describe("chemistry coursepack — shared contract", () => {
  it("publishes the chemistry cases in curriculum order", () => {
    expect(CHEMISTRY_PUBLIC_GOLD_TEMPLATES.map((item) => item.caseId)).toEqual(Object.keys(PARAM_MATRIX));
  });

  for (const manifest of CHEMISTRY_PUBLIC_GOLD_TEMPLATES) {
    describe(manifest.caseId, () => {
      it("has a poster and complete quality metadata", () => {
        expect(manifest.subject).toBe("high_school_chemistry");
        expect(manifest.domain).toBe("chemistry");
        expect(existsSync(resolve(`public${manifest.poster.url}`))).toBe(true);
        expect(manifest.handsOnStepIds?.length ?? 0).toBeGreaterThan(0);
      });

      for (const overrides of matrixFor(manifest.caseId)) {
        const params = { ...manifest.parameterSchema?.defaults, ...overrides };
        const label = `${manifest.caseId} ${JSON.stringify(overrides)}`;
        const script = manifest.buildPublicPlaybook(params);

        it(`${label}: 6–10 distinct chemistry steps on a valid timeline`, () => {
          expect(script.steps.length).toBeGreaterThanOrEqual(6);
          expect(script.steps.length).toBeLessThanOrEqual(10);
          expect(new Set(script.steps.map((step) => step.step_id)).size).toBe(script.steps.length);
          expect(new Set(script.steps.map((step) => JSON.stringify(step.snapshot))).size).toBe(script.steps.length);
          expect(script.total_frames).toBe(script.steps.at(-1)?.end_frame);
          expect(script.steps.every((step) => step.snapshot.kind === "chemistry_scene")).toBe(true);
          expect(manifest.buildPublicPlaybook(params)).toEqual(script);
        });

        it(`${label}: narration survives the trip to TTS`, () => {
          expectSpeakableNarration(script, label);
        });

        it(`${label}: passes the visual quality gate`, () => {
          expect(visualQualityGate(script)).toEqual([]);
        });

        it(`${label}: three step-specific Follow-ups per step, in plain text`, () => {
          const followups = manifest.buildFollowups(params, script);
          for (const step of script.steps) {
            const questions = followups[step.step_id] ?? [];
            expect(questions, `${label} ${step.step_id}`).toHaveLength(3);
            for (const item of questions) {
              expect(item.id.startsWith(step.step_id)).toBe(true);
              expect(item.answer.length).toBeGreaterThan(20);
              expect(MARKUP.test(item.answer), `${step.step_id}: markup in answer "${item.answer}"`).toBe(false);
              expect(MARKUP.test(item.question)).toBe(false);
            }
          }
        });

        it(`${label}: no text on a shape, no text on text, nothing off stage`, () => {
          for (const step of script.steps) {
            const layout = layoutChemistryScene(step.snapshot as ChemistrySceneSnapshot, step.title);
            expect(chemistryLayoutProblems(layout), `${label} ${step.step_id}`).toEqual([]);
          }
        });

        it(`${label}: every tracked system conserves its atoms`, () => {
          expect(atomConservationBreaches(script.steps)).toEqual([]);
          // The ledger must actually be exercised: some system is followed across steps.
          const stepsPerSystem = new Map<string, number>();
          for (const step of script.steps) {
            for (const systemId of sceneSystems(step.snapshot as ChemistrySceneSnapshot).keys()) {
              stepsPerSystem.set(systemId, (stepsPerSystem.get(systemId) ?? 0) + 1);
            }
          }
          expect(Math.max(0, ...stepsPerSystem.values()), label).toBeGreaterThanOrEqual(2);
        });

        it(`${label}: every printed equation balances atoms and charge`, () => {
          for (const step of script.steps) {
            const snapshot = step.snapshot as ChemistrySceneSnapshot;
            const header = parseChemEquation(snapshot.equation ?? "");
            expect(header, `${step.step_id} header "${snapshot.equation}"`).not.toBeNull();
            expect(equationImbalance(header!), `${step.step_id} "${snapshot.equation}"`).toEqual({ atoms: {}, charge: 0 });
            const cardLines = snapshot.panels.flatMap((panel) =>
              panel.type === "cards" ? panel.cards.flatMap((card) => card.lines) : [],
            );
            for (const line of cardLines) {
              const equation = parseChemEquation(line);
              if (equation) {
                expect(equationImbalance(equation), `${step.step_id} card "${line}"`).toEqual({ atoms: {}, charge: 0 });
              }
            }
          }
        });
      }
    });
  }
});
