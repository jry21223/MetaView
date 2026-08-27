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
    expect(markup).toContain('data-semantic-role="motion_axes"');
    expect(markup).toContain('data-render-mode="native-trajectory"');
    expect(markup).toContain('data-semantic-role="formula_card"');
    expect(markup).toContain('data-vector-component="horizontal"');
    expect(markup).toContain('data-vector-component="vertical"');
    expect(markup).toContain("v_y");
    expect(markup).toContain('marker-end="url(#physics-arrow-velocity)"');
    expect(markup).toContain("var(--surface-2, #faf8f3)");
    expect(markup).toContain("var(--physics-trajectory, #2f3431)");
    expect(markup).toContain("var(--physics-velocity, #356b5c)");
    expect(markup).toContain("var(--physics-acceleration, #8a5a00)");
    expect(markup).toContain("var(--physics-force, #2f3431)");
    expect(markup).not.toContain("var(--warn");
    expect(markup).not.toContain("var(--canvas-primary");
    expect(markup).toContain('data-semantic-role="trajectory"');
    expect(markup).toContain('stroke-width="1.5"');
    expect(markup).not.toContain("#1f8abd");
    expect(markup).not.toContain("#8e44ad");
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
    expect(markup).toContain('stroke-width="0.52"');
  });

  it("replaces the abstract axes with a hatched ground when ground_y is declared", () => {
    const markup = renderToStaticMarkup(
      <PhysicsForceSceneRenderer {...props(projectileMotionSnapshot({ ground_y: 78 }))} />,
    );

    expect(markup).toContain('data-semantic-role="ground"');
    expect(markup).not.toContain('data-semantic-role="motion_axes"');
    expect(markup).toContain('data-semantic-role="motion_trail"');
  });

  it("draws labelled extra trajectories with emphasis styling", () => {
    const markup = renderToStaticMarkup(<PhysicsForceSceneRenderer {...props(projectileMotionSnapshot({
      trajectories: [
        {
          id: "twin",
          points: [[20, 26], [20, 78]],
          label: "自由落下",
          emphasis: "secondary",
          semantic_role: "drop_line",
        },
        {
          id: "mirror",
          points: [[20, 78], [50, 30], [80, 78]],
          label: "90°−θ",
          emphasis: "accent",
          semantic_role: "complementary_trajectory",
        },
      ],
    }))} />);

    expect(markup).toContain('data-semantic-role="drop_line"');
    expect(markup).toContain('data-semantic-role="complementary_trajectory"');
    expect(markup).toContain("自由落下");
    expect(markup).toContain('stroke-dasharray="2.1 1.6"');
  });

  it("marks scene points, annotations, and a zig-zag spring coil", () => {
    const markup = renderToStaticMarkup(<PhysicsForceSceneRenderer {...props(projectileMotionSnapshot({
      points: [{ x: 40, y: 50, label: "t=1 s", semantic_role: "time_sample" }],
      annotations: [{ x: 50, y: 30, text: "同一时刻，同一高度", semantic_role: "equal_height_note" }],
      springs: [{ id: "coil", x0: 14, y0: 55, x1: 46, y1: 55, coils: 8, semantic_role: "spring_coil" }],
    }))} />);

    expect(markup).toContain('data-semantic-role="time_sample"');
    expect(markup).toContain("t=1 s");
    expect(markup).toContain('data-semantic-role="equal_height_note"');
    expect(markup).toContain("同一时刻，同一高度");
    expect(markup).toContain('data-semantic-role="spring_coil"');
    // The coil path zig-zags: it needs many more segments than a straight line.
    const coilPath = markup.match(/data-semantic-role="spring_coil"><path d="([^"]+)"/)?.[1] ?? "";
    expect(coilPath.split("L").length).toBeGreaterThan(8);
    expect(markup).toContain('paint-order="stroke"');
  });
});
