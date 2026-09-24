/**
 * Atom ledger: what a chemistry scene draws, counted by element.
 *
 * Chemiation's rule is that every mechanism step conserves atoms; here it is
 * a checkable property of the snapshot rather than a promise. Panels that
 * share a `system_id` are one closed system: from one step to the next its
 * element counts may change only by what the step declares as `inflow`
 * (titrant from the burette, N₂ pumped into the reactor, ions arriving from a
 * salt bridge). Isotopes are counted as their own key (`18O`) so a labelling
 * experiment cannot quietly lose its tracer.
 */

import type { ChemistrySceneSnapshot, ChemPanel } from "./sceneTypes";
import { speciesDefinition, speciesElementCounts } from "./chemSpecies";

export type ElementCounts = Record<string, number>;

function add(counts: ElementCounts, key: string, amount: number): void {
  counts[key] = (counts[key] ?? 0) + amount;
  if (counts[key] === 0) delete counts[key];
}

/** Element counts drawn by one panel; apparatus, charts and cards count nothing. */
export function panelElementCounts(panel: ChemPanel): ElementCounts {
  const counts: ElementCounts = {};
  if (panel.type === "molecules") {
    for (const atom of panel.atoms) {
      add(counts, atom.isotope ? `${atom.isotope}${atom.element}` : atom.element, 1);
    }
  } else if (panel.type === "particles") {
    for (const particle of panel.particles) {
      for (const [element, amount] of Object.entries(speciesElementCounts(particle.species))) {
        add(counts, element, amount);
      }
    }
  }
  return counts;
}

/** Counts per system id for one scene, plus the inflow each system declares. */
export function sceneSystems(snapshot: ChemistrySceneSnapshot): Map<string, { counts: ElementCounts; inflow: ElementCounts }> {
  const systems = new Map<string, { counts: ElementCounts; inflow: ElementCounts }>();
  for (const panel of snapshot.panels) {
    if ((panel.type !== "molecules" && panel.type !== "particles") || !panel.system_id) continue;
    const entry = systems.get(panel.system_id) ?? { counts: {}, inflow: {} };
    for (const [key, amount] of Object.entries(panelElementCounts(panel))) add(entry.counts, key, amount);
    for (const [key, amount] of Object.entries(panel.inflow ?? {})) add(entry.inflow, key, amount);
    systems.set(panel.system_id, entry);
  }
  return systems;
}

export interface ConservationBreach {
  stepId: string;
  systemId: string;
  element: string;
  expected: number;
  actual: number;
}

/**
 * Walk the steps in order and report every element whose count changed by
 * more than the step's declared inflow. A system that disappears for a few
 * steps is compared against its last appearance when it returns.
 */
export function atomConservationBreaches(
  steps: ReadonlyArray<{ step_id: string; snapshot: { kind: string } }>,
): ConservationBreach[] {
  const last = new Map<string, ElementCounts>();
  const breaches: ConservationBreach[] = [];
  for (const step of steps) {
    if (step.snapshot.kind !== "chemistry_scene") continue;
    for (const [systemId, { counts, inflow }] of sceneSystems(step.snapshot as ChemistrySceneSnapshot)) {
      const previous = last.get(systemId);
      if (previous) {
        const expected: ElementCounts = { ...previous };
        for (const [key, amount] of Object.entries(inflow)) add(expected, key, amount);
        const keys = new Set([...Object.keys(expected), ...Object.keys(counts)]);
        for (const key of keys) {
          if ((expected[key] ?? 0) !== (counts[key] ?? 0)) {
            breaches.push({ stepId: step.step_id, systemId, element: key, expected: expected[key] ?? 0, actual: counts[key] ?? 0 });
          }
        }
      }
      last.set(systemId, counts);
    }
  }
  return breaches;
}

/** Net charge of the particles a panel draws (electrons included). */
export function panelNetCharge(panel: ChemPanel): number {
  if (panel.type !== "particles") return 0;
  return panel.particles.reduce((sum, particle) => sum + speciesDefinition(particle.species).charge, 0);
}
