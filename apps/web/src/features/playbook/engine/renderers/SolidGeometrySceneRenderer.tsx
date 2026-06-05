import React from "react";
import "katex/dist/katex.min.css";
import { clamp01 } from "../foundation";
import { sanitizeKatex } from "../../../../shared/lib/sanitizeKatex";
import type {
  SolidGeometryEdge,
  SolidGeometryPlane,
  SolidGeometryPoint,
  SolidGeometrySceneSnapshot,
  SolidGeometryVector,
} from "../types";
import type { RendererProps } from "./types";

type Point3 = [number, number, number];
type Point2 = [number, number];
type Emphasis = "primary" | "secondary" | "muted" | "accent";

const VIEW_WIDTH = 960;
const VIEW_HEIGHT = 540;
const MARGIN = 64;
const EMPTY_POINTS: SolidGeometryPoint[] = [];
const EMPTY_VECTORS: SolidGeometryVector[] = [];

const PALETTE: Record<"dark" | "light", Record<"bg" | Emphasis | "text" | "grid", string>> = {
  dark: {
    bg: "#111318",
    primary: "#66d9e8",
    secondary: "#9aa7b7",
    muted: "rgba(154,167,183,0.45)",
    accent: "#ffcf5a",
    text: "#edf2f7",
    grid: "rgba(255,255,255,0.08)",
  },
  light: {
    bg: "#f7f8fb",
    primary: "#167a8b",
    secondary: "#556274",
    muted: "rgba(85,98,116,0.4)",
    accent: "#b26b00",
    text: "#151923",
    grid: "rgba(0,0,0,0.08)",
  },
};

interface ProjectedScene {
  points: Map<string, Point2>;
  project: (point: Point3) => Point2;
}

function rawProject([x, y, z]: Point3): Point2 {
  const isoX = (x - y) * 0.8660254038;
  const isoY = (x + y) * 0.5 - z;
  return [isoX, isoY];
}

function finitePoint(point: unknown): point is Point3 {
  return (
    Array.isArray(point)
    && point.length === 3
    && point.every((coord) => typeof coord === "number" && Number.isFinite(coord))
  );
}

function pointMap(points: SolidGeometryPoint[]): Map<string, Point3> {
  const out = new Map<string, Point3>();
  for (const point of points) {
    if (point.label && finitePoint(point.position)) {
      out.set(point.label, point.position);
    }
  }
  return out;
}

function vectorTip(vector: SolidGeometryVector, points: Map<string, Point3>): Point3 | null {
  const start = points.get(vector.start);
  if (!start) return null;
  if (vector.end) {
    return points.get(vector.end) ?? null;
  }
  const direction = vector.direction;
  if (!finitePoint(direction)) return null;
  return [
    start[0] + direction[0],
    start[1] + direction[1],
    start[2] + direction[2],
  ];
}

function buildProjection(
  points: SolidGeometryPoint[],
  vectors: SolidGeometryVector[],
): ProjectedScene {
  const byLabel = pointMap(points);
  const rawPoints: Point2[] = [...byLabel.values()].map(rawProject);
  for (const vector of vectors) {
    const tip = vectorTip(vector, byLabel);
    if (tip) rawPoints.push(rawProject(tip));
  }

  const xs = rawPoints.map(([x]) => x);
  const ys = rawPoints.map(([, y]) => y);
  const minX = Math.min(...xs, -1);
  const maxX = Math.max(...xs, 1);
  const minY = Math.min(...ys, -1);
  const maxY = Math.max(...ys, 1);
  const spanX = Math.max(maxX - minX, 0.001);
  const spanY = Math.max(maxY - minY, 0.001);
  const scale = Math.min(
    (VIEW_WIDTH - MARGIN * 2) / spanX,
    (VIEW_HEIGHT - MARGIN * 2) / spanY,
  );
  const xPad = (VIEW_WIDTH - spanX * scale) / 2;
  const yPad = (VIEW_HEIGHT - spanY * scale) / 2;

  const project = (point: Point3): Point2 => {
    const [x, y] = rawProject(point);
    return [
      xPad + (x - minX) * scale,
      VIEW_HEIGHT - (yPad + (y - minY) * scale),
    ];
  };

  return {
    points: new Map([...byLabel.entries()].map(([label, point]) => [label, project(point)])),
    project,
  };
}

function activeSet(
  visibleElements: string[] | undefined,
  focusTarget: string | null | undefined,
): Set<string> {
  const ids = new Set(visibleElements ?? []);
  if (focusTarget) ids.add(focusTarget);
  return ids;
}

function emphasized(
  emphasis: Emphasis | undefined,
  ids: string[],
  active: Set<string>,
): Emphasis {
  if (ids.some((id) => active.has(id))) return "accent";
  return emphasis ?? "secondary";
}

function edgeIds(edge: SolidGeometryEdge): string[] {
  return [
    `edge:${edge.start}${edge.end}`,
    `edge:${edge.end}${edge.start}`,
    `line:${edge.start}${edge.end}`,
    `line:${edge.end}${edge.start}`,
  ];
}

function planeIds(plane: SolidGeometryPlane): string[] {
  return [
    `plane:${plane.id}`,
    `plane:${plane.vertices.join("")}`,
  ];
}

function vectorIds(vector: SolidGeometryVector): string[] {
  const ids = [vector.id];
  if (vector.end) {
    ids.push(`line:${vector.start}${vector.end}`, `line:${vector.end}${vector.start}`);
  }
  return ids;
}

function styleColor(theme: "dark" | "light", emphasis: Emphasis): string {
  return PALETTE[theme][emphasis];
}

function Formula({ latex }: { latex: string }) {
  const html = React.useMemo(() => sanitizeKatex(latex, { displayMode: false }) || null, [latex]);
  if (!html) return null;
  return (
    <div
      className="solid-geometry-scene__formula"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

function PlaneLayer({
  planes,
  projected,
  active,
  theme,
}: {
  planes: SolidGeometryPlane[];
  projected: ProjectedScene;
  active: Set<string>;
  theme: "dark" | "light";
}) {
  return (
    <>
      {planes.map((plane) => {
        const vertices = plane.vertices
          .map((label) => projected.points.get(label))
          .filter((point): point is Point2 => point != null);
        if (vertices.length < 3) return null;
        const emphasis = emphasized(plane.emphasis, planeIds(plane), active);
        const color = styleColor(theme, emphasis);
        return (
          <polygon
            key={plane.id}
            className="solid-geometry-scene__plane"
            data-solid-id={`plane:${plane.id}`}
            data-emphasis={emphasis}
            data-highlight={emphasis === "accent" ? "true" : "false"}
            points={vertices.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(" ")}
            fill={color}
            fillOpacity={emphasis === "accent" ? 0.22 : 0.12}
            stroke={color}
            strokeOpacity={0.7}
            strokeWidth={2}
          />
        );
      })}
    </>
  );
}

function EdgeLayer({
  edges,
  projected,
  active,
  theme,
  progress,
}: {
  edges: SolidGeometryEdge[];
  projected: ProjectedScene;
  active: Set<string>;
  theme: "dark" | "light";
  progress: number;
}) {
  return (
    <>
      {edges.map((edge) => {
        const start = projected.points.get(edge.start);
        const end = projected.points.get(edge.end);
        if (!start || !end) return null;
        const emphasis = emphasized(edge.emphasis, edgeIds(edge), active);
        const color = styleColor(theme, emphasis);
        const tip: Point2 = [
          start[0] + (end[0] - start[0]) * progress,
          start[1] + (end[1] - start[1]) * progress,
        ];
        return (
          <line
            key={`${edge.start}-${edge.end}`}
            className="solid-geometry-scene__edge"
            data-solid-id={`line:${edge.start}${edge.end}`}
            data-emphasis={emphasis}
            data-highlight={emphasis === "accent" ? "true" : "false"}
            x1={start[0]}
            y1={start[1]}
            x2={tip[0]}
            y2={tip[1]}
            stroke={color}
            strokeWidth={emphasis === "accent" ? 4 : 2.5}
            strokeLinecap="round"
          />
        );
      })}
    </>
  );
}

function VectorLayer({
  vectors,
  pointPositions,
  projected,
  active,
  theme,
}: {
  vectors: SolidGeometryVector[];
  pointPositions: Map<string, Point3>;
  projected: ProjectedScene;
  active: Set<string>;
  theme: "dark" | "light";
}) {
  return (
    <>
      {vectors.map((vector) => {
        const start3 = pointPositions.get(vector.start);
        const tip3 = vectorTip(vector, pointPositions);
        if (!start3 || !tip3) return null;
        const start = projected.project(start3);
        const end = projected.project(tip3);
        const emphasis = emphasized(vector.emphasis, vectorIds(vector), active);
        const color = styleColor(theme, emphasis);
        return (
          <g key={vector.id} className="solid-geometry-scene__vector">
            <line
              data-solid-id={vector.id}
              data-emphasis={emphasis}
              data-highlight={emphasis === "accent" ? "true" : "false"}
              x1={start[0]}
              y1={start[1]}
              x2={end[0]}
              y2={end[1]}
              stroke={color}
              strokeWidth={emphasis === "accent" ? 4 : 2.5}
              markerEnd="url(#solid-geometry-arrow)"
              strokeLinecap="round"
            />
            {vector.label && (
              <text
                x={(start[0] + end[0]) / 2 + 10}
                y={(start[1] + end[1]) / 2 - 8}
                fill={color}
                fontSize={22}
                fontWeight={700}
              >
                {vector.label}
              </text>
            )}
          </g>
        );
      })}
    </>
  );
}

function PointLayer({
  points,
  projected,
  active,
  theme,
}: {
  points: SolidGeometryPoint[];
  projected: ProjectedScene;
  active: Set<string>;
  theme: "dark" | "light";
}) {
  return (
    <>
      {points.map((point) => {
        const position = projected.points.get(point.label);
        if (!position) return null;
        const isActive = active.has(`point:${point.label}`) || active.has(point.label);
        const color = isActive ? styleColor(theme, "accent") : styleColor(theme, "primary");
        return (
          <g key={point.label} className="solid-geometry-scene__point" data-solid-id={`point:${point.label}`}>
            <circle
              cx={position[0]}
              cy={position[1]}
              r={isActive ? 7 : 5}
              fill={color}
              stroke={PALETTE[theme].bg}
              strokeWidth={2}
            />
            <text
              x={position[0] + 10}
              y={position[1] - 10}
              fill={PALETTE[theme].text}
              fontSize={22}
              fontWeight={700}
            >
              {point.label}
            </text>
          </g>
        );
      })}
    </>
  );
}

export const SolidGeometrySceneRenderer: React.FC<RendererProps> = (props) => {
  const { step, frame, stepStartFrame, progress, theme } = props;
  const snap = step.snapshot as SolidGeometrySceneSnapshot;
  const points = snap.points ?? EMPTY_POINTS;
  const vectors = snap.vectors ?? EMPTY_VECTORS;
  const pointPositions = React.useMemo(() => pointMap(points), [points]);
  const projected = React.useMemo(
    () => buildProjection(points, vectors),
    [points, vectors],
  );
  const focusTarget = props.directorFrame?.activeBeat?.focus_target ?? snap.focus_target;
  const active = React.useMemo(
    () => activeSet(snap.visible_elements, focusTarget),
    [focusTarget, snap.visible_elements],
  );
  const elapsed = Math.max(0, frame - stepStartFrame);
  const titleOpacity = clamp01(elapsed / 8);
  const drawProgress = clamp01(progress);
  const formula = snap.formula_latex?.trim();
  const caption = snap.caption?.trim();

  return (
    <div className="solid-geometry-scene" data-theme={theme} data-focus-target={snap.focus_target ?? ""}>
      <div className="solid-geometry-scene__title" style={{ opacity: titleOpacity }}>
        {step.title}
      </div>
      <svg
        className="solid-geometry-scene__svg"
        viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
        role="img"
        aria-label={step.title}
      >
        <defs>
          <pattern id="solid-geometry-grid" width="40" height="40" patternUnits="userSpaceOnUse">
            <path
              d="M 40 0 L 0 0 0 40"
              fill="none"
              stroke={PALETTE[theme].grid}
              strokeWidth="1"
            />
          </pattern>
          <marker
            id="solid-geometry-arrow"
            viewBox="0 0 10 10"
            refX="8"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill={styleColor(theme, "accent")} />
          </marker>
        </defs>
        <rect width={VIEW_WIDTH} height={VIEW_HEIGHT} rx="0" fill={PALETTE[theme].bg} />
        <rect width={VIEW_WIDTH} height={VIEW_HEIGHT} fill="url(#solid-geometry-grid)" />
        <PlaneLayer planes={snap.planes ?? []} projected={projected} active={active} theme={theme} />
        <EdgeLayer
          edges={snap.edges ?? []}
          projected={projected}
          active={active}
          theme={theme}
          progress={drawProgress}
        />
        <VectorLayer
          vectors={vectors}
          pointPositions={pointPositions}
          projected={projected}
          active={active}
          theme={theme}
        />
        <PointLayer points={points} projected={projected} active={active} theme={theme} />
      </svg>
      {formula && <Formula latex={formula} />}
      {caption && <div className="solid-geometry-scene__caption">{caption}</div>}
    </div>
  );
};
