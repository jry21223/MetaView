import React from "react";

import type {
  PhysicsForceSceneSnapshot,
  PhysicsSceneObject,
  PhysicsScenePoint,
  PhysicsSceneSpring,
  PhysicsSceneTrajectory,
  PhysicsSceneVector,
} from "../types";
import { CoreFormulaTag } from "./CoreFormulaTag";
import { CoreLabGrid } from "./CoreLabGrid";
import { physicsVisualColor } from "./physicsVisualPalette";
import type { RendererProps } from "./types";
import { THEME_PALETTE } from "../../../../shared/config/themePalette";

function objectById(objects: PhysicsSceneObject[], id: string): PhysicsSceneObject | undefined {
  return objects.find((object) => object.id === id);
}

function physicsPalette(theme: "dark" | "light") {
  const palette = THEME_PALETTE[theme];
  const surface = theme === "dark" ? "#111715" : "#ffffff";
  return {
    bg: `var(--surface-2, ${palette.surface2})`,
    surface: `var(--surface, ${surface})`,
    ink: `var(--ink, ${palette.ink})`,
    muted: `var(--ink-2, ${palette.ink2})`,
    line: `var(--line-2, ${palette.line2})`,
    axis: `var(--canvas-axis, ${palette.canvasAxis})`,
    accent: `var(--accent, ${palette.accent})`,
    trajectory: physicsVisualColor("trajectory", theme),
    velocity: physicsVisualColor("velocity", theme),
    acceleration: physicsVisualColor("acceleration", theme),
    force: physicsVisualColor("force", theme),
  } as const;
}

type PhysicsColors = ReturnType<typeof physicsPalette>;

function vectorColor(role: string, colors: PhysicsColors): string {
  if (role === "force") return colors.force;
  if (role === "acceleration") return colors.acceleration;
  if (role === "velocity") return colors.velocity;
  return colors.axis;
}

function emphasisColor(emphasis: string | undefined, colors: PhysicsColors): string {
  if (emphasis === "accent") return colors.accent;
  if (emphasis === "secondary") return colors.muted;
  return colors.trajectory;
}

function vectorComponent(vector: PhysicsSceneVector): "horizontal" | "vertical" | "diagonal" {
  if (Math.abs(vector.dy) < 0.001) return "horizontal";
  if (Math.abs(vector.dx) < 0.001) return "vertical";
  return "diagonal";
}

function trajectoryPath(points: Array<[number, number]>, progress: number): string {
  if (points.length === 0) return "";
  const count = Math.max(1, Math.ceil(points.length * Math.max(0, Math.min(1, progress))));
  return points.slice(0, count).map(([x, y], index) => `${index === 0 ? "M" : "L"} ${x} ${y}`).join(" ");
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Zig-zag coil path with short straight leads at both anchors. */
function springPath(spring: PhysicsSceneSpring): string {
  const coils = Math.max(3, Math.round(spring.coils ?? 8));
  const dx = spring.x1 - spring.x0;
  const dy = spring.y1 - spring.y0;
  const length = Math.hypot(dx, dy);
  if (length < 1e-6) return "";
  const ux = dx / length;
  const uy = dy / length;
  // Perpendicular unit vector for the zig-zag amplitude.
  const px = -uy;
  const py = ux;
  const lead = Math.min(3.2, length * 0.12);
  const amplitude = Math.min(3, Math.max(1.6, length * 0.055));
  const innerStart = lead;
  const innerLength = length - 2 * lead;
  const parts = [`M ${spring.x0} ${spring.y0}`, `L ${spring.x0 + ux * lead} ${spring.y0 + uy * lead}`];
  for (let index = 1; index <= coils; index += 1) {
    const along = innerStart + (innerLength * (index - 0.5)) / coils;
    const side = index % 2 === 0 ? 1 : -1;
    parts.push(
      `L ${spring.x0 + ux * along + px * amplitude * side} ${spring.y0 + uy * along + py * amplitude * side}`,
    );
  }
  parts.push(
    `L ${spring.x1 - ux * lead} ${spring.y1 - uy * lead}`,
    `L ${spring.x1} ${spring.y1}`,
  );
  return parts.join(" ");
}

/** Text with a surface-colored halo so labels stay legible over paths. */
function HaloText({
  x,
  y,
  size,
  fill,
  halo,
  anchor = "middle",
  weight,
  children,
}: {
  x: number;
  y: number;
  size: number;
  fill: string;
  halo: string;
  anchor?: "start" | "middle" | "end";
  weight?: number;
  children: React.ReactNode;
}) {
  return (
    <text
      x={x}
      y={y}
      fontSize={size}
      fontWeight={weight}
      fill={fill}
      textAnchor={anchor}
      stroke={halo}
      strokeWidth={size * 0.32}
      paintOrder="stroke"
      strokeLinejoin="round"
    >
      {children}
    </text>
  );
}

function compactFormula(formula: string | null | undefined): string {
  if (!formula) return "";
  return formula
    .replace(/\\quad/g, "  ")
    .replace(/\\frac12/g, "1/2")
    .replace(/\\frac\{1\}\{2\}/g, "1/2")
    .replace(/[{}]/g, "");
}

function renderVector(
  vector: PhysicsSceneVector,
  target: PhysicsSceneObject | undefined,
  progress: number,
  colors: PhysicsColors,
) {
  if (!target) return null;
  const p = Math.max(0, Math.min(1, progress));
  const endX = target.x + vector.dx * p;
  const endY = target.y + vector.dy * p;
  const color = vectorColor(vector.semantic_role, colors);
  const component = vectorComponent(vector);
  const length = Math.hypot(vector.dx, vector.dy) || 1;
  const ux = vector.dx / length;
  const uy = vector.dy / length;
  // Name label: left of a vertical shaft, above a horizontal one, and offset
  // perpendicular for diagonals — mirrors how textbooks annotate vectors.
  const midX = target.x + (vector.dx * p) / 2;
  const midY = target.y + (vector.dy * p) / 2;
  const labelX = clamp(
    component === "vertical" ? midX - 2.6 : component === "horizontal" ? midX : midX - uy * 3.2,
    4,
    96,
  );
  const labelY = clamp(
    component === "horizontal" ? midY - 2.8 : component === "vertical" ? midY + 1 : midY + ux * 3.2 + 1,
    8,
    92,
  );
  const labelAnchor = component === "vertical" ? "end" : "middle";
  // Magnitude continues past the arrow tip along the vector's own direction.
  const magnitudeX = clamp(endX + ux * 3, 4, 96);
  const magnitudeY = clamp(endY + uy * 3 + 1, 8, 92);
  const magnitudeAnchor = Math.abs(ux) < 0.3 ? "middle" : ux > 0 ? "start" : "end";
  return (
    <g key={vector.id} data-semantic-role={vector.semantic_role} data-vector-component={component}>
      <line
        x1={target.x}
        y1={target.y}
        x2={endX}
        y2={endY}
        stroke={color}
        strokeWidth={vector.semantic_role === "velocity" ? "0.52" : "0.7"}
        strokeLinecap="round"
        markerEnd={`url(#physics-arrow-${vector.semantic_role})`}
      />
      {vector.label ? (
        <HaloText x={labelX} y={labelY} size={3.1} weight={650} fill={color} halo={colors.surface} anchor={labelAnchor}>
          {vector.label}
        </HaloText>
      ) : null}
      {vector.magnitude ? (
        <HaloText
          x={magnitudeX}
          y={magnitudeY}
          size={2.6}
          fill={colors.muted}
          halo={colors.surface}
          anchor={magnitudeAnchor}
        >
          {vector.magnitude}
        </HaloText>
      ) : null}
    </g>
  );
}

function renderExtraTrajectory(
  item: PhysicsSceneTrajectory,
  index: number,
  progress: number,
  colors: PhysicsColors,
) {
  const color = emphasisColor(item.emphasis, colors);
  const lastPoint = item.points.at(-1);
  return (
    <g key={item.id ?? `trajectory-${index}`} data-semantic-role={item.semantic_role ?? "trajectory"}>
      <path
        d={trajectoryPath(item.points, progress)}
        fill="none"
        stroke={color}
        strokeWidth={item.emphasis === "secondary" ? 0.7 : item.emphasis === "accent" ? 1.3 : 1.5}
        strokeDasharray={item.emphasis === "secondary" ? "2.1 1.6" : undefined}
        opacity={item.emphasis === "secondary" ? 0.7 : 0.88}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {item.label && lastPoint ? (
        <HaloText
          x={clamp(lastPoint[0], 7, 93)}
          y={clamp(lastPoint[1] - 2.2, 8, 92)}
          size={2.7}
          weight={620}
          fill={color}
          halo={colors.surface}
        >
          {item.label}
        </HaloText>
      ) : null}
    </g>
  );
}

function renderPoint(point: PhysicsScenePoint, index: number, colors: PhysicsColors) {
  const color = point.emphasis === "secondary"
    ? colors.muted
    : point.emphasis === "accent"
      ? colors.accent
      : colors.ink;
  return (
    <g key={`point-${index}`} data-semantic-role={point.semantic_role ?? "scene_point"}>
      <circle cx={point.x} cy={point.y} r={point.emphasis === "secondary" ? 0.85 : 1.1} fill={color} />
      {point.label ? (
        <HaloText
          x={clamp(point.x, 6, 94)}
          y={clamp(point.y - 2.1, 8, 92)}
          size={2.6}
          weight={620}
          fill={color}
          halo={colors.surface}
        >
          {point.label}
        </HaloText>
      ) : null}
    </g>
  );
}

// The ground is context, not content: keep it visibly lighter than any
// trajectory so the motion owns the visual hierarchy.
function renderGround(groundY: number, colors: PhysicsColors) {
  const hatches = Array.from({ length: 22 }, (_, index) => 7 + index * 4);
  return (
    <g data-semantic-role="ground" opacity="0.75">
      <line x1="6" y1={groundY} x2="94" y2={groundY} stroke={colors.axis} strokeWidth="0.55" />
      {hatches.map((x) => (
        <line
          key={x}
          x1={x}
          y1={groundY}
          x2={x - 1.9}
          y2={groundY + 2.1}
          stroke={colors.axis}
          strokeWidth="0.35"
          opacity="0.5"
        />
      ))}
    </g>
  );
}

export const PhysicsForceSceneRenderer: React.FC<RendererProps> = ({ step, progress, theme }) => {
  const snap = step.snapshot as PhysicsForceSceneSnapshot;
  const colors = physicsPalette(theme);
  const formulaText = compactFormula(snap.formula_latex);
  const hasGround = snap.ground_y != null && Number.isFinite(snap.ground_y);

  return (
    <div
      className="physics-force-scene"
      data-theme={theme}
      style={{
        width: "100%",
        height: "100%",
        boxSizing: "border-box",
        padding: 24,
        background: colors.bg,
        color: colors.ink,
        fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
      }}
    >
      <svg width="100%" height="100%" viewBox="0 0 100 100" role="img" aria-label={step.title}>
        <defs>
          {["force", "velocity", "acceleration"].map((role) => (
            <marker
              key={role}
              id={`physics-arrow-${role}`}
              markerWidth="2.5"
              markerHeight="2.5"
              refX="2.2"
              refY="1.25"
              orient="auto"
              markerUnits="userSpaceOnUse"
            >
              <path d="M0,0 L2.2,1.25 L0,2.5 Z" fill={vectorColor(role, colors)} />
            </marker>
          ))}
        </defs>

        <CoreLabGrid rendererKind="physics_force_scene" theme={theme} />

        <text x="8" y="11" fontSize="5.6" fontWeight="760" fill={colors.ink}>
          {step.title}
        </text>
        {formulaText ? (
          <CoreFormulaTag
            id="physics-formula"
            text={formulaText}
            rendererKind="physics_force_scene"
            x={57}
            y={14.5}
            width={37}
            height={9}
            textAnchor="end"
            textX={92}
            textY={20.6}
            fontSize={4.2}
            textFill={colors.ink}
            fill={colors.surface}
            stroke={colors.line}
            opacity={0.94}
          />
        ) : null}

        {hasGround ? renderGround(snap.ground_y as number, colors) : null}

        {snap.trajectory?.length ? (
          <g data-semantic-role="motion_trail" data-render-mode="native-trajectory">
            {!hasGround ? (
              <g data-semantic-role="motion_axes" opacity="0.6">
                <line x1="12" y1="84" x2="91" y2="84" stroke={colors.axis} strokeWidth="0.55" />
                <line x1="12" y1="17" x2="12" y2="84" stroke={colors.axis} strokeWidth="0.55" />
                <text x="92" y="85.4" fontSize="2.8" fill={colors.muted}>x</text>
                <text x="10.6" y="16" fontSize="2.8" fill={colors.muted}>y</text>
              </g>
            ) : null}
            <path
              d={trajectoryPath(snap.trajectory, progress)}
              fill="none"
              stroke={colors.trajectory}
              strokeWidth="1.5"
              opacity="0.85"
              strokeLinecap="round"
              strokeLinejoin="round"
              data-semantic-role="trajectory"
            />
          </g>
        ) : null}

        {snap.trajectories?.map((item, index) => renderExtraTrajectory(item, index, progress, colors))}

        {snap.springs?.map((spring) => (
          <g key={spring.id} data-semantic-role={spring.semantic_role ?? "spring_coil"}>
            <path
              d={springPath(spring)}
              fill="none"
              stroke={colors.ink}
              strokeWidth="0.62"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            {spring.label ? (
              <HaloText
                x={clamp((spring.x0 + spring.x1) / 2, 6, 94)}
                y={clamp(Math.min(spring.y0, spring.y1) - 4.4, 8, 92)}
                size={2.7}
                fill={colors.muted}
                halo={colors.surface}
              >
                {spring.label}
              </HaloText>
            ) : null}
          </g>
        ))}

        {snap.objects.map((object) => {
          const radius = object.radius ?? 4.6;
          return (
            <g key={object.id} data-object-id={object.id} data-semantic-role="object">
              <circle
                cx={object.x}
                cy={object.y}
                r={radius}
                fill={colors.surface}
                stroke={colors.ink}
                strokeWidth="0.65"
              />
              {object.label ? (
                <HaloText
                  x={object.x}
                  y={object.y - radius - 2.2}
                  size={3.4}
                  weight={700}
                  fill={colors.ink}
                  halo={colors.surface}
                >
                  {object.label}
                </HaloText>
              ) : null}
            </g>
          );
        })}

        {snap.points?.map((point, index) => renderPoint(point, index, colors))}

        {snap.vectors.map((vector) => renderVector(vector, objectById(snap.objects, vector.target), progress, colors))}

        {snap.annotations?.map((annotation, index) => (
          <g key={`annotation-${index}`} data-semantic-role={annotation.semantic_role ?? "scene_annotation"}>
            <HaloText
              x={clamp(annotation.x, 4, 96)}
              y={clamp(annotation.y, 8, 92)}
              size={2.9}
              fill={colors.muted}
              halo={colors.surface}
              anchor={annotation.align ?? "middle"}
            >
              {annotation.text}
            </HaloText>
          </g>
        ))}

        {snap.caption ? (
          <text x="50" y="94" textAnchor="middle" fontSize="3.8" fill={colors.muted}>
            {snap.caption}
          </text>
        ) : null}
      </svg>
    </div>
  );
};
