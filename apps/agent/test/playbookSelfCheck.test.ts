import { describe, expect, it } from "vitest";
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

    expect(report.issues).toEqual([]);
    expect(report.status).toBe("clean");
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

  it("blocks math curves whose free parameters have no controls", () => {
    const playbook = validPlaybook();
    playbook.domain = "math";
    playbook.title = "Parameterized line";
    playbook.summary = "Show how the slope changes the line.";
    playbook.steps.forEach((step) => {
      const snapshot = {
        kind: "math_plot",
        curves: [{ expression: "a*x", label: "y=a x" }],
      };
      step.title = "Parameterized line";
      step.voiceover_text = "The free slope parameter a changes the line.";
      step.narration_template = [step.voiceover_text];
      step.snapshot = structuredClone(snapshot);
      step.layers[0].body = structuredClone(snapshot);
    });

    const report = selfCheckPlaybook(
      playbook,
      "Vary the free parameter a in y=a*x.",
    );

    expect(report.status).toBe("blocked");
    expect(report.issues).toContainEqual(
      expect.objectContaining({
        code: "math.parameter_control_missing",
        severity: "error",
        path: "parameter_controls",
      }),
    );
  });

  it("blocks invalid and unused math parameter controls", () => {
    const playbook = validPlaybook();
    playbook.domain = "math";
    playbook.title = "Invalid controls";
    playbook.summary = "Reject controls that cannot drive a curve.";
    playbook.parameter_controls = [
      { id: "a", label: "Slope", value: "not-a-number" },
      { id: "unused", label: "Unused", value: "1" },
    ];
    playbook.steps.forEach((step) => {
      const snapshot = {
        kind: "math_plot",
        curves: [{ expression: "a*x", label: "y=a x" }],
      };
      step.title = "Invalid controls";
      step.voiceover_text = "The slope control must render the moving line.";
      step.narration_template = [step.voiceover_text];
      step.snapshot = structuredClone(snapshot);
      step.layers[0].body = structuredClone(snapshot);
    });

    const report = selfCheckPlaybook(playbook, "Vary a in y=a*x.");
    const codes = report.issues.map((issue) => issue.code);

    expect(report.status).toBe("blocked");
    expect(codes).toContain("math.parameter_control_invalid");
    expect(codes).toContain("math.parameter_control_unused");
  });

  it("blocks invalid and duplicate math parameter ids", () => {
    const playbook = validPlaybook();
    playbook.domain = "math";
    playbook.title = "Invalid ids";
    playbook.summary = "Reject duplicate and renderer-unsafe parameter ids.";
    playbook.parameter_controls = [
      { id: "bad-id", label: "Bad", value: "1" },
      { id: "a", label: "Slope", value: "1" },
      { id: "a", label: "Duplicate", value: "2" },
    ];
    playbook.steps.forEach((step) => {
      const snapshot = {
        kind: "math_plot",
        curves: [{ expression: "a*x", label: "line" }],
      };
      step.title = "Invalid ids";
      step.voiceover_text = "Parameter ids must be unique and renderer safe.";
      step.narration_template = [step.voiceover_text];
      step.snapshot = structuredClone(snapshot);
      step.layers[0].body = structuredClone(snapshot);
    });

    const report = selfCheckPlaybook(playbook, "Vary parameter a.");

    expect(report.status).toBe("blocked");
    expect(
      report.issues.filter(
        (issue) => issue.code === "math.parameter_control_invalid",
      ),
    ).toHaveLength(2);
  });

  it("blocks duplicate semantic controls that rename the same parameter", () => {
    const playbook = validPlaybook();
    playbook.domain = "math";
    playbook.title = "Duplicate slope controls";
    playbook.summary = "The same surviving slope must keep one control id.";
    playbook.parameter_controls = [
      { id: "k", label: "斜率 k", value: "0.3" },
      { id: "k2", label: "斜率 k", value: "0.3" },
    ];
    playbook.steps.forEach((step) => {
      const snapshot = {
        kind: "math_scene",
        curves: [
          { expression_y: "k*x", label: "moving line" },
          { expression_y: "k2*x", label: "renamed moving line" },
        ],
      };
      step.title = "Moving line";
      step.voiceover_text = "The same slope k drives every view of the line.";
      step.narration_template = [step.voiceover_text];
      step.snapshot = structuredClone(snapshot);
      step.layers[0].body = structuredClone(snapshot);
    });

    const report = selfCheckPlaybook(
      playbook,
      "The moving line y = kx + t has an intercept determined by the condition.",
    );

    expect(report.status).toBe("blocked");
    expect(report.issues.map((issue) => issue.code)).toContain(
      "math.parameter_control_invalid",
    );
  });

  it("blocks math expressions outside the renderer grammar", () => {
    const playbook = validPlaybook();
    playbook.domain = "math";
    playbook.title = "Invalid expression";
    playbook.summary = "Reject a curve the renderer cannot compile.";
    playbook.parameter_controls = [{ id: "a", label: "Slope", value: "2" }];
    playbook.steps.forEach((step) => {
      const snapshot = {
        kind: "math_plot",
        curves: [{ expression: "a**x", label: "invalid curve" }],
      };
      step.title = "Invalid expression";
      step.voiceover_text = "This expression must render before publication.";
      step.narration_template = [step.voiceover_text];
      step.snapshot = structuredClone(snapshot);
      step.layers[0].body = structuredClone(snapshot);
    });

    const report = selfCheckPlaybook(playbook, "Vary a.");

    expect(report.status).toBe("blocked");
    expect(report.issues.map((issue) => issue.code)).toContain(
      "math.parameter_control_invalid",
    );
  });

  it("blocks defaults that cannot produce a finite curve sample", () => {
    const playbook = validPlaybook();
    playbook.domain = "math";
    playbook.title = "Undefined curve";
    playbook.summary = "Reject a curve undefined throughout the sample domain.";
    playbook.steps.forEach((step) => {
      const snapshot = {
        kind: "math_plot",
        curves: [{ expression: "1/(x-x)", label: "undefined" }],
      };
      step.title = "Undefined curve";
      step.voiceover_text = "The default expression must render a finite sample.";
      step.narration_template = [step.voiceover_text];
      step.snapshot = structuredClone(snapshot);
      step.layers[0].body = structuredClone(snapshot);
    });

    const report = selfCheckPlaybook(playbook, "Plot the curve.");

    expect(report.status).toBe("blocked");
    expect(report.issues.map((issue) => issue.code)).toContain(
      "math.parameter_control_invalid",
    );
  });

  it("samples curve defaults inside the declared plot range", () => {
    const playbook = validPlaybook();
    playbook.domain = "math";
    playbook.steps.forEach((step) => {
      const snapshot = {
        kind: "math_plot",
        curves: [{ expression: "sqrt(x-2)", label: "shifted square root" }],
        x_min: 2,
        x_max: 6,
      };
      step.snapshot = structuredClone(snapshot);
      step.layers[0].body = structuredClone(snapshot);
    });

    const report = selfCheckPlaybook(
      playbook,
      "Plot y=sqrt(x-2) on x from 2 to 6.",
    );

    expect(report.status).toBe("clean");
    expect(
      report.issues.filter(
        (issue) => issue.code === "math.parameter_control_invalid",
      ),
    ).toEqual([]);
  });

  it("accepts bound controls and intrinsic parametric t", () => {
    const playbook = validPlaybook();
    playbook.domain = "math";
    playbook.title = "Parametric family";
    playbook.summary = "The amplitude changes a parametric curve.";
    playbook.parameter_controls = [{ id: "a", label: "Amplitude", value: "2" }];
    playbook.steps.forEach((step) => {
      const snapshot = {
        kind: "math_scene",
        curves: [
          {
            expression_x: "cos(t)",
            expression_y: "a*sin(t)",
            t_min: 0,
            t_max: 6.28,
            label: "parametric curve",
          },
        ],
      };
      step.title = "Parametric family";
      step.voiceover_text = "Amplitude a changes the parametric curve.";
      step.narration_template = [step.voiceover_text];
      step.snapshot = structuredClone(snapshot);
      step.layers[0].body = structuredClone(snapshot);
    });

    const report = selfCheckPlaybook(
      playbook,
      "Vary amplitude a along the parameter t.",
    );

    expect(report.status).toBe("clean");
    expect(report.issues).toEqual([]);
  });

  it("treats parametric components as one parameterized view", () => {
    const playbook = validPlaybook();
    playbook.domain = "math";
    playbook.parameter_controls = [
      { id: "a", label: "Amplitude", value: "2" },
    ];
    playbook.steps.forEach((step) => {
      const snapshot = {
        kind: "math_scene",
        curves: [
          {
            expression_x: "t",
            expression_y: "a*t",
            t_min: -2,
            t_max: 2,
            label: "varying line",
          },
        ],
      };
      step.snapshot = structuredClone(snapshot);
      step.layers[0].body = structuredClone(snapshot);
    });

    const report = selfCheckPlaybook(
      playbook,
      "Vary parameter a in the parametric line.",
    );

    expect(report.status).toBe("clean");
    expect(
      report.issues.filter((issue) =>
        issue.code.startsWith("math.parameter"),
      ),
    ).toEqual([]);
  });

  it("accepts fixed snapshot parameters without exposing sliders", () => {
    const playbook = validPlaybook();
    playbook.domain = "math";
    playbook.title = "Fixed coefficient";
    playbook.summary = "A fixed coefficient is not an interactive parameter.";
    playbook.steps.forEach((step) => {
      const snapshot = {
        kind: "math_plot",
        curves: [{ expression: "r*x", label: "fixed line" }],
        params: { r: 2 },
      };
      step.title = "Fixed coefficient";
      step.voiceover_text = "The fixed value r=2 defines this line.";
      step.narration_template = [step.voiceover_text];
      step.snapshot = structuredClone(snapshot);
      step.layers[0].body = structuredClone(snapshot);
    });

    const report = selfCheckPlaybook(playbook, "Plot the fixed line y=2x.");

    expect(report.status).toBe("clean");
    expect(report.issues).toEqual([]);
  });

  it("does not make a determined Chinese parameter interactive", () => {
    const playbook = validPlaybook();
    playbook.domain = "math";
    playbook.steps.forEach((step) => {
      const snapshot = {
        kind: "math_plot",
        curves: [{ expression: "2*x", label: "fixed line" }],
      };
      step.snapshot = structuredClone(snapshot);
      step.layers[0].body = structuredClone(snapshot);
    });

    const report = selfCheckPlaybook(
      playbook,
      "参数 a 已由题设确定为 2，绘制固定曲线 y=2x。",
    );

    expect(report.status).toBe("clean");
    expect(
      report.issues.filter((issue) =>
        issue.code.startsWith("math.parameter"),
      ),
    ).toEqual([]);
  });

  it("accepts vector-field coordinate variables", () => {
    const playbook = validPlaybook();
    playbook.domain = "math";
    playbook.title = "Vector field";
    playbook.summary = "Show a vector field in x and y.";
    playbook.steps.forEach((step) => {
      const snapshot = {
        kind: "math_scene",
        formula_latex: "F(x,y)=(-y,x)",
        vector_field: {
          expression_px: "-y",
          expression_py: "x",
        },
      };
      step.title = "Vector field";
      step.voiceover_text = "The vector field rotates around the origin.";
      step.narration_template = [step.voiceover_text];
      step.snapshot = structuredClone(snapshot);
      step.layers[0].body = structuredClone(snapshot);
    });

    const report = selfCheckPlaybook(playbook, "Vector field.");

    expect(report.issues).toEqual([]);
    expect(report.status).toBe("clean");
  });

  it("blocks a moving line whose surviving slope parameter is hardcoded", () => {
    const playbook = validPlaybook();
    playbook.domain = "math";
    playbook.title = "Fixed-point line family";
    playbook.summary = "Prove a moving line passes through a fixed point.";
    playbook.steps.forEach((step) => {
      const snapshot = {
        kind: "math_plot",
        curves: [{ expression: "0.5*x", label: "moving line" }],
      };
      step.title = "Moving line";
      step.voiceover_text = "The condition determines the intercept t.";
      step.narration_template = [step.voiceover_text];
      step.snapshot = structuredClone(snapshot);
      step.layers[0].body = structuredClone(snapshot);
    });

    const report = selfCheckPlaybook(
      playbook,
      "The moving line y = kx + t satisfies a condition that determines the intercept. Prove it always passes through a fixed point.",
    );

    expect(report.status).toBe("blocked");
    expect(report.issues).toContainEqual(
      expect.objectContaining({
        code: "math.parameter_hardcoded",
        path: "steps[0].snapshot.curves[0].expression",
      }),
    );
  });

  it("blocks a hardcoded parameter in any moving-line view", () => {
    const playbook = validPlaybook();
    playbook.domain = "math";
    playbook.parameter_controls = [
      { id: "k", label: "Slope k", value: "0.5" },
    ];
    playbook.steps.forEach((step) => {
      const snapshot = {
        kind: "math_plot",
        curves: [{ expression: "k*x", label: "line" }],
      };
      step.snapshot = structuredClone(snapshot);
      step.layers[0].body = structuredClone(snapshot);
    });
    const hardcodedSnapshot = {
      kind: "math_plot",
      curves: [{ expression: "0.5*x", label: "line" }],
    };
    playbook.steps[1].snapshot = structuredClone(hardcodedSnapshot);
    playbook.steps[1].layers[0].body = structuredClone(hardcodedSnapshot);

    const report = selfCheckPlaybook(
      playbook,
      "The moving line y = kx + t satisfies a condition that determines the intercept. Vary parameter k in every view.",
    );

    expect(report.status).toBe("blocked");
    expect(report.issues).toContainEqual(
      expect.objectContaining({
        code: "math.parameter_hardcoded",
        path: "steps[1].snapshot.curves[0].expression",
      }),
    );
  });

  it("tracks a moving curve family across renderer kinds", () => {
    const playbook = validPlaybook();
    playbook.domain = "math";
    playbook.parameter_controls = [
      { id: "k", label: "Slope k", value: "0.5" },
    ];
    playbook.steps.forEach((step) => {
      const snapshot = {
        kind: "math_plot",
        curves: [{ expression: "k*x", label: "line" }],
      };
      step.snapshot = structuredClone(snapshot);
      step.layers[0].body = structuredClone(snapshot);
    });
    const hardcodedScene = {
      kind: "math_scene",
      curves: [{ expression_y: "0.5*x", label: "line" }],
    };
    playbook.steps[1].snapshot = structuredClone(hardcodedScene);
    playbook.steps[1].layers[0].body = structuredClone(hardcodedScene);

    const report = selfCheckPlaybook(
      playbook,
      "The moving line y=kx has a determined intercept. Vary parameter k in every view.",
    );

    expect(report.status).toBe("blocked");
    expect(report.issues).toContainEqual(
      expect.objectContaining({
        code: "math.parameter_hardcoded",
        path: "steps[1].snapshot.curves[0]",
      }),
    );
  });

  it("tracks a moving curve family when its label changes", () => {
    const playbook = validPlaybook();
    playbook.domain = "math";
    playbook.parameter_controls = [
      { id: "k", label: "Slope k", value: "0.5" },
    ];
    playbook.steps.forEach((step) => {
      const snapshot = {
        kind: "math_plot",
        curves: [{ expression: "k*x", label: "symbolic line" }],
      };
      step.snapshot = structuredClone(snapshot);
      step.layers[0].body = structuredClone(snapshot);
    });
    const hardcodedScene = {
      kind: "math_scene",
      curves: [
        { expression_y: "0.5*x", label: "worked example line" },
      ],
    };
    playbook.steps[1].snapshot = structuredClone(hardcodedScene);
    playbook.steps[1].layers[0].body = structuredClone(hardcodedScene);

    const report = selfCheckPlaybook(
      playbook,
      "The moving line y=kx varies with parameter k in every view.",
    );

    expect(report.status).toBe("blocked");
    expect(report.issues).toContainEqual(
      expect.objectContaining({
        code: "math.parameter_hardcoded",
        path: "steps[1].snapshot.curves[0]",
      }),
    );
  });

  it.each(["x*0.5", "-0.5*x"])(
    "tracks the equivalent moving-curve shape %s",
    (hardcodedExpression) => {
      const playbook = validPlaybook();
      playbook.domain = "math";
      playbook.parameter_controls = [
        { id: "k", label: "Slope k", value: "0.5" },
      ];
      playbook.steps.forEach((step) => {
        const snapshot = {
          kind: "math_plot",
          curves: [{ expression: "k*x", label: "line" }],
        };
        step.snapshot = structuredClone(snapshot);
        step.layers[0].body = structuredClone(snapshot);
      });
      const hardcodedSnapshot = {
        kind: "math_plot",
        curves: [{ expression: hardcodedExpression, label: "line" }],
      };
      playbook.steps[1].snapshot = structuredClone(hardcodedSnapshot);
      playbook.steps[1].layers[0].body = structuredClone(hardcodedSnapshot);

      const report = selfCheckPlaybook(
        playbook,
        "The moving line y=kx varies with parameter k in every view.",
      );

      expect(report.status).toBe("blocked");
      expect(report.issues).toContainEqual(
        expect.objectContaining({
          code: "math.parameter_hardcoded",
          path: "steps[1].snapshot.curves[0].expression",
        }),
      );
    },
  );

  it("does not treat a reordered reference as the moving curve", () => {
    const playbook = validPlaybook();
    playbook.domain = "math";
    playbook.parameter_controls = [
      { id: "k", label: "Slope k", value: "0.5" },
    ];
    playbook.steps.forEach((step) => {
      const snapshot = {
        kind: "math_plot",
        curves: [
          { expression: "k*x", label: "moving line" },
          { expression: "x^2", label: "reference parabola" },
        ],
      };
      step.snapshot = structuredClone(snapshot);
      step.layers[0].body = structuredClone(snapshot);
    });
    const referenceSnapshot = {
      kind: "math_plot",
      curves: [{ expression: "x^2", label: "reference parabola" }],
    };
    playbook.steps[1].snapshot = structuredClone(referenceSnapshot);
    playbook.steps[1].layers[0].body = structuredClone(referenceSnapshot);

    const report = selfCheckPlaybook(
      playbook,
      "The moving line y=kx varies with parameter k in every moving-line view.",
    );

    expect(report.issues).not.toContainEqual(
      expect.objectContaining({
        code: "math.parameter_hardcoded",
        path: "steps[1].snapshot.curves[0].expression",
      }),
    );
  });

  it("blocks a hardcoded slope in a reduced moving-line equation", () => {
    const playbook = validPlaybook();
    playbook.domain = "math";
    playbook.steps.forEach((step) => {
      const snapshot = {
        kind: "math_plot",
        curves: [{ expression: "0.5*x", label: "moving line" }],
      };
      step.snapshot = structuredClone(snapshot);
      step.layers[0].body = structuredClone(snapshot);
    });

    const report = selfCheckPlaybook(
      playbook,
      "Visualize the moving line y=kx after the condition determines the intercept t=0.",
    );

    expect(report.status).toBe("blocked");
    expect(report.issues).toContainEqual(
      expect.objectContaining({
        code: "math.parameter_hardcoded",
        message: expect.stringContaining("k"),
      }),
    );
  });

  it("blocks a condition-determined intercept exposed as a slider", () => {
    const playbook = validPlaybook();
    playbook.domain = "math";
    playbook.title = "Fixed-point line family";
    playbook.summary = "Keep only the surviving slope parameter interactive.";
    playbook.parameter_controls = [
      { id: "k", label: "Slope k", value: "0.5" },
      { id: "t", label: "Intercept t", value: "0" },
    ];
    playbook.steps.forEach((step) => {
      const snapshot = {
        kind: "math_plot",
        curves: [{ expression: "k*x+t", label: "moving line" }],
      };
      step.title = "Moving line";
      step.voiceover_text = "The condition determines t=0, while k remains free.";
      step.narration_template = [step.voiceover_text];
      step.snapshot = structuredClone(snapshot);
      step.layers[0].body = structuredClone(snapshot);
    });

    const report = selfCheckPlaybook(
      playbook,
      "The moving line y = kx + t satisfies a condition that determines the intercept t=0. Prove it always passes through a fixed point.",
    );

    expect(report.status).toBe("blocked");
    expect(report.issues).toContainEqual(
      expect.objectContaining({
        code: "math.parameter_control_unused",
        path: "parameter_controls",
      }),
    );
  });

  it("blocks an explicitly varied generic parameter that was hardcoded", () => {
    const playbook = validPlaybook();
    playbook.domain = "math";
    playbook.title = "Quadratic family";
    playbook.summary = "Vary a quadratic coefficient.";
    playbook.steps.forEach((step) => {
      const snapshot = {
        kind: "math_plot",
        curves: [{ expression: "2*x^2", label: "quadratic" }],
      };
      step.title = "Quadratic family";
      step.voiceover_text = "The graph should change with parameter a.";
      step.narration_template = [step.voiceover_text];
      step.snapshot = structuredClone(snapshot);
      step.layers[0].body = structuredClone(snapshot);
    });

    const report = selfCheckPlaybook(
      playbook,
      "Vary parameter a in y=a*x^2 and show how the graph changes.",
    );

    expect(report.status).toBe("blocked");
    expect(report.issues.map((issue) => issue.code)).toContain(
      "math.parameter_hardcoded",
    );
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

});
