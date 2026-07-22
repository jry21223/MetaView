export const CONIC_EPSILON = 1e-9;

export interface Point2D {
  x: number;
  y: number;
}

export interface EllipseSpec {
  a: number;
  b: number;
  center?: Point2D;
  majorAxis?: "x" | "y";
}

export interface ParabolaSpec {
  p: number;
  vertex?: Point2D;
  axis?: "right" | "left" | "up" | "down";
}

export interface HyperbolaSpec {
  a: number;
  b: number;
  center?: Point2D;
  transverseAxis?: "x" | "y";
}

export type LineSpec =
  | { kind: "slope"; slope: number; intercept: number }
  | { kind: "vertical"; x: number };

export interface GeneralLine {
  A: number;
  B: number;
  C: number;
}

export interface ImplicitConic {
  xx: number;
  xy: number;
  yy: number;
  x: number;
  y: number;
  constant: number;
}

export interface IntersectionResult {
  status: "secant" | "tangent" | "disjoint";
  discriminant: number;
  points: Point2D[];
  tolerance: number;
}

export interface ChordResult {
  endpoints: readonly [Point2D, Point2D];
  midpoint: Point2D;
  length: number;
  line: GeneralLine;
}

function finitePositive(value: number, name: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${name} must be a finite positive number`);
  }
}

function finitePoint(point: Point2D, name: string): void {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
    throw new RangeError(`${name} must contain finite coordinates`);
  }
}

function centerOf(value?: Point2D): Point2D {
  const center = value ?? { x: 0, y: 0 };
  finitePoint(center, "center");
  return center;
}

export function validateEllipse(spec: EllipseSpec): Required<EllipseSpec> {
  finitePositive(spec.a, "ellipse a");
  finitePositive(spec.b, "ellipse b");
  if (spec.a <= spec.b) throw new RangeError("ellipse requires a > b > 0");
  return { ...spec, center: centerOf(spec.center), majorAxis: spec.majorAxis ?? "x" };
}

export function ellipseFoci(spec: EllipseSpec): readonly [Point2D, Point2D] {
  const value = validateEllipse(spec);
  const c = Math.sqrt(value.a * value.a - value.b * value.b);
  return value.majorAxis === "x"
    ? [{ x: value.center.x - c, y: value.center.y }, { x: value.center.x + c, y: value.center.y }]
    : [{ x: value.center.x, y: value.center.y - c }, { x: value.center.x, y: value.center.y + c }];
}

export function ellipseEccentricity(spec: EllipseSpec): number {
  const value = validateEllipse(spec);
  return Math.sqrt(value.a * value.a - value.b * value.b) / value.a;
}

export function ellipsePoint(spec: EllipseSpec, t: number): Point2D {
  const value = validateEllipse(spec);
  if (!Number.isFinite(t)) throw new RangeError("ellipse parameter t must be finite");
  const major = value.a * Math.cos(t);
  const minor = value.b * Math.sin(t);
  return value.majorAxis === "x"
    ? { x: value.center.x + major, y: value.center.y + minor }
    : { x: value.center.x + minor, y: value.center.y + major };
}

export function ellipseEquationValue(spec: EllipseSpec, point: Point2D): number {
  const value = validateEllipse(spec);
  finitePoint(point, "ellipse point");
  const dx = point.x - value.center.x;
  const dy = point.y - value.center.y;
  const major = value.majorAxis === "x" ? dx : dy;
  const minor = value.majorAxis === "x" ? dy : dx;
  return major * major / (value.a * value.a) + minor * minor / (value.b * value.b);
}

export function isPointOnEllipse(
  spec: EllipseSpec,
  point: Point2D,
  tolerance = CONIC_EPSILON,
): boolean {
  return Math.abs(ellipseEquationValue(spec, point) - 1) <= tolerance;
}

export function ellipseFocalDistanceSum(spec: EllipseSpec, point: Point2D): number {
  if (!isPointOnEllipse(spec, point, 1e-7)) throw new RangeError("point is not on ellipse");
  const [first, second] = ellipseFoci(spec);
  return distance(point, first) + distance(point, second);
}

export function validateParabola(spec: ParabolaSpec): Required<ParabolaSpec> {
  finitePositive(spec.p, "parabola p");
  return { ...spec, vertex: centerOf(spec.vertex), axis: spec.axis ?? "right" };
}

export function parabolaFocus(spec: ParabolaSpec): Point2D {
  const value = validateParabola(spec);
  const direction = value.axis === "left" || value.axis === "down" ? -1 : 1;
  return value.axis === "left" || value.axis === "right"
    ? { x: value.vertex.x + direction * value.p, y: value.vertex.y }
    : { x: value.vertex.x, y: value.vertex.y + direction * value.p };
}

export function parabolaDirectrix(spec: ParabolaSpec): GeneralLine {
  const value = validateParabola(spec);
  const direction = value.axis === "left" || value.axis === "down" ? -1 : 1;
  return value.axis === "left" || value.axis === "right"
    ? normalizeLine({ A: 1, B: 0, C: -(value.vertex.x - direction * value.p) })
    : normalizeLine({ A: 0, B: 1, C: -(value.vertex.y - direction * value.p) });
}

export function parabolaPoint(spec: ParabolaSpec, t: number): Point2D {
  const value = validateParabola(spec);
  if (!Number.isFinite(t)) throw new RangeError("parabola parameter t must be finite");
  const direction = value.axis === "left" || value.axis === "down" ? -1 : 1;
  const along = direction * value.p * t * t;
  const across = 2 * value.p * t;
  return value.axis === "left" || value.axis === "right"
    ? { x: value.vertex.x + along, y: value.vertex.y + across }
    : { x: value.vertex.x + across, y: value.vertex.y + along };
}

export function distanceToLine(point: Point2D, line: GeneralLine): number {
  finitePoint(point, "point");
  const denominator = Math.hypot(line.A, line.B);
  if (!Number.isFinite(denominator) || denominator <= CONIC_EPSILON) {
    throw new RangeError("line normal must be non-zero and finite");
  }
  return Math.abs(line.A * point.x + line.B * point.y + line.C) / denominator;
}

export function parabolaDefinitionDistances(
  spec: ParabolaSpec,
  point: Point2D,
): { focus: number; directrix: number } {
  return {
    focus: distance(point, parabolaFocus(spec)),
    directrix: distanceToLine(point, parabolaDirectrix(spec)),
  };
}

export function validateHyperbola(spec: HyperbolaSpec): Required<HyperbolaSpec> {
  finitePositive(spec.a, "hyperbola a");
  finitePositive(spec.b, "hyperbola b");
  return { ...spec, center: centerOf(spec.center), transverseAxis: spec.transverseAxis ?? "x" };
}

export function hyperbolaFoci(spec: HyperbolaSpec): readonly [Point2D, Point2D] {
  const value = validateHyperbola(spec);
  const c = Math.hypot(value.a, value.b);
  return value.transverseAxis === "x"
    ? [{ x: value.center.x - c, y: value.center.y }, { x: value.center.x + c, y: value.center.y }]
    : [{ x: value.center.x, y: value.center.y - c }, { x: value.center.x, y: value.center.y + c }];
}

export function hyperbolaEccentricity(spec: HyperbolaSpec): number {
  const value = validateHyperbola(spec);
  return Math.hypot(value.a, value.b) / value.a;
}

export function hyperbolaAsymptotes(spec: HyperbolaSpec): readonly [GeneralLine, GeneralLine] {
  const value = validateHyperbola(spec);
  const slope = value.transverseAxis === "x" ? value.b / value.a : value.a / value.b;
  return [slope, -slope].map((m) => normalizeLine({
    A: m,
    B: -1,
    C: value.center.y - m * value.center.x,
  })) as unknown as readonly [GeneralLine, GeneralLine];
}

export function hyperbolaPoint(spec: HyperbolaSpec, u: number, branch: -1 | 1 = 1): Point2D {
  const value = validateHyperbola(spec);
  if (!Number.isFinite(u)) throw new RangeError("hyperbola parameter must be finite");
  const major = branch * value.a * Math.cosh(u);
  const minor = value.b * Math.sinh(u);
  return value.transverseAxis === "x"
    ? { x: value.center.x + major, y: value.center.y + minor }
    : { x: value.center.x + minor, y: value.center.y + major };
}

export function hyperbolaFocalDistanceDifference(spec: HyperbolaSpec, point: Point2D): number {
  const [first, second] = hyperbolaFoci(spec);
  return Math.abs(distance(point, first) - distance(point, second));
}

export function lineToGeneral(line: LineSpec): GeneralLine {
  if (line.kind === "vertical") {
    if (!Number.isFinite(line.x)) throw new RangeError("vertical line x must be finite");
    return { A: 1, B: 0, C: -line.x };
  }
  if (!Number.isFinite(line.slope) || !Number.isFinite(line.intercept)) {
    throw new RangeError("slope line parameters must be finite");
  }
  return normalizeLine({ A: line.slope, B: -1, C: line.intercept });
}

export function normalizeLine(line: GeneralLine): GeneralLine {
  const norm = Math.hypot(line.A, line.B);
  if (!Number.isFinite(norm) || norm <= CONIC_EPSILON || !Number.isFinite(line.C)) {
    throw new RangeError("line coefficients must be finite with a non-zero normal");
  }
  const sign = line.A < -CONIC_EPSILON || (Math.abs(line.A) <= CONIC_EPSILON && line.B < 0) ? -1 : 1;
  return { A: sign * line.A / norm, B: sign * line.B / norm, C: sign * line.C / norm };
}

export function ellipseImplicit(spec: EllipseSpec): ImplicitConic {
  const value = validateEllipse(spec);
  const xDenominator = value.majorAxis === "x" ? value.a * value.a : value.b * value.b;
  const yDenominator = value.majorAxis === "x" ? value.b * value.b : value.a * value.a;
  const hx = value.center.x;
  const ky = value.center.y;
  return {
    xx: 1 / xDenominator,
    xy: 0,
    yy: 1 / yDenominator,
    x: -2 * hx / xDenominator,
    y: -2 * ky / yDenominator,
    constant: hx * hx / xDenominator + ky * ky / yDenominator - 1,
  };
}

function quadraticRoots(a: number, b: number, c: number, tolerance: number): number[] {
  if (Math.abs(a) <= tolerance) {
    return Math.abs(b) <= tolerance ? [] : [-c / b];
  }
  const discriminant = b * b - 4 * a * c;
  if (discriminant < -tolerance) return [];
  if (Math.abs(discriminant) <= tolerance) return [-b / (2 * a)];
  const root = Math.sqrt(Math.max(0, discriminant));
  const q = -0.5 * (b + Math.sign(b || 1) * root);
  const first = q / a;
  const second = c / q;
  return first <= second ? [first, second] : [second, first];
}

export function intersectLineConic(
  conic: ImplicitConic,
  line: LineSpec,
  relativeTolerance = CONIC_EPSILON,
): IntersectionResult {
  const coefficients = Object.values(conic);
  if (coefficients.some((value) => !Number.isFinite(value))) {
    throw new RangeError("conic coefficients must be finite");
  }
  let qa: number;
  let qb: number;
  let qc: number;
  let pointFromRoot: (root: number) => Point2D;
  if (line.kind === "vertical") {
    if (!Number.isFinite(line.x)) throw new RangeError("vertical line x must be finite");
    const x = line.x;
    qa = conic.yy;
    qb = conic.xy * x + conic.y;
    qc = conic.xx * x * x + conic.x * x + conic.constant;
    pointFromRoot = (y) => ({ x, y });
  } else {
    if (!Number.isFinite(line.slope) || !Number.isFinite(line.intercept)) {
      throw new RangeError("slope line parameters must be finite");
    }
    const m = line.slope;
    const q = line.intercept;
    qa = conic.xx + conic.xy * m + conic.yy * m * m;
    qb = conic.xy * q + 2 * conic.yy * m * q + conic.x + conic.y * m;
    qc = conic.yy * q * q + conic.y * q + conic.constant;
    pointFromRoot = (x) => ({ x, y: m * x + q });
  }
  const discriminant = qb * qb - 4 * qa * qc;
  const scale = Math.max(1, Math.abs(qb * qb), Math.abs(4 * qa * qc));
  const tolerance = Math.max(CONIC_EPSILON, Math.abs(relativeTolerance)) * scale;
  const points = quadraticRoots(qa, qb, qc, tolerance).map(pointFromRoot);
  return {
    status: discriminant < -tolerance ? "disjoint" : Math.abs(discriminant) <= tolerance ? "tangent" : "secant",
    discriminant,
    points,
    tolerance,
  };
}

export function chordFromIntersection(line: LineSpec, result: IntersectionResult): ChordResult {
  if (result.status !== "secant" || result.points.length !== 2) {
    throw new RangeError("a chord requires two distinct real intersection points");
  }
  const [first, second] = result.points;
  return {
    endpoints: [first, second],
    midpoint: { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 },
    length: distance(first, second),
    line: lineToGeneral(line),
  };
}

export function sampleEllipseChordMidpoints(
  ellipse: EllipseSpec,
  buildLine: (parameter: number) => LineSpec,
  parameters: readonly number[],
): Array<{ parameter: number; chord: ChordResult }> {
  const conic = ellipseImplicit(ellipse);
  return parameters.flatMap((parameter) => {
    if (!Number.isFinite(parameter)) return [];
    const line = buildLine(parameter);
    const intersection = intersectLineConic(conic, line);
    return intersection.status === "secant"
      ? [{ parameter, chord: chordFromIntersection(line, intersection) }]
      : [];
  });
}

function ellipseLocal(spec: Required<EllipseSpec>, point: Point2D): Point2D {
  const dx = point.x - spec.center.x;
  const dy = point.y - spec.center.y;
  return spec.majorAxis === "x" ? { x: dx, y: dy } : { x: dy, y: dx };
}

function ellipseWorld(spec: Required<EllipseSpec>, point: Point2D): Point2D {
  return spec.majorAxis === "x"
    ? { x: spec.center.x + point.x, y: spec.center.y + point.y }
    : { x: spec.center.x + point.y, y: spec.center.y + point.x };
}

export function ellipseTangent(spec: EllipseSpec, point: Point2D): GeneralLine {
  const value = validateEllipse(spec);
  if (!isPointOnEllipse(value, point, 1e-7)) throw new RangeError("tangent point is not on ellipse");
  const local = ellipseLocal(value, point);
  const localLine = {
    A: local.x / (value.a * value.a),
    B: local.y / (value.b * value.b),
    C: -1,
  };
  return value.majorAxis === "x"
    ? normalizeLine({
      A: localLine.A,
      B: localLine.B,
      C: localLine.C - localLine.A * value.center.x - localLine.B * value.center.y,
    })
    : normalizeLine({
      A: localLine.B,
      B: localLine.A,
      C: localLine.C - localLine.B * value.center.x - localLine.A * value.center.y,
    });
}

export function ellipseTangentPoints(
  spec: EllipseSpec,
  externalPoint: Point2D,
): readonly [Point2D, Point2D] {
  const value = validateEllipse(spec);
  finitePoint(externalPoint, "external point");
  const local = ellipseLocal(value, externalPoint);
  const u = local.x / value.a;
  const v = local.y / value.b;
  const squared = u * u + v * v;
  if (squared <= 1 + CONIC_EPSILON) {
    throw new RangeError("external point must lie strictly outside the ellipse");
  }
  const scale = Math.sqrt(squared - 1) / squared;
  const base = { x: u / squared, y: v / squared };
  const offset = { x: -v * scale, y: u * scale };
  const first = ellipseWorld(value, {
    x: value.a * (base.x + offset.x),
    y: value.b * (base.y + offset.y),
  });
  const second = ellipseWorld(value, {
    x: value.a * (base.x - offset.x),
    y: value.b * (base.y - offset.y),
  });
  return [first, second];
}

export function circlePolarLine(
  center: Point2D,
  radius: number,
  pole: Point2D,
): GeneralLine {
  finitePoint(center, "circle center");
  finitePoint(pole, "pole");
  finitePositive(radius, "circle radius");
  const dx = pole.x - center.x;
  const dy = pole.y - center.y;
  if (dx * dx + dy * dy <= radius * radius + CONIC_EPSILON) {
    throw new RangeError("pole must lie strictly outside the circle");
  }
  return normalizeLine({
    A: dx,
    B: dy,
    C: -(radius * radius + dx * center.x + dy * center.y),
  });
}

export function circleTangentPoints(
  center: Point2D,
  radius: number,
  pole: Point2D,
): readonly [Point2D, Point2D] {
  finitePoint(center, "circle center");
  finitePoint(pole, "pole");
  finitePositive(radius, "circle radius");
  const dx = pole.x - center.x;
  const dy = pole.y - center.y;
  const squaredDistance = dx * dx + dy * dy;
  if (squaredDistance <= radius * radius + CONIC_EPSILON) {
    throw new RangeError("pole must lie strictly outside the circle");
  }
  const baseScale = radius * radius / squaredDistance;
  const offsetScale = radius * Math.sqrt(squaredDistance - radius * radius)
    / squaredDistance;
  const base = {
    x: center.x + baseScale * dx,
    y: center.y + baseScale * dy,
  };
  const offset = { x: -offsetScale * dy, y: offsetScale * dx };
  return [
    { x: base.x + offset.x, y: base.y + offset.y },
    { x: base.x - offset.x, y: base.y - offset.y },
  ];
}

export function lineValue(line: GeneralLine, point: Point2D): number {
  return line.A * point.x + line.B * point.y + line.C;
}

export function distance(first: Point2D, second: Point2D): number {
  finitePoint(first, "first point");
  finitePoint(second, "second point");
  return Math.hypot(first.x - second.x, first.y - second.y);
}
