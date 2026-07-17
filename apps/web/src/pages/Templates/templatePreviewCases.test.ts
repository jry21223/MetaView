import { describe, expect, it } from "vitest";

import {
  TEMPLATE_PREVIEW_CASE_IDS,
  getTemplatePreviewCase,
} from "./templatePreviewCases";

describe("template preview cases", () => {
  it("publishes four complete deterministic Playbooks with step-aware follow-ups", () => {
    expect(TEMPLATE_PREVIEW_CASE_IDS).toEqual([
      "binary-search",
      "bfs-tree",
      "derivative-tangent",
      "projectile",
    ]);

    for (const id of TEMPLATE_PREVIEW_CASE_IDS) {
      const item = getTemplatePreviewCase(id)!;
      const script = item.buildScript(item.defaultParams);
      const director = item.buildDirector(script);
      const followups = item.buildFollowups(item.defaultParams, script);

      expect(script.steps.length).toBeGreaterThanOrEqual(5);
      expect(new Set(script.steps.map((step) => JSON.stringify(step.snapshot))).size).toBeGreaterThanOrEqual(5);
      expect(script.total_frames).toBe(script.steps.at(-1)?.end_frame);
      expect(new Set(script.steps.map((step) => step.step_id)).size).toBe(script.steps.length);
      expect(director.source).toBe("manual");
      expect(director.beats).toHaveLength(script.steps.length);
      for (const step of script.steps) {
        expect(followups[step.step_id]?.length).toBeGreaterThanOrEqual(2);
        expect(followups[step.step_id]?.length).toBeLessThanOrEqual(3);
        if (step.code_highlight) {
          expect(step.code_highlight.active_line).toBeGreaterThanOrEqual(0);
          expect(step.code_highlight.active_line).toBeLessThan(step.code_highlight.lines.length);
          for (const line of step.code_highlight.active_lines) {
            expect(line).toBeGreaterThanOrEqual(0);
            expect(line).toBeLessThan(step.code_highlight.lines.length);
          }
        }
      }
    }
  });

  it("recomputes binary-search found and missing targets without a pipeline", () => {
    const item = getTemplatePreviewCase("binary-search")!;
    const found = item.buildScript({ target: 22 });
    const missing = item.buildScript({ target: 23 });

    expect(found.steps.at(-1)?.title).toBe("定位目标");
    expect(found.steps.at(-1)?.voiceover_text).toContain("索引 6");
    expect(missing.steps.at(-1)?.title).toBe("确认不存在");
    const firstComparison = found.steps.find((step) => step.step_id === "binary-compare-1");
    expect(firstComparison?.code_highlight?.lines[firstComparison.code_highlight.active_line]).toContain("low = mid + 1");
    const missingResult = missing.steps.at(-1)?.snapshot;
    expect(missingResult?.kind).toBe("algorithm_array");
    if (missingResult?.kind === "algorithm_array") {
      expect(missingResult.sorted_indices).toHaveLength(10);
      expect(missingResult.pointers.low).toBeGreaterThan(missingResult.pointers.high);
    }
  });

  it("recomputes BFS order when the start node changes", () => {
    const item = getTemplatePreviewCase("bfs-tree")!;
    const script = item.buildScript({ startNode: "3" });
    const result = script.steps.at(-1)?.voiceover_text ?? "";
    const firstVisit = script.steps.find((step) => step.step_id === "bfs-visit-3");

    expect(result).toContain("3、1、6、7、2、4、5");
    expect(firstVisit?.code_highlight?.lines[firstVisit.code_highlight.active_line]).toContain("visited.add");
  });

  it("keeps derivative slope and tangent equation synchronized", () => {
    const item = getTemplatePreviewCase("derivative-tangent")!;
    const script = item.buildScript({ markerX: 2 });
    const tangent = script.steps.find((step) => step.step_id === "derivative-tangent");

    expect(tangent?.voiceover_text).toContain("4");
    expect(tangent?.snapshot.kind).toBe("math_plot");
    if (tangent?.snapshot.kind === "math_plot") {
      expect(tangent.snapshot.curves[1]?.expression).toBe("4*x-4");
    }
  });

  it("recomputes projectile trajectory and preserves a downward gravity vector", () => {
    const item = getTemplatePreviewCase("projectile")!;
    const script = item.buildScript({ speed: 20, angle: 45 });
    const apex = script.steps.find((step) => step.step_id === "projectile-apex");

    expect(apex?.snapshot.kind).toBe("physics_force_scene");
    if (apex?.snapshot.kind === "physics_force_scene") {
      expect(apex.snapshot.trajectory?.[0]?.[1]).toBeCloseTo(apex.snapshot.trajectory?.at(-1)?.[1] ?? 0);
      expect(apex.snapshot.vectors.find((vector) => vector.id === "g")?.dy).toBeGreaterThan(0);
      expect(apex.snapshot.caption).toContain("10.2 m");
    }
  });
});
