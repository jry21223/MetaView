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

  describe("hardened XSS surface (issue #65)", () => {
    // Helpers — parse the sanitized output as real HTML so we can assert on
    // live attributes / element kinds, not the inert text KaTeX may have
    // escape-encoded.
    function parseAsHtml(markup: string): HTMLDivElement {
      const container = document.createElement("div");
      container.innerHTML = markup;
      return container;
    }
    function anyLiveAttrStartingWith(container: HTMLElement, prefix: string): boolean {
      for (const el of container.querySelectorAll("*")) {
        for (const a of el.getAttributeNames()) {
          if (a.toLowerCase().startsWith(prefix)) return true;
        }
      }
      return false;
    }

    it("never lets an event-handler attribute survive on any real element", () => {
      const malicious = `<svg onload="alert(1)" xmlns="http://www.w3.org/2000/svg"><circle r="5"/></svg>`;
      const purified = sanitizeKatex(`\\text{${malicious}}`);
      const dom = parseAsHtml(purified);
      expect(anyLiveAttrStartingWith(dom, "on")).toBe(false);
    });

    it("never lets a javascript: href survive on any anchor", () => {
      const purified = sanitizeKatex(
        '\\text{<a href="javascript:alert(1)">x</a>}',
      );
      const dom = parseAsHtml(purified);
      for (const a of dom.querySelectorAll("a")) {
        expect(a.getAttribute("href")?.toLowerCase().startsWith("javascript:")).not.toBe(true);
      }
    });

    it("never lets a data:text/html href survive on any anchor", () => {
      const purified = sanitizeKatex(
        '\\text{<a href="data:text/html,<script>alert(1)</script>">x</a>}',
      );
      const dom = parseAsHtml(purified);
      for (const a of dom.querySelectorAll("a")) {
        const href = a.getAttribute("href")?.toLowerCase() ?? "";
        expect(href.startsWith("data:")).toBe(false);
      }
    });

    it("does not emit <foreignobject> or <iframe> elements", () => {
      const purified = sanitizeKatex(
        '\\text{<svg><foreignobject><iframe src="x"></iframe></foreignobject></svg>}',
      );
      const dom = parseAsHtml(purified);
      expect(dom.querySelectorAll("foreignobject").length).toBe(0);
      expect(dom.querySelectorAll("iframe").length).toBe(0);
    });
  });
});
