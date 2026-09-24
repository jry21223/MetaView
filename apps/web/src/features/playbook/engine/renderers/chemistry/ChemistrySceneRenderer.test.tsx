import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import type { MetaStep } from "../../types";
import type { ChemistrySceneSnapshot, ChemMoleculesPanel } from "../../kits/chemistry/sceneTypes";
import { rendererRegistry } from "../registry";
import type { RendererProps } from "../types";
import { ChemistrySceneRenderer } from "./ChemistrySceneRenderer";
import { TRANSITION_DELAY_FRAMES, TRANSITION_FRAMES } from "../../kits/chemistry/transitions";

const RECT = { x: 20, y: 60, w: 600, h: 340 };

function hydrogenIodide(bonds: ChemMoleculesPanel["bonds"]): ChemistrySceneSnapshot {
  return {
    kind: "chemistry_scene",
    scene_id: "test-hi",
    equation: "2HI ⇌ H_2 + I_2",
    panels: [{
      type: "molecules",
      id: "pair",
      rect: RECT,
      system_id: "pair",
      scale: 60,
      center: { x: 0, y: 0, z: 0 },
      atoms: [
        { id: "Ha", element: "H", x: 0.4, y: 0.6, z: 0 },
        { id: "Ia", element: "I", x: -1.4, y: 1.4, z: 0 },
        { id: "Hb", element: "H", x: 0.4, y: -0.6, z: 0 },
        { id: "Ib", element: "I", x: -1.4, y: -1.4, z: 0, charge: 1 },
      ],
      bonds,
    }],
    callouts: [{ id: "h2", target: "pair/Ha", text: "H–H 正在形成", tone: "focus" }],
    caption: "测试场景",
  };
}

const REACTANTS = hydrogenIodide([
  { id: "Ha-Ia", from: "Ha", to: "Ia", order: 1 },
  { id: "Hb-Ib", from: "Hb", to: "Ib", order: 1 },
]);
const PRODUCTS = hydrogenIodide([
  { id: "Ha-Hb", from: "Ha", to: "Hb", order: 1 },
  { id: "Ia-Ib", from: "Ia", to: "Ib", order: 1 },
]);

function step(id: string, snapshot: ChemistrySceneSnapshot, endFrame: number): MetaStep {
  return { step_id: id, end_frame: endFrame, title: id, voiceover_text: "", snapshot, tokens: [] };
}

function props(frame: number, theme: "light" | "dark" = "light"): RendererProps {
  return {
    step: step("products", PRODUCTS, 300),
    prevStep: step("reactants", REACTANTS, 150),
    frame,
    stepStartFrame: 150,
    stepEndFrame: 300,
    progress: 1,
    theme,
    domain: "chemistry",
  };
}

describe("ChemistrySceneRenderer", () => {
  it("is the registered renderer for chemistry_scene", () => {
    expect(rendererRegistry.get("chemistry_scene")).toBe(ChemistrySceneRenderer);
  });

  it("cracks the old bonds and grows the new ones while the step is morphing", () => {
    const mid = 150 + TRANSITION_DELAY_FRAMES + TRANSITION_FRAMES / 2;
    const markup = renderToStaticMarkup(<ChemistrySceneRenderer {...props(mid)} />);
    expect(markup).toContain('data-bond-id="Ha-Ia" data-bond-phase="breaking"');
    expect(markup).toContain('data-bond-id="Ha-Hb" data-bond-phase="forming"');
  });

  it("settles into the new structure with its callout once the morph is over", () => {
    const settled = 150 + TRANSITION_DELAY_FRAMES + TRANSITION_FRAMES + 30;
    const markup = renderToStaticMarkup(<ChemistrySceneRenderer {...props(settled)} />);
    expect(markup).not.toContain('data-bond-phase="breaking"');
    expect(markup).toContain('data-bond-id="Ia-Ib" data-bond-phase="stable"');
    expect(markup).toContain('data-callout="true"');
    expect(markup).toContain('data-charge="1"');
    expect(markup).toContain('data-equation-chip="true"');
  });

  it("draws with the shared semantic tokens and theme fallbacks, not a private dark slab", () => {
    const dark = renderToStaticMarkup(<ChemistrySceneRenderer {...props(280, "dark")} />);
    expect(dark).toContain("var(--ink, #e8efe9)");
    expect(dark).toContain("var(--canvas-focus, #e9a23b)");
    expect(dark).not.toContain("#111827");
  });
});
