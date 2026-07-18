import React from "react";

import type { PhysicsForceSceneSnapshot, PhysicsSceneObject, PhysicsSceneVector } from "../types";
import { CoreFormulaTag } from "./CoreFormulaTag";
import { CoreLabGrid } from "./CoreLabGrid";
import type { RendererProps } from "./types";

function objectById(objects: PhysicsSceneObject[], id: string): PhysicsSceneObject | undefined {
  return objects.find((object) => object.id === id);
}

function vectorColor(role: string): string {
  if (role === "force") return "#d9482b";
  if (role === "acceleration") return "#8e44ad";
  if (role === "velocity") return "#1f8abd";
  return "#466172";
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

function motionTrailDots(
  points: Array<[number, number]> | undefined,
  progress: number,
): Array<{ x: number; y: number; r: number; opacity: number }> {
  if (!points?.length) return [];
  const p = Math.max(0, Math.min(1, progress));
  const visibleCount = Math.max(1, Math.ceil(points.length * p));
  return points.slice(0, visibleCount).map(([x, y], index) => {
    const age = visibleCount <= 1 ? 1 : index / (visibleCount - 1);
    return {
      x,
      y,
      r: 0.8 + age * 0.7,
      opacity: 0.28 + age * 0.42,
    };
  });
}

function renderVector(
  vector: PhysicsSceneVector,
  target: PhysicsSceneObject | undefined,
  progress: number,
) {
  if (!target) return null;
  const p = Math.max(0, Math.min(1, progress));
  const endX = target.x + vector.dx * p;
  const endY = target.y + vector.dy * p;
  const color = vectorColor(vector.semantic_role);
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
        strokeWidth="1.5"
        strokeLinecap="round"
        markerEnd={`url(#physics-arrow-${vector.semantic_role})`}
      />
      <text
        x={labelX}
        y={labelY}
        fontSize="3.6"
        fontWeight="700"
        fill={color}
        textAnchor={component === "vertical" ? "end" : "middle"}
      >
        {vector.label}
      </text>
      {vector.magnitude ? (
        <text x={magnitudeX} y={magnitudeY} fontSize="2.8" fill="#64748b">
          {vector.magnitude}
        </text>
      ) : null}
    </g>
  );
}

export const PhysicsForceSceneRenderer: React.FC<RendererProps> = ({ step, progress, theme }) => {
  const snap = step.snapshot as PhysicsForceSceneSnapshot;
  const formulaText = compactFormula(snap.formula_latex);
  const trailDots = motionTrailDots(snap.trajectory, progress);

  return (
    <div
      className="physics-force-scene"
      data-theme={theme}
      style={{
        width: "100%",
        height: "100%",
        boxSizing: "border-box",
        padding: 24,
        background: theme === "dark" ? "#111827" : "#f7f9fc",
        color: theme === "dark" ? "#f8fafc" : "#182235",
        fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
      }}
    >
      <svg width="100%" height="100%" viewBox="0 0 100 100" role="img" aria-label={step.title}>
        <defs>
          {["force", "velocity", "acceleration"].map((role) => (
            <marker
              key={role}
              id={`physics-arrow-${role}`}
              markerWidth="6"
              markerHeight="6"
              refX="5"
              refY="2.5"
              orient="auto"
              markerUnits="userSpaceOnUse"
            >
              <path d="M0,0 L5,2.5 L0,5 Z" fill={vectorColor(role)} />
            </marker>
          ))}
        </defs>

        <CoreLabGrid rendererKind="physics_force_scene" theme={theme} />

        <text x="8" y="11" fontSize="5.6" fontWeight="760" fill={theme === "dark" ? "#f8fafc" : "#182235"}>
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
            textFill={theme === "dark" ? "#f8fafc" : "#182235"}
            opacity={0.94}
          />
        ) : null}

        {snap.trajectory?.length ? (
          <path
            d={trajectoryPath(snap.trajectory, progress)}
            fill="none"
            stroke="#d69e2e"
            strokeWidth="2.4"
            strokeDasharray="3 3"
            strokeLinecap="round"
            data-semantic-role="trajectory"
          />
        ) : null}

        {trailDots.length ? (
          <g data-semantic-role="motion_trail">
            {trailDots.map((dot, index) => (
              <circle
                key={`${dot.x}-${dot.y}-${index}`}
                cx={dot.x}
                cy={dot.y}
                r={dot.r}
                fill="#d69e2e"
                opacity={dot.opacity}
              />
            ))}
          </g>
        ) : null}

        {snap.objects.map((object) => {
          const radius = object.radius ?? 4.6;
          return (
            <g key={object.id} data-object-id={object.id} data-semantic-role="object">
              <circle
                cx={object.x}
                cy={object.y}
                r={radius}
                fill={theme === "dark" ? "#dbe7d5" : "#82976f"}
                stroke={theme === "dark" ? "#9fb48d" : "#53654a"}
                strokeWidth="0.9"
              />
              {object.label ? (
                <text x={object.x} y={object.y - radius - 2.2} textAnchor="middle" fontSize="3.4" fontWeight="700" fill="#53654a">
                  {object.label}
                </text>
              ) : null}
            </g>
          );
        })}

        {snap.vectors.map((vector) => renderVector(vector, objectById(snap.objects, vector.target), progress))}

        {snap.caption ? (
          <text x="50" y="94" textAnchor="middle" fontSize="3.8" fill={theme === "dark" ? "#cbd5e1" : "#64748b"}>
            {snap.caption}
          </text>
        ) : null}
      </svg>
    </div>
  );
};
