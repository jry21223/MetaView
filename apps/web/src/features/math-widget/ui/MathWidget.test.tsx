import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MathWidget } from "./MathWidget";
import { MATH_WIDGET_PRESETS } from "../lib/presets";

function render(isDark = true): string {
  return renderToStaticMarkup(<MathWidget isDark={isDark} onClose={() => {}} />);
}

describe("MathWidget", () => {
  it("renders the plot, a chip per preset and one slider per first-preset param", () => {
    const markup = render();
    expect(markup).toContain("<svg");
    for (const preset of MATH_WIDGET_PRESETS) {
      expect(markup).toContain(preset.name);
    }
    const ranges = markup.match(/type="range"/g) ?? [];
    expect(ranges).toHaveLength(MATH_WIDGET_PRESETS[0].params.length);
  });

  it("renders the live formula via KaTeX", () => {
    expect(render()).toContain("katex");
  });

  it("renders in light theme too", () => {
    const markup = render(false);
    expect(markup).toContain("<svg");
    expect(markup).toContain(MATH_WIDGET_PRESETS[0].name);
  });
});
