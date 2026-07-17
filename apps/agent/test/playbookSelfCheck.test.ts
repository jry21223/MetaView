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
    narration_template: [
      `Scan the whole array in step ${index} and name the result.`,
    ],
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
  const steps = Array.from({ length: stepCount }, (_, index) =>
    makeStep(index + 1),
  );
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

  it.each([
    {
      kind: "call_stack_scene",
      snapshot: {
        kind: "call_stack_scene",
        frames: [
          {
            id: "factorial-3",
            label: "factorial(3)",
            depth: 0,
            state: "active",
            variables: { n: "3" },
          },
        ],
        code_trace: {
          language: "python",
          lines: ["def factorial(n):", "    return n * factorial(n - 1)"],
          active_lines: [1],
          active_line: 1,
        },
        current_frame_id: "factorial-3",
        caption: "Factorial call stack",
      },
      title: "Factorial call stack",
      voiceover:
        "The factorial call stack shows the active frame and its return value.",
      prompt: "Explain the factorial call stack.",
    },
    {
      kind: "code_trace_scene",
      snapshot: {
        kind: "code_trace_scene",
        language: "python",
        lines: ["mid = (left + right) // 2", "if target < values[mid]:"],
        active_lines: [0],
        active_line: 0,
        array_values: ["1", "3", "5", "7"],
        active_indices: [1],
        search_range: [0, 3],
        pointers: [{ id: "mid", label: "mid", index: 1 }],
        variables: { target: "5" },
        caption: "Binary search code trace",
      },
      title: "Binary search code trace",
      voiceover:
        "The binary search code trace shows the active line and search pointers.",
      prompt: "Explain the binary search code trace.",
    },
  ])("accepts $kind through the clean path", ({ snapshot, title, voiceover, prompt }) => {
    const playbook = validPlaybook();
    playbook.title = title;
    playbook.summary = voiceover;
    playbook.steps.forEach((step) => {
      step.title = title;
      step.voiceover_text = voiceover;
      step.narration_template = [voiceover];
      step.snapshot = structuredClone(snapshot);
      step.layers[0].body = structuredClone(snapshot);
    });

    const report = selfCheckPlaybook(playbook, prompt);

    expect(report.status).toBe("clean");
    expect(report.issues).toEqual([]);
  });

  it("blocks one-step product playbooks as too shallow", () => {
    const report = selfCheckPlaybook(validPlaybook(1), "Scan the array");

    expect(report.status).toBe("blocked");
    expect(report.issues.map((issue) => issue.code)).toContain(
      "step.too_shallow",
    );
  });

  it("accepts an eight-step product playbook", () => {
    const report = selfCheckPlaybook(validPlaybook(8), "Scan the array");

    expect(report.status).toBe("clean");
  });

  it("blocks fifteen-step product playbooks", () => {
    const report = selfCheckPlaybook(validPlaybook(15), "Scan the array");

    expect(report.status).toBe("blocked");
    expect(report.issues.map((issue) => issue.code)).toContain(
      "step.too_shallow",
    );
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
      step.voiceover_text =
        index === playbook.steps.length - 1
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
    expect(report.issues.map((issue) => issue.code)).toContain(
      "renderer.contract_risk",
    );
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
    expect(report.issues.map((issue) => issue.code)).toContain(
      "renderer.contract_risk",
    );
  });

  it("keeps mirrored primary layer snapshots clean", () => {
    const playbook = validPlaybook();
    const snapshot = {
      kind: "math_plot",
      curves: [{ expression: "x^2", label: "f" }],
    };
    playbook.steps[0].snapshot = snapshot;
    playbook.steps[0].layers[0].body = {
      ...snapshot,
      curves: [...snapshot.curves],
    };

    const report = selfCheckPlaybook(playbook, "Scan the array");

    expect(report.status).toBe("clean");
  });

  it("blocks subject visual playbooks that fall back to algorithm_array", () => {
    const playbook = validPlaybook();
    playbook.domain = "geography";
    playbook.title = "East Asia monsoon";
    playbook.summary = "Explain East Asia monsoon with a map.";
    playbook.steps.forEach((step) => {
      step.title = "East Asia monsoon array fallback";
      step.voiceover_text =
        "Use the East Asia monsoon map, not an array fallback.";
      step.narration_template = [step.voiceover_text];
    });

    const report = selfCheckPlaybook(playbook, "Explain the East Asia monsoon");

    expect(report.status).toBe("blocked");
    expect(report.issues.map((issue) => issue.code)).toContain(
      "snapshot.domain_fallback",
    );
    expect(
      report.issues.find((issue) => issue.code === "snapshot.domain_fallback")
        ?.suggestion,
    ).toContain("SceneBlueprint");
  });

  it("accepts subject visual renderer kinds used by SceneBlueprint compiler output", () => {
    const playbook = validPlaybook();
    playbook.domain = "geography";
    const snapshot = {
      kind: "geo_map_scene",
      pack_id: "geography-earth-basic",
      map_region: "east_asia",
      layers: [
        {
          id: "land",
          semantic_role: "map_layer",
          asset_id: "east-asia-land-110m",
        },
      ],
      flows: [
        {
          id: "summer",
          semantic_role: "monsoon_flow",
          asset_id: "monsoon-wind-arrow",
        },
      ],
      pressure_centers: [
        { id: "land-low", kind: "low", x: 38, y: 35, label: "land low" },
      ],
      particle_preset: "moisture_particles",
    };
    playbook.steps.forEach((step) => {
      step.title = "East Asia monsoon map";
      step.voiceover_text =
        "The East Asia monsoon map shows land and ocean pressure.";
      step.narration_template = [step.voiceover_text];
      step.snapshot = structuredClone(snapshot);
      step.layers[0].body = structuredClone(snapshot);
    });

    const report = selfCheckPlaybook(playbook, "Explain the East Asia monsoon");

    expect(report.status).toBe("clean");
  });

  it("accepts biology process scenes produced by SceneBlueprint compiler output", () => {
    const playbook = validPlaybook();
    playbook.domain = "biology";
    const snapshot = {
      kind: "bio_process_scene",
      pack_id: "biology-basic",
      process_id: "dna_replication",
      steps: [
        {
          id: "template",
          semantic_role: "dna",
          label: "template DNA",
          x: 22,
          y: 48,
          width: 18,
          height: 38,
          asset_id: "dna-helix",
        },
        {
          id: "fork",
          semantic_role: "process_step",
          label: "replication fork",
          x: 50,
          y: 48,
          width: 24,
          height: 24,
          asset_id: "replication-fork",
        },
      ],
      connections: [
        {
          id: "template-to-fork",
          from: "template",
          to: "fork",
          semantic_role: "flow_arrow",
          asset_id: "core-flow-arrow",
        },
      ],
      callouts: [
        {
          id: "base-pairing",
          target_id: "fork",
          label: "base pairing",
          side: "top",
        },
      ],
    };
    playbook.steps.forEach((step) => {
      step.title = "DNA replication process";
      step.voiceover_text =
        "DNA replication copies template strands through a replication fork.";
      step.narration_template = [step.voiceover_text];
      step.snapshot = structuredClone(snapshot);
      step.layers[0].body = structuredClone(snapshot);
    });

    const report = selfCheckPlaybook(playbook, "Explain DNA replication");

    expect(report.status).toBe("clean");
  });

  it("accepts chemistry reaction scenes produced by SceneBlueprint compiler output", () => {
    const playbook = validPlaybook();
    playbook.domain = "chemistry";
    const snapshot = {
      kind: "reaction_scene",
      pack_id: "chemistry-basic",
      reaction_id: "reaction_synthesis_water",
      reactants: [
        { id: "h2", formula_latex: "H_2", label: "hydrogen", coefficient: 2, x: 18, y: 48 },
        { id: "o2", formula_latex: "O_2", label: "oxygen", coefficient: 1, x: 38, y: 48 },
      ],
      products: [
        { id: "h2o", formula_latex: "H_2O", label: "water", coefficient: 2, x: 78, y: 48 },
      ],
      arrows: [
        { id: "main-arrow", semantic_role: "reaction_arrow", from: [48, 48], to: [66, 48], asset_id: "reaction-arrow" },
      ],
      electron_flows: [
        { id: "electron-shift", semantic_role: "electron_flow", from: [39, 38], to: [58, 36], asset_id: "electron-flow" },
      ],
      formula_latex: "2H_2 + O_2 \\rightarrow 2H_2O",
    };
    playbook.steps.forEach((step) => {
      step.title = "Water synthesis reaction";
      step.voiceover_text =
        "The chemistry reaction scene shows reactants forming water while conserving atoms.";
      step.narration_template = [step.voiceover_text];
      step.snapshot = structuredClone(snapshot);
      step.layers[0].body = structuredClone(snapshot);
    });

    const report = selfCheckPlaybook(playbook, "Explain water synthesis");

    expect(report.status).toBe("clean");
  });

  it("does not treat summary or a generic Chinese final step as the answer", () => {
    const playbook = validPlaybook();
    const prompt = "用二叉树演示广度优先遍历的访问顺序，逐层点亮节点。";
    playbook.summary = prompt;
    const finalStep = playbook.steps.at(-1)!;
    finalStep.title = "课程结束";
    finalStep.voiceover_text = "这就是最后的结果。";
    finalStep.narration_template = [finalStep.voiceover_text];

    const report = selfCheckPlaybook(playbook, prompt);

    expect(report.status).toBe("blocked");
    expect(report.issues.map((issue) => issue.code)).toContain(
      "step.does_not_answer_prompt",
    );
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
    expect(prompt).toContain('"repair_attempt": 1');
    expect(prompt).toContain('"code": "step.empty_voiceover"');
    expect(prompt).toContain("PlaybookScript");
  });
});
