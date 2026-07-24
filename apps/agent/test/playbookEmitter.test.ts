import { describe, expect, it } from "vitest";

import { PlaybookEmitter } from "../src/state/playbookEmitter.js";

function outline(emitter: PlaybookEmitter, domain = "math"): void {
  emitter.setOutline(
    domain,
    Array.from({ length: 8 }, (_, index) => `step ${index + 1}`),
  );
}

function fillRemaining(emitter: PlaybookEmitter, start = 2): void {
  for (let index = start; index <= 8; index += 1) {
    emitter.beginStep(index, `step ${index}`);
    emitter.addFormula(`x_${index}`);
    emitter.setNarration([`第 ${index} 步建立可见公式。`]);
    emitter.commitStep();
  }
}

describe("PlaybookEmitter transactional lifecycle", () => {
  it("requires one authoritative 8-14 step outline", () => {
    const emitter = new PlaybookEmitter();
    expect(() => emitter.beginStep(1, "missing outline")).toThrow(/plan_outline/);
    expect(() => emitter.setOutline("math", ["only one"])).toThrow(/8-14/);
    expect(() => emitter.setOutline("unknown", Array(8).fill("x"))).toThrow(/unsupported domain/);
  });

  it("rejects duplicate or skipped indices at tool-call time", () => {
    const emitter = new PlaybookEmitter();
    outline(emitter);
    expect(() => emitter.beginStep(2, "skip")).toThrow(/expected outline index 1/);
    emitter.beginStep(1, "first");
    emitter.addFormula("x");
    emitter.setNarration(["建立第一个可见步骤。"]);
    emitter.commitStep();
    expect(() => emitter.beginStep(1, "duplicate")).toThrow(/expected outline index 2/);
  });

  it("stashes, refines, and explicitly commits a template draft", () => {
    const emitter = new PlaybookEmitter();
    outline(emitter);
    emitter.beginStep(1, "draft");
    emitter.addFormula("x^2");
    emitter.setNarration(["初始旁白。"]);
    const draft = emitter.stashCurrentDraft();
    expect(emitter.draftCount()).toBe(1);
    emitter.selectStepDraft(draft.draft_id);
    emitter.setNarration(["修订后的旁白解释为什么、做什么和学到什么。"]);
    emitter.commitStep();
    fillRemaining(emitter);
    const output = emitter.finalize();
    expect(output.steps[0].voiceover_text).toContain("修订后的旁白");
  });

  it("never auto-commits unresolved drafts during finalization", () => {
    const emitter = new PlaybookEmitter();
    outline(emitter);
    emitter.beginStep(1, "open");
    emitter.addFormula("x");
    emitter.setNarration(["尚未提交。"]);
    expect(() => emitter.finalize()).toThrow(/open draft/);
  });

  it("emits a real code_trace_scene and parallel Code Sync state", () => {
    const emitter = new PlaybookEmitter();
    outline(emitter, "code");
    emitter.beginStep(1, "code");
    emitter.setCodeHighlight(
      {
        language: "python",
        lines: ["x = 1", "x += 1"],
        active_lines: [1],
        active_line: 1,
        variables: { x: "2" },
        operation_label: "increment",
      },
      true,
    );
    emitter.setNarration(["执行第二行并同步展示 x 的新值。"]);
    emitter.commitStep();
    fillRemaining(emitter);
    const output = emitter.finalize();
    expect(output.steps[0].snapshot.kind).toBe("code_trace_scene");
    expect(output.steps[0].code_highlight?.variables.x).toBe("2");
  });

  it("applies compiled layers without asking the model to rewrite JSON", () => {
    const emitter = new PlaybookEmitter();
    outline(emitter);
    emitter.beginStep(1, "compiled");
    const snapshot = { kind: "math_plot", curves: [{ expression: "x^2" }] };
    emitter.applyCompiledLayers(snapshot, [
      {
        timing: { enter_at: 0, exit_at: 1, appear_anim: "draw", z_order: 0 },
        body: snapshot,
      },
    ]);
    emitter.setNarration(["由注册表编译并直接应用图层。"]);
    emitter.commitStep();
    fillRemaining(emitter);
    const output = emitter.finalize();
    expect(output.steps[0].layers[0].timing.appear_anim).toBe("draw");
    expect(output.steps[0].layers[0].body).toEqual(output.steps[0].snapshot);
  });
});
