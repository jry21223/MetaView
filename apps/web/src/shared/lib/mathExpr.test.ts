import { describe, expect, it } from "vitest";
import {
  compileExpr,
  evalExpr,
  isValidExpr,
  MathExprError,
  sampleExpr,
} from "./mathExpr";

describe("mathExpr — evaluation", () => {
  it("evaluates arithmetic with precedence", () => {
    expect(evalExpr("1 + 2 * 3")).toBe(7);
    expect(evalExpr("(1 + 2) * 3")).toBe(9);
    expect(evalExpr("10 - 4 - 3")).toBe(3); // left-assoc
    expect(evalExpr("8 / 2 / 2")).toBe(2);
    expect(evalExpr("7 % 3")).toBe(1);
  });

  it("handles unary minus and plus", () => {
    expect(evalExpr("-5")).toBe(-5);
    expect(evalExpr("-(2 + 3)")).toBe(-5);
    expect(evalExpr("3 - -2")).toBe(5);
    expect(evalExpr("+4")).toBe(4);
  });

  it("treats ^ as right-associative power", () => {
    expect(evalExpr("2 ^ 3")).toBe(8);
    expect(evalExpr("2 ^ 3 ^ 2")).toBe(512); // 2^(3^2)
    expect(evalExpr("-2 ^ 2")).toBe(4); // unary binds tighter than this impl: -(2)^2 -> (-2)^2
  });

  it("resolves constants and variables", () => {
    expect(evalExpr("pi")).toBeCloseTo(Math.PI);
    expect(evalExpr("tau")).toBeCloseTo(Math.PI * 2);
    expect(evalExpr("e")).toBeCloseTo(Math.E);
    expect(evalExpr("x * 2", { x: 21 })).toBe(42);
    expect(evalExpr("a * x + b", { a: 3, x: 4, b: 1 })).toBe(13);
  });

  it("supports math functions", () => {
    expect(evalExpr("sin(0)")).toBe(0);
    expect(evalExpr("cos(0)")).toBe(1);
    expect(evalExpr("sqrt(16)")).toBe(4);
    expect(evalExpr("abs(-3)")).toBe(3);
    expect(evalExpr("ln(e)")).toBeCloseTo(1);
    expect(evalExpr("log10(1000)")).toBeCloseTo(3);
    expect(evalExpr("max(1, 9, 4)")).toBe(9);
    expect(evalExpr("pow(2, 10)")).toBe(1024);
    expect(evalExpr("hypot(3, 4)")).toBe(5);
  });

  it("composes functions and operators", () => {
    expect(evalExpr("sin(pi / 2)")).toBeCloseTo(1);
    expect(evalExpr("2 * sin(x) + 1", { x: 0 })).toBe(1);
    expect(evalExpr("sqrt(x^2 + 1)", { x: 0 })).toBe(1);
  });
});

describe("mathExpr — errors", () => {
  it("throws MathExprError on malformed input via compileExpr", () => {
    expect(() => compileExpr("")).toThrow(MathExprError);
    expect(() => compileExpr("1 +")).toThrow(MathExprError);
    expect(() => compileExpr("(1 + 2")).toThrow(MathExprError);
    expect(() => compileExpr("sin(")).toThrow(MathExprError);
    expect(() => compileExpr("foo(1)")).toThrow(MathExprError);
    expect(() => compileExpr("2 @ 3")).toThrow(MathExprError);
    expect(() => compileExpr("1 2")).toThrow(MathExprError);
  });

  it("evalExpr returns NaN on malformed input", () => {
    expect(evalExpr("1 +")).toBeNaN();
    expect(evalExpr("nope")).toBeNaN();
  });

  it("evaluating an unknown variable throws through compiled closure", () => {
    const fn = compileExpr("y + 1");
    expect(() => fn({})).toThrow(MathExprError);
    expect(fn({ y: 9 })).toBe(10);
  });

  it("isValidExpr reflects parseability", () => {
    expect(isValidExpr("x^2 + 1")).toBe(true);
    expect(isValidExpr("sin(x")).toBe(false);
  });
});

describe("mathExpr — sampling", () => {
  it("samples steps+1 evenly spaced points", () => {
    const pts = sampleExpr(compileExpr("x"), 0, 10, 10);
    expect(pts).toHaveLength(11);
    expect(pts[0]).toEqual({ x: 0, y: 0 });
    expect(pts[10]).toEqual({ x: 10, y: 10 });
    expect(pts[5]).toEqual({ x: 5, y: 5 });
  });

  it("marks non-finite results as NaN so paths can break", () => {
    const pts = sampleExpr(compileExpr("1 / x"), -1, 1, 2); // hits x=0 in the middle
    expect(pts[1].x).toBe(0);
    expect(pts[1].y).toBeNaN();
    expect(pts[0].y).toBe(-1);
    expect(pts[2].y).toBe(1);
  });

  it("threads extra scope (parameters) into every sample", () => {
    const pts = sampleExpr(compileExpr("a * x"), 0, 4, 4, { a: 3 });
    expect(pts.map((p) => p.y)).toEqual([0, 3, 6, 9, 12]);
  });

  it("handles a reversed range gracefully", () => {
    const pts = sampleExpr(compileExpr("x"), 10, 0, 5);
    expect(pts[0].x).toBe(0);
    expect(pts[pts.length - 1].x).toBe(10);
  });
});
