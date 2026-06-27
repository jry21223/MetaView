import { describe, expect, it } from "vitest";
import { buildAgentSelfRepairPrompt } from "../src/agent.js";
import { selfCheckPlaybook } from "../src/state/playbookSelfCheck.js";
import type { PlaybookOutput } from "../src/state/types.js";

function makeStep(index: number): PlaybookOutput["steps"][number] {
  const activeIndex = (index - 1) % 2;
  const snapshot = {
    kind: "algorithm_array",
    array_values: ["3", "1"],
    active_indices: [activeIndex],
    swap_indices: [],
    sorted_indices: [],
    pointers: { cursor: activeIndex },
  };
  return {
    step_id: `step_${String(index).padStart(2, "0")}`,
    title: `Scan array ${index}`,
    end_frame: index * 300,
    narration_template: [`Scan the whole array in step ${index} and name the result.`],
    voiceover_text: `Scan the whole array in step ${index} and name the result.`,
    tokens: [],
    code_highlight: null,
    snapshot,
    layers: [
      {
        timing: { enter_at: 0, exit_at: 1, appear_anim: "fade", z_order: 0 },
        body: { ...snapshot, pointers: { ...snapshot.pointers } },
      },
    ],
  };
}

function validPlaybook(stepCount = 8): PlaybookOutput {
  const steps = Array.from({ length: stepCount }, (_, index) => makeStep(index + 1));
  return {
    fps: 30,
    total_frames: steps.at(-1)?.end_frame ?? 0,
    domain: "algorithm",
    title: "Array scan",
    summary: "Scan the array and explain the result.",
    parameter_controls: [],
    steps,
  };
}

describe("agent playbook self-check", () => {
  it("returns clean for a renderer-ready playbook", () => {
    const report = selfCheckPlaybook(validPlaybook(), "Scan the array");

    expect(report.status).toBe("clean");
    expect(report.issues).toEqual([]);
  });

  it("blocks one-step product playbooks as too shallow", () => {
    const report = selfCheckPlaybook(validPlaybook(1), "Scan the array");

    expect(report.status).toBe("blocked");
    expect(report.issues.map((issue) => issue.code)).toContain("step.too_shallow");
  });

  it("accepts an eight-step product playbook", () => {
    const report = selfCheckPlaybook(validPlaybook(8), "Scan the array");

    expect(report.status).toBe("clean");
  });

  it("blocks fifteen-step product playbooks", () => {
    const report = selfCheckPlaybook(validPlaybook(15), "Scan the array");

    expect(report.status).toBe("blocked");
    expect(report.issues.map((issue) => issue.code)).toContain("step.too_shallow");
  });

  it("blocks empty narration, empty snapshot payload, and invalid timing", () => {
    const playbook = validPlaybook();
    playbook.total_frames = 60;
    playbook.steps[0].voiceover_text = "";
    playbook.steps[0].snapshot = { kind: "math_plot", curves: [] };

    const report = selfCheckPlaybook(playbook, "Plot the function");

    expect(report.status).toBe("blocked");
    const codes = report.issues.map((issue) => issue.code);
    expect(codes).toContain("step.empty_voiceover");
    expect(codes).toContain("snapshot.empty_payload");
    expect(codes).toContain("timeline.exceeds_total_frames");
  });

  it("warns when narration is significantly longer than the step duration", () => {
    const playbook = validPlaybook();
    playbook.steps.forEach((step, index) => {
      step.voiceover_text = index === playbook.steps.length - 1
        ? `array ${"图".repeat(150)}`
        : "array";
      step.narration_template = ["array"];
      step.end_frame = (index + 1) * 300;
    });
    playbook.total_frames = playbook.steps.at(-1)!.end_frame;

    const report = selfCheckPlaybook(playbook, "Scan the array");
    const codes = report.issues.map((issue) => issue.code);

    expect(report.status).toBe("warnings");
    expect(codes).toContain("timeline.voiceover_too_short");
  });

  it("blocks unsupported snapshot kinds and forbidden rendering paths", () => {
    const playbook = validPlaybook();
    playbook.steps[0].snapshot = {
      kind: "raw_html",
      html: "<iframe src='https://example.test'></iframe>",
    };

    const report = selfCheckPlaybook(playbook, "Show safe renderer output");

    expect(report.status).toBe("blocked");
    const codes = report.issues.map((issue) => issue.code);
    expect(codes).toContain("snapshot.unsupported_kind");
    expect(codes).toContain("renderer.contract_risk");
  });

  it("blocks empty layers as a renderer contract risk", () => {
    const playbook = validPlaybook();
    playbook.steps[0].layers = [];

    const report = selfCheckPlaybook(playbook, "Scan the array");

    expect(report.status).toBe("blocked");
    expect(report.issues.map((issue) => issue.code)).toContain("renderer.contract_risk");
  });

  it("blocks primary layer kind mismatch as a renderer contract risk", () => {
    const playbook = validPlaybook();
    playbook.steps[0].snapshot = {
      kind: "math_plot",
      curves: [{ expression: "x^2", label: "f" }],
    };
    playbook.steps[0].layers[0].body = {
      kind: "math_formula",
      formula_latex: "f(x)=x^2",
    };

    const report = selfCheckPlaybook(playbook, "Scan the array");

    expect(report.status).toBe("blocked");
    expect(report.issues.map((issue) => issue.code)).toContain("renderer.contract_risk");
  });

  it("keeps mirrored primary layer snapshots clean", () => {
    const playbook = validPlaybook();
    const snapshot = {
      kind: "math_plot",
      curves: [{ expression: "x^2", label: "f" }],
    };
    playbook.steps[0].snapshot = snapshot;
    playbook.steps[0].layers[0].body = { ...snapshot, curves: [...snapshot.curves] };

    const report = selfCheckPlaybook(playbook, "Scan the array");

    expect(report.status).toBe("clean");
  });

  it("builds a structured repair prompt from blocked self-check output", () => {
    const playbook = validPlaybook();
    const report = {
      status: "blocked" as const,
      issues: [
        {
          code: "step.empty_voiceover",
          severity: "error" as const,
          path: "steps[0].voiceover_text",
          message: "Every step must have non-empty voiceover_text.",
          suggestion: "Write narration.",
        },
      ],
    };

    const prompt = buildAgentSelfRepairPrompt({
      originalPrompt: "Scan the array",
      previousPlaybook: playbook,
      report,
      repairAttempt: 1,
    });

    expect(prompt).toContain("agent self-check blocked");
    expect(prompt).toContain("\"repair_attempt\": 1");
    expect(prompt).toContain("\"code\": \"step.empty_voiceover\"");
    expect(prompt).toContain("PlaybookScript");
  });
});
