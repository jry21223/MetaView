import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { CodeHighlightRenderer } from "./CodeHighlightRenderer";
import type { CodeHighlightOverlay } from "../types";

function overlay(extra: Partial<CodeHighlightOverlay> = {}): CodeHighlightOverlay {
  return {
    language: "python",
    lines: [
      "def bubble_sort(arr):",
      "    for i in range(len(arr)):",
      "        for j in range(len(arr) - i - 1):",
      "            if arr[j] > arr[j+1]:",
      "                arr[j], arr[j+1] = arr[j+1], arr[j]",
    ],
    active_lines: [3],
    active_line: 3,
    variables: { i: "0", j: "1" },
    operation_label: "比较",
    ...extra,
  };
}

function render(o: CodeHighlightOverlay, theme: "dark" | "light" = "dark"): string {
  return renderToStaticMarkup(<CodeHighlightRenderer overlay={o} theme={theme} />);
}

describe("CodeHighlightRenderer", () => {
  it("renders every source line through the tokenizer", () => {
    const markup = render(overlay());
    // Tokens land in their own spans, so search for distinctive identifiers
    // rather than the un-tokenized source line.
    expect(markup).toContain("bubble_sort");
    expect(markup).toContain(">range<");
    expect(markup).toContain(">for<");
    expect(markup).toContain(">if<");
  });

  it("shows the configured variable watchers", () => {
    const markup = render(overlay());
    expect(markup).toContain(">i<");
    expect(markup).toContain(">j<");
    expect(markup).toContain(">0<");
    expect(markup).toContain(">1<");
  });

  it("emits a line-number gutter for each line", () => {
    const markup = render(overlay());
    // 5-line overlay should render at least the integers 1..5 in the gutter.
    for (const lineNum of [1, 2, 3, 4, 5]) {
      expect(markup).toContain(`>${lineNum}<`);
    }
  });

  it("renders the operation label when supplied", () => {
    const markup = render(overlay({ operation_label: "交换 arr[j] 和 arr[j+1]" }));
    expect(markup).toContain("交换 arr[j] 和 arr[j+1]");
  });

  it("renders an empty overlay without crashing", () => {
    const markup = render(
      overlay({ lines: [], active_lines: [], active_line: -1, variables: {} }),
    );
    expect(markup.length).toBeGreaterThan(0);
  });

  it("light theme produces different markup than dark", () => {
    const dark = render(overlay(), "dark");
    const light = render(overlay(), "light");
    expect(dark).not.toBe(light);
  });
});
