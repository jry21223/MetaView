import { describe, expect, it } from "vitest";
import { buildAgentSelfRepairPrompt } from "../src/agent.js";
import { selfCheckPlaybook } from "../src/state/playbookSelfCheck.js";
import type { PlaybookOutput } from "../src/state/types.js";

function validPlaybook(): PlaybookOutput {
  return {
    fps: 30,
    total_frames: 120,
    domain: "algorithm",
    title: "Array scan",
    summary: "Scan the array and explain the result.",
    parameter_controls: [],
    steps: [
      {
        step_id: "step_01",
        title: "Scan array",
        end_frame: 120,
        narration_template: ["Scan the whole array and name the result."],
        voiceover_text: "Scan the whole array and name the result.",
        tokens: [],
        code_highlight: null,
        snapshot: {
          kind: "algorithm_array",
          array_values: ["3", "1"],
          active_indices: [0],
          swap_indices: [],
          sorted_indices: [],
          pointers: {},
        },
        layers: [
          {
            timing: { enter_at: 0, exit_at: 1, appear_anim: "fade", z_order: 0 },
            body: {
              kind: "algorithm_array",
              array_values: ["3", "1"],
              active_indices: [0],
              swap_indices: [],
              sorted_indices: [],
              pointers: {},
            },
          },
        ],
      },
    ],
  };
}

describe("agent playbook self-check", () => {
  it("returns clean for a renderer-ready playbook", () => {
    const report = selfCheckPlaybook(validPlaybook(), "Scan the array");

    expect(report.status).toBe("clean");
    expect(report.issues).toEqual([]);
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
