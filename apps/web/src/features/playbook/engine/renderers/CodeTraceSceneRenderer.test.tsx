import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { rendererRegistry } from "./registry";
import type { MetaStep } from "../types";
import type { RendererProps } from "./types";

function props(snapshot: Record<string, unknown>): RendererProps {
  const step: MetaStep = {
    step_id: "binary-search",
    end_frame: 90,
    title: "Binary search trace",
    voiceover_text: "Trace low, mid, and high as binary search narrows the interval.",
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

describe("CodeTraceSceneRenderer", () => {
  it("renders binary search code trace assets from algorithm-code-basic", () => {
    const Renderer = rendererRegistry.get("code_trace_scene" as never);

    expect(Renderer).toBeDefined();
    if (!Renderer) return;

    const markup = renderToStaticMarkup(
      <Renderer
        {...props({
          kind: "code_trace_scene",
          pack_id: "algorithm-code-basic",
          asset_id: "binary-search-trace-preset",
          language: "typescript",
          lines: [
            "function binarySearch(nums, target) {",
            "  let low = 0, high = nums.length - 1;",
            "  const mid = Math.floor((low + high) / 2);",
            "  if (nums[mid] === target) return mid;",
            "}",
          ],
          active_lines: [2, 3],
          active_line: 2,
          active_line_asset_id: "active-line",
          array_values: ["2", "4", "7", "11", "18", "25", "31"],
          active_indices: [3],
          search_range: [0, 6],
          pointers: [
            { id: "low", label: "low", index: 0, asset_id: "pointer-marker" },
            { id: "mid", label: "mid", index: 3, asset_id: "pointer-marker" },
            { id: "high", label: "high", index: 6, asset_id: "pointer-marker" },
          ],
          variables: { target: "11", low: "0", mid: "3", high: "6" },
          caption: "Binary search checks the middle element before discarding half the range.",
        })}
      />,
    );

    expect(markup).toContain("code-trace-scene");
    expect(markup).toContain('data-pack-id="algorithm-code-basic"');
    expect(markup).toContain('data-trace-asset-id="binary-search-trace-preset"');
    expect(markup).toContain('data-asset-id="core-flow-arrow"');
    expect(markup).toContain('data-semantic-role="flow_arrow"');
    expect(markup).toContain('data-search-range-flow="0-6"');
    expect(markup).toContain('data-asset-id="active-line"');
    expect(markup).toContain('data-asset-id="pointer-marker"');
    expect(markup).toContain('data-code-line-state="active"');
    expect(markup).toContain('data-pointer-id="mid"');
    expect(markup).toContain('data-array-cell-state="active"');
    expect(markup).toContain("binarySearch");
    expect(markup).not.toContain('data-missing-asset="true"');
  });
});
