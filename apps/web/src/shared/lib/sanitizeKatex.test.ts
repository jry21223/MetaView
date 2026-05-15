import { describe, expect, it } from "vitest";
import { sanitizeKatex } from "./sanitizeKatex";

describe("sanitizeKatex", () => {
  it("renders well-formed LaTeX to KaTeX HTML", () => {
    const html = sanitizeKatex("x^2 + 1");
    expect(html).toContain("katex");
    expect(html).toContain("<span");
  });

  it("supports display mode", () => {
    const html = sanitizeKatex("\\frac{a}{b}", { displayMode: true });
    expect(html).toContain("katex-display");
  });

  it("does not emit an unescaped <script> tag even when payload tries to break out", () => {
    const payload = "\\text{</span><script>alert('xss')</script>}";
    const html = sanitizeKatex(payload);
    expect(html.toLowerCase()).not.toMatch(/<script\b/);
    // The container is parsed as HTML — there must be no executable element.
    const container = document.createElement("div");
    container.innerHTML = html;
    expect(container.querySelectorAll("script").length).toBe(0);
  });

  it("does not emit inline event handlers on any element that survives sanitization", () => {
    const payload = "\\text{<img src=x onerror=alert(1)>}";
    const html = sanitizeKatex(payload);
    expect(html.toLowerCase()).not.toMatch(/<img\b/);
    const container = document.createElement("div");
    container.innerHTML = html;
    for (const el of container.querySelectorAll("*")) {
      for (const attr of el.getAttributeNames()) {
        expect(attr.toLowerCase().startsWith("on")).toBe(false);
      }
    }
  });

  it("returns empty string on completely invalid sources without throwing", () => {
    expect(() => sanitizeKatex("\\unknownmacro{")).not.toThrow();
  });
});
