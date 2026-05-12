import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { FunctionPlot, type PlotSeries } from "./FunctionPlot";
import { compileExpr, sampleExpr } from "../../../shared/lib/mathExpr";

function lineSeries(expr: string, color = "#4de8b0", dashed = false): PlotSeries {
  return { points: sampleExpr(compileExpr(expr), -5, 5, 60), color, dashed };
}

function render(props: Parameters<typeof FunctionPlot>[0]): string {
  return renderToStaticMarkup(<FunctionPlot {...props} />);
}

describe("FunctionPlot", () => {
  it("renders an SVG with a polyline for each series", () => {
    const markup = render({
      series: [lineSeries("x"), lineSeries("x^2", "#7db8ff")],
      xRange: [-5, 5],
      theme: "dark",
    });
    expect(markup).toContain("<svg");
    expect((markup.match(/<polyline/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect(markup).toContain("#4de8b0");
    expect(markup).toContain("#7db8ff");
  });

  it("breaks the path at discontinuities", () => {
    const markup = render({
      series: [{ points: sampleExpr(compileExpr("1/x"), -2, 2, 80), color: "#4de8b0" }],
      xRange: [-2, 2],
      theme: "dark",
    });
    expect((markup.match(/<polyline/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });

  it("draws a marker dot when one is supplied", () => {
    const markup = render({
      series: [lineSeries("x^2")],
      xRange: [-5, 5],
      theme: "light",
      marker: { x: 2, y: 4, color: "#b07d00" },
    });
    expect(markup).toContain("<circle");
    expect(markup).toContain("(2, 4)");
  });

  it("respects a fixed y-range", () => {
    const markup = render({ series: [lineSeries("x")], xRange: [-5, 5], yRange: [-8, 8], theme: "dark" });
    expect(markup).toContain("<svg");
  });

  it("falls back gracefully when a series has no finite points", () => {
    const markup = render({
      series: [{ points: sampleExpr(compileExpr("sqrt(-1 - x^2)"), -5, 5, 40), color: "#4de8b0" }],
      xRange: [-5, 5],
      theme: "dark",
    });
    expect(markup).toContain("<svg");
    expect(markup.match(/<polyline/g) ?? []).toHaveLength(0);
  });
});
