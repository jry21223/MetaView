import { describe, expect, it } from "vitest";

import {
  chordFromIntersection,
  circlePolarLine,
  circleTangentPoints,
  distance,
  ellipseEccentricity,
  ellipseFocalDistanceSum,
  ellipseFoci,
  ellipseImplicit,
  ellipsePoint,
  ellipseTangent,
  ellipseTangentPoints,
  hyperbolaAsymptotes,
  hyperbolaEccentricity,
  hyperbolaFocalDistanceDifference,
  hyperbolaPoint,
  intersectLineConic,
  lineValue,
  parabolaDefinitionDistances,
  parabolaDirectrix,
  parabolaFocus,
  parabolaPoint,
  sampleEllipseChordMidpoints,
  validateEllipse,
} from "./conicSections";

describe("conic section deterministic kernel", () => {
  it("validates an ellipse and preserves the focal-distance definition", () => {
    const ellipse = { a: 5, b: 3 } as const;
    expect(ellipseFoci(ellipse)).toEqual([{ x: -4, y: 0 }, { x: 4, y: 0 }]);
    expect(ellipseEccentricity(ellipse)).toBeCloseTo(0.8, 12);
    expect(ellipseFocalDistanceSum(ellipse, ellipsePoint(ellipse, 1.234))).toBeCloseTo(10, 10);
    expect(() => validateEllipse({ a: 3, b: 3 })).toThrow("a > b > 0");
  });

  it("preserves the focus-directrix definition for all standard parabola axes", () => {
    for (const axis of ["right", "left", "up", "down"] as const) {
      const spec = { p: 1.5, axis, vertex: { x: 2, y: -1 } };
      const point = parabolaPoint(spec, 1.2);
      const values = parabolaDefinitionDistances(spec, point);
      expect(values.focus).toBeCloseTo(values.directrix, 10);
      expect(Number.isFinite(parabolaFocus(spec).x)).toBe(true);
      expect(Math.hypot(parabolaDirectrix(spec).A, parabolaDirectrix(spec).B)).toBeCloseTo(1, 12);
    }
  });

  it("computes hyperbola foci, eccentricity, asymptotes, and focal difference", () => {
    const spec = { a: 3, b: 4 } as const;
    expect(hyperbolaEccentricity(spec)).toBeCloseTo(5 / 3, 12);
    const [up, down] = hyperbolaAsymptotes(spec);
    expect(up.A / -up.B).toBeCloseTo(4 / 3, 12);
    expect(down.A / -down.B).toBeCloseTo(-4 / 3, 12);
    expect(hyperbolaFocalDistanceDifference(spec, hyperbolaPoint(spec, 1.1))).toBeCloseTo(6, 10);
  });

  it("classifies secant, tangent, disjoint, vertical, and near-tangent lines", () => {
    const ellipse = ellipseImplicit({ a: 5, b: 3 });
    const secant = intersectLineConic(ellipse, { kind: "slope", slope: 0, intercept: 0 });
    const tangent = intersectLineConic(ellipse, { kind: "slope", slope: 0, intercept: 3 });
    const disjoint = intersectLineConic(ellipse, { kind: "slope", slope: 0, intercept: 3.1 });
    const vertical = intersectLineConic(ellipse, { kind: "vertical", x: 4 });
    const nearTangent = intersectLineConic(
      ellipse,
      { kind: "slope", slope: 0, intercept: 3 + 1e-12 },
      1e-9,
    );

    expect(secant.status).toBe("secant");
    expect(secant.points).toEqual([{ x: -5, y: 0 }, { x: 5, y: 0 }]);
    expect(tangent.status).toBe("tangent");
    expect(tangent.points).toHaveLength(1);
    expect(disjoint.status).toBe("disjoint");
    expect(vertical.status).toBe("secant");
    expect(vertical.points[0].y).toBeLessThan(vertical.points[1].y);
    expect(nearTangent.status).toBe("tangent");
  });

  it("computes chord length, midpoint, and filters invalid locus samples", () => {
    const ellipse = { a: 5, b: 3 } as const;
    const intersection = intersectLineConic(
      ellipseImplicit(ellipse),
      { kind: "slope", slope: 0, intercept: 1 },
    );
    const chord = chordFromIntersection({ kind: "slope", slope: 0, intercept: 1 }, intersection);
    expect(chord.midpoint).toEqual({ x: 0, y: 1 });
    expect(chord.length).toBeCloseTo(10 * Math.sqrt(8 / 9), 10);
    const samples = sampleEllipseChordMidpoints(
      ellipse,
      (intercept) => ({ kind: "slope", slope: 0, intercept }),
      [-4, -2, 0, 2, 4],
    );
    expect(samples.map((item) => item.parameter)).toEqual([-2, 0, 2]);
  });

  it("computes ellipse tangents and two real tangent points", () => {
    const ellipse = { a: 5, b: 3 } as const;
    const point = ellipsePoint(ellipse, 0.7);
    expect(lineValue(ellipseTangent(ellipse, point), point)).toBeCloseTo(0, 10);
    const pole = { x: 8, y: 2 };
    const tangentPoints = ellipseTangentPoints(ellipse, pole);
    for (const tangentPoint of tangentPoints) {
      expect(lineValue(ellipseTangent(ellipse, tangentPoint), pole)).toBeCloseTo(0, 10);
    }
    expect(distance(tangentPoints[0], tangentPoints[1])).toBeGreaterThan(0);
    expect(() => ellipseTangentPoints(ellipse, { x: 0, y: 0 })).toThrow("strictly outside");
  });

  it("computes a circle polar and rejects a pole on or inside the circle", () => {
    const line = circlePolarLine({ x: 0, y: 0 }, 5, { x: 5, y: 5 });
    expect(lineValue(line, { x: 2.5, y: 2.5 })).toBeCloseTo(0, 12);
    const tangentPoints = circleTangentPoints({ x: 0, y: 0 }, 5, { x: 5, y: 5 });
    for (const tangentPoint of tangentPoints) {
      expect(distance(tangentPoint, { x: 0, y: 0 })).toBeCloseTo(5, 12);
      const radius = tangentPoint;
      const tangent = { x: 5 - tangentPoint.x, y: 5 - tangentPoint.y };
      expect(radius.x * tangent.x + radius.y * tangent.y).toBeCloseTo(0, 12);
      expect(lineValue(line, tangentPoint)).toBeCloseTo(0, 12);
    }
    expect(() => circlePolarLine({ x: 0, y: 0 }, 5, { x: 3, y: 4 })).toThrow("strictly outside");
    expect(() => circleTangentPoints({ x: 0, y: 0 }, 5, { x: 3, y: 4 })).toThrow(
      "strictly outside",
    );
  });
});
