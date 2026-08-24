import { describe, expect, it } from "vitest";

import { PUBLIC_GOLD_TEMPLATES } from "./gold-templates/publicGoldTemplates";
import {
  applyNarrationTimeline,
  narrationStepFrames,
  posterFrameForStep,
} from "./narrationTiming";

describe("narration timing", () => {
  it("gives longer narration more frames and keeps a watchable floor", () => {
    const short = narrationStepFrames("短句。", 30);
    const medium = narrationStepFrames("这是一段大约二十个字左右的中等长度旁白示例。", 30);
    const long = narrationStepFrames(
      "这是一段明显更长的讲解旁白，包含推导、当前数值和结论复述，用来验证步长会随文字量增长而增长。",
      30,
    );
    expect(short).toBe(120);
    expect(medium).toBeGreaterThan(short);
    expect(long).toBeGreaterThan(medium);
    expect(narrationStepFrames("短句。", 30)).toBe(short);
  });

  it("assigns cumulative, strictly increasing end frames", () => {
    const steps = ["第一步的旁白内容。", "第二步的旁白内容，明显比第一步更长一些用来对照。"].map(
      (voiceover_text, index) => ({
        step_id: `s${index}`,
        end_frame: 0,
        title: `s${index}`,
        voiceover_text,
        snapshot: { kind: "math_scene" } as never,
        tokens: [],
      }),
    );
    const timed = applyNarrationTimeline(steps, 30);
    expect(timed[0].end_frame).toBe(narrationStepFrames(steps[0].voiceover_text, 30));
    expect(timed[1].end_frame).toBe(
      timed[0].end_frame + narrationStepFrames(steps[1].voiceover_text, 30),
    );
  });

  it("keeps every published poster frame strictly inside its chosen step", () => {
    for (const manifest of PUBLIC_GOLD_TEMPLATES) {
      const script = manifest.buildPublicPlaybook(manifest.parameterSchema?.defaults ?? {});
      expect(manifest.poster.frame).toBeGreaterThan(0);
      expect(manifest.poster.frame).toBeLessThan(script.total_frames);
      expect(script.steps.some((step) => step.end_frame === manifest.poster.frame)).toBe(false);
    }
  });

  it("derives distinct step durations from real template narration", () => {
    const ellipse = PUBLIC_GOLD_TEMPLATES.find(
      (item) => item.caseId === "ellipse-focus-definition",
    )!;
    const script = ellipse.buildPublicPlaybook(ellipse.parameterSchema!.defaults);
    const durations = script.steps.map((step, index) =>
      step.end_frame - (index > 0 ? script.steps[index - 1].end_frame : 0),
    );
    expect(new Set(durations).size).toBeGreaterThan(1);
    expect(posterFrameForStep(script, script.steps.length - 1)).toBe(script.total_frames - 40);
  });
});
