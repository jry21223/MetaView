import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { createRuntime } from "../../../shared/playbook";
import { exampleCatalog, exampleRegistry } from "./exampleCatalog";
import { compileAuthoringScript } from "./renderBridge";
import { PlaybookComposition } from "../engine/composition/PlaybookComposition";

vi.mock("remotion", async () => {
  const actual = await vi.importActual<typeof import("remotion")>("remotion");
  return { ...actual, useCurrentFrame: () => 150, useVideoConfig: () => ({ fps: 30 }), spring: () => 1 };
});

describe.each(["solar", "graph"])("%s uses the established rendering path", (id) => {
  it("renders the compiled PlaybookScript through Composition without another output contract", () => {
    const example = exampleCatalog.find((entry) => entry.id === id)!;
    const work = createRuntime(example.document, exampleRegistry).read();
    const script = compileAuthoringScript(work);
    const markup = renderToStaticMarkup(createElement(PlaybookComposition, { script, theme: "light", showSubtitles: false }));
    expect(markup).toContain("motion-scene-renderer");
    expect(markup).toContain('viewBox="0 0 1000 560"');
    expect(markup).not.toContain("<iframe");
    const snapshot = script.steps[0].snapshot;
    if (snapshot.kind !== "motion_scene") throw new Error("Unexpected snapshot kind");
    expect(snapshot.objects.map((object) => object.id)).toEqual(work.elements.map((element) => element.id));
    const hit = work.components.flatMap((entry) => entry.output?.primitives ?? []).find((primitive) => primitive.elementId === example.defaultElementId)!;
    const drawn = snapshot.objects.find((object) => object.id === example.defaultElementId)!;
    if (hit.shape === "circle" && drawn.type === "point") expect([drawn.x, drawn.y, drawn.r]).toEqual([hit.x, hit.y, hit.r]);
    else if (hit.shape === "line" && drawn.type === "segment") expect([drawn.x1, drawn.y1, drawn.x2, drawn.y2]).toEqual([hit.x, hit.y, hit.x2, hit.y2]);
    else throw new Error("Hit surface and rendered geometry disagree");
  });
});

it("preserves each declared text size in the established motion text roles", async () => {
  const { compilePrimitiveSnapshot } = await import("./renderBridge");
  const snapshot = compilePrimitiveSnapshot([
    { elementId: "caption", shape: "text", x: 10, y: 20, text: "说明", fontSize: 16 },
    { elementId: "label", shape: "text", x: 30, y: 40, text: "标签", fontSize: 20 },
    { elementId: "title", shape: "text", x: 50, y: 60, text: "标题", fontSize: 34 },
  ]);
  expect(snapshot.objects).toEqual([
    { id: "caption", type: "text", x: 10, y: 20, text: "说明", style: "caption" },
    { id: "label", type: "text", x: 30, y: 40, text: "标签", style: "label" },
    { id: "title", type: "text", x: 50, y: 60, text: "标题", style: "title" },
  ]);
});

it("keeps shape geometry, tone and opacity in the existing motion contract", async () => {
  const { compilePrimitiveSnapshot } = await import("./renderBridge");
  const snapshot = compilePrimitiveSnapshot([
    { elementId: "circle", shape: "circle", x: 12, y: 24, r: 8, tone: "focus", opacity: .4 },
    { elementId: "line", shape: "line", x: 1, y: 2, x2: 3, y2: 4, tone: "secondary" },
    { elementId: "polygon", shape: "polygon", points: [[1, 2], [3, 4], [5, 6]], tone: "primary" },
    { elementId: "ellipse", shape: "ellipse", x: 100, y: 200, rx: 20, ry: 10, rotation: 90, tone: "muted" },
  ]);
  expect(snapshot.objects.slice(0, 3)).toEqual([
    { id: "circle", type: "point", x: 12, y: 24, r: 8, style: "accent" },
    { id: "line", type: "segment", x1: 1, y1: 2, x2: 3, y2: 4, style: "secondary" },
    { id: "polygon", type: "polygon", points: [[1, 2], [3, 4], [5, 6]], style: "primary" },
  ]);
  const ellipse = snapshot.objects[3];
  if (ellipse.type !== "polygon") throw new Error("Expected closed ellipse geometry");
  expect(ellipse.style).toBe("muted");
  expect(ellipse.points[0][0]).toBeCloseTo(100);
  expect(ellipse.points[0][1]).toBeCloseTo(220);
  expect(ellipse.points[20][0]).toBeCloseTo(90);
  expect(ellipse.points[20][1]).toBeCloseTo(200);
  expect(snapshot.tracks).toEqual([{ target: "circle", property: "opacity", keyframes: [{ t: 0, value: .4 }, { t: 1, value: .4 }] }]);
});

it("rejects unsupported authoring attributes rather than silently losing them", async () => {
  const { compilePrimitiveSnapshot } = await import("./renderBridge");
  const unsupported = [
    { elementId: "text", shape: "text", x: 0, y: 0, text: "标签", align: "middle" },
    { elementId: "text", shape: "text", x: 0, y: 0, text: "标签", fontSize: 18 },
    { elementId: "text", shape: "text", x: 0, y: 0, text: "标签", tone: "focus" },
    { elementId: "line", shape: "polyline", points: [[0, 0], [1, 1]] },
    { elementId: "circle", shape: "circle", x: 0, y: 0, r: 2, fill: false },
    { elementId: "circle", shape: "circle", x: 0, y: 0, r: 2, strokeWidth: 9 },
  ];
  for (const primitive of unsupported) expect(() => Reflect.apply(compilePrimitiveSnapshot, undefined, [[primitive]])).toThrow();
});
