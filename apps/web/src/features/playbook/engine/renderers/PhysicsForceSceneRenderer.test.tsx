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
      { id: "body", label: "小球", x: 30, y: 42, asset_id: "projectile-body-dot" },
    ],
    vectors: [
      { id: "vx", target: "body", semantic_role: "velocity", dx: 28, dy: 0, label: "v_x" },
      { id: "g", target: "body", semantic_role: "acceleration", dx: 0, dy: 24, label: "g" },
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
  it("statically renders projectile_motion with the projectile asset", () => {
    const markup = renderToStaticMarkup(<PhysicsForceSceneRenderer {...props(projectileMotionSnapshot())} />);

    expect(markup).toContain("physics-force-scene");
    expect(markup).toContain('data-object-id="body"');
    expect(markup).toContain('data-asset-id="projectile-body-dot"');
    expect(markup).toContain(
      'data-asset-path="/assets/metaview-kits/physics-basic/projectile-body-dot.svg"',
    );
    expect(markup).toContain("<image");
    expect(markup).toContain('data-semantic-role="motion_trail"');
    expect(markup).not.toContain('data-missing-asset="true"');
  });

  it("uses the physics object asset by semantic role when object.asset_id is absent", () => {
    const snapshot = projectileMotionSnapshot({
      objects: [{ id: "body", label: "小球", x: 30, y: 42 }],
    });
    const markup = renderToStaticMarkup(<PhysicsForceSceneRenderer {...props(snapshot)} />);

    expect(markup).toContain('data-asset-id="projectile-body-dot"');
    expect(markup).toContain(
      'data-asset-path="/assets/metaview-kits/physics-basic/projectile-body-dot.svg"',
    );
  });
});
