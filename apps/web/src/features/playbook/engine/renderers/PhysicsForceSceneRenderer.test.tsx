import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import type { MetaStep, PhysicsForceSceneSnapshot } from "../types";
import type { RendererProps } from "./types";
import { PhysicsForceSceneRenderer } from "./PhysicsForceSceneRenderer";

function projectileMotionSnapshot(extra: Partial<PhysicsForceSceneSnapshot> = {}): PhysicsForceSceneSnapshot {
  return {
    kind: "physics_force_scene",
    pack_id: "physics-basic",
    objects: [
      { id: "body", label: "小球", x: 30, y: 42 },
    ],
    vectors: [
      { id: "vx", target: "body", semantic_role: "velocity", dx: 28, dy: 0, label: "v_x" },
      { id: "vy", target: "body", semantic_role: "velocity", dx: 0, dy: 18, label: "v_y" },
      { id: "g", target: "body", semantic_role: "acceleration", dx: 0, dy: 24, label: "g" },
      { id: "drag", target: "body", semantic_role: "force", dx: -18, dy: 8, label: "F" },
    ],
    trajectory: [[18, 34], [32, 42], [50, 57], [72, 78]],
    formula_latex: "x=v_0t,\\quad y=\\frac12gt^2",
    caption: "水平方向匀速，竖直方向匀加速。",
    ...extra,
  };
}

function step(snapshot: PhysicsForceSceneSnapshot): MetaStep<PhysicsForceSceneSnapshot> {
  return {
    step_id: "projectile_motion",
    end_frame: 90,
    title: "平抛运动",
    voiceover_text: snapshot.caption ?? "",
    snapshot,
    tokens: [],
  };
}

function props(snapshot: PhysicsForceSceneSnapshot): RendererProps {
  return {
    step: step(snapshot),
    prevStep: null,
    frame: 90,
    stepStartFrame: 0,
    stepEndFrame: 90,
    progress: 1,
    theme: "light",
    domain: "physics",
  };
}

describe("PhysicsForceSceneRenderer", () => {
  it("statically renders projectile_motion with native teaching geometry", () => {
    const markup = renderToStaticMarkup(<PhysicsForceSceneRenderer {...props(projectileMotionSnapshot())} />);

    expect(markup).toContain("physics-force-scene");
    expect(markup).toContain('data-object-id="body"');
    expect(markup).toContain("<circle");
    expect(markup).toContain('data-semantic-role="lab_grid"');
    expect(markup).toContain('data-semantic-role="motion_trail"');
    expect(markup).toContain('data-semantic-role="formula_card"');
    expect(markup).toContain('data-vector-component="horizontal"');
    expect(markup).toContain('data-vector-component="vertical"');
    expect(markup).toContain("v_y");
    expect(markup).toContain('marker-end="url(#physics-arrow-velocity)"');
    expect(markup).not.toContain("projectile-body-dot");
    expect(markup).not.toContain("force-vector-arrow");
    expect(markup).not.toContain('data-missing-asset="true"');
  });

  it("uses the same native object geometry when asset_id is absent", () => {
    const snapshot = projectileMotionSnapshot({
      objects: [{ id: "body", label: "小球", x: 30, y: 42 }],
    });
    const markup = renderToStaticMarkup(<PhysicsForceSceneRenderer {...props(snapshot)} />);

    expect(markup).toContain('data-object-id="body"');
    expect(markup).toContain("<circle");
  });

  it("ignores obsolete object asset ids and keeps deterministic native geometry", () => {
    const snapshot = projectileMotionSnapshot({
      objects: [{ id: "body", label: "小球", x: 30, y: 42, asset_id: "missing-projectile" }],
    });
    const markup = renderToStaticMarkup(<PhysicsForceSceneRenderer {...props(snapshot)} />);

    expect(markup).toContain("<circle");
    expect(markup).not.toContain("missing-projectile");
  });

  it("renders velocity as a thin native vector", () => {
    const snapshot = projectileMotionSnapshot({
      vectors: [{ id: "vx", target: "body", semantic_role: "velocity", dx: 28, dy: 0, label: "v_x" }],
    });
    const markup = renderToStaticMarkup(<PhysicsForceSceneRenderer {...props(snapshot)} />);

    expect(markup).toContain('data-vector-component="horizontal"');
    expect(markup).toContain('stroke-width="1.5"');
  });
});
