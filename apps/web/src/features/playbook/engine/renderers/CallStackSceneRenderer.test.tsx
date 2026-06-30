import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { rendererRegistry } from "./registry";
import type { MetaStep } from "../types";
import type { RendererProps } from "./types";

function props(snapshot: Record<string, unknown>): RendererProps {
  const step: MetaStep = {
    step_id: "recursion-stack",
    end_frame: 90,
    title: "Factorial recursion stack",
    voiceover_text: "Trace recursive calls and the active return line.",
    snapshot: snapshot as MetaStep["snapshot"],
    tokens: [],
  };
  return {
    step,
    prevStep: null,
    frame: 45,
    stepStartFrame: 0,
    stepEndFrame: 90,
    progress: 1,
    theme: "light",
  };
}

describe("CallStackSceneRenderer", () => {
  it("renders recursion frames and code trace assets from algorithm-code-basic", () => {
    const Renderer = rendererRegistry.get("call_stack_scene" as never);

    expect(Renderer).toBeDefined();
    if (!Renderer) return;

    const markup = renderToStaticMarkup(
      <Renderer
        {...props({
          kind: "call_stack_scene",
          pack_id: "algorithm-code-basic",
          asset_id: "recursion-stack-preset",
          frames: [
            { id: "f4", label: "factorial(4)", depth: 0, state: "waiting", asset_id: "stack-frame" },
            { id: "f3", label: "factorial(3)", depth: 1, state: "active", asset_id: "call-frame" },
          ],
          code_trace: {
            language: "python",
            lines: ["def factorial(n):", "    if n == 1:", "        return 1", "    return n * factorial(n - 1)"],
            active_lines: [3],
            active_line: 3,
            asset_id: "active-line",
          },
          current_frame_id: "f3",
          caption: "Recursive calls stack up until the base case returns.",
        })}
      />,
    );

    expect(markup).toContain("call-stack-scene");
    expect(markup).toContain('data-pack-id="algorithm-code-basic"');
    expect(markup).toContain('data-stack-asset-id="recursion-stack-preset"');
    expect(markup).toContain('data-asset-id="call-frame"');
    expect(markup).toContain('data-asset-id="stack-frame"');
    expect(markup).toContain('data-asset-id="active-line"');
    expect(markup).toContain('data-frame-state="active"');
    expect(markup).toContain("factorial(3)");
    expect(markup).not.toContain('data-missing-asset="true"');
  });
});
