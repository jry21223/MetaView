import React from "react";

import type { PhysicsForceSceneSnapshot, PhysicsSceneObject, PhysicsSceneVector } from "../types";
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
    trajectory: physicsVisualColor("trajectory", theme),
    velocity: physicsVisualColor("velocity", theme),
    acceleration: physicsVisualColor("acceleration", theme),
    force: physicsVisualColor("force", theme),
  } as const;
}

function vectorColor(role: string, colors: ReturnType<typeof physicsPalette>): string {
  if (role === "force") return colors.force;
  if (role === "acceleration") return colors.acceleration;
  if (role === "velocity") return colors.velocity;
  return colors.axis;
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
  colors: ReturnType<typeof physicsPalette>,
) {
  if (!target) return null;
  const p = Math.max(0, Math.min(1, progress));
  const endX = target.x + vector.dx * p;
  const endY = target.y + vector.dy * p;
  const color = vectorColor(vector.semantic_role, colors);
  const component = vectorComponent(vector);
  const labelX = component === "vertical" ? target.x - 2.2 : (target.x + endX) / 2;
  const labelY = component === "horizontal" ? target.y - 2.6 : (target.y + endY) / 2;
  const magnitudeX = component === "vertical" ? endX + 2.4 : endX + 1.8;
  const magnitudeY = component === "horizontal" ? endY + 3.4 : endY + (endY < target.y ? -1.8 : 3.6);
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
      <text
        x={labelX}
        y={labelY}
        fontSize="3.1"
        fontWeight="650"
        fill={color}
        textAnchor={component === "vertical" ? "end" : "middle"}
      >
        {vector.label}
      </text>
      {vector.magnitude ? (
        <text x={magnitudeX} y={magnitudeY} fontSize="2.6" fill={colors.muted}>
          {vector.magnitude}
        </text>
      ) : null}
    </g>
  );
}

export const PhysicsForceSceneRenderer: React.FC<RendererProps> = ({ step, progress, theme }) => {
  const snap = step.snapshot as PhysicsForceSceneSnapshot;
  const colors = physicsPalette(theme);
  const formulaText = compactFormula(snap.formula_latex);

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

        {snap.trajectory?.length ? (
          <path
            d={trajectoryPath(snap.trajectory, progress)}
            fill="none"
            stroke={colors.trajectory}
            strokeWidth="0.42"
            opacity="0.68"
            strokeLinecap="round"
            strokeLinejoin="round"
            data-semantic-role="trajectory"
          />
        ) : null}

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
                <text x={object.x} y={object.y - radius - 2.2} textAnchor="middle" fontSize="3.4" fontWeight="700" fill={colors.ink}>
                  {object.label}
                </text>
              ) : null}
            </g>
          );
        })}

        {snap.vectors.map((vector) => renderVector(vector, objectById(snap.objects, vector.target), progress, colors))}

        {snap.caption ? (
          <text x="50" y="94" textAnchor="middle" fontSize="3.8" fill={colors.muted}>
            {snap.caption}
          </text>
        ) : null}
      </svg>
    </div>
  );
};
