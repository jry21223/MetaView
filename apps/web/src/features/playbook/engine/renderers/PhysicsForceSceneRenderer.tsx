import React from "react";

import { getAssetPack } from "../assets/assetRegistry";
import type { PhysicsForceSceneSnapshot, PhysicsSceneObject, PhysicsSceneVector } from "../types";
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

function renderVector(vector: PhysicsSceneVector, target: PhysicsSceneObject | undefined, progress: number) {
  if (!target) return null;
  const p = Math.max(0, Math.min(1, progress));
  const endX = target.x + vector.dx * p;
  const endY = target.y + vector.dy * p;
  const color = vectorColor(vector.semantic_role);
  return (
    <g key={vector.id} data-semantic-role={vector.semantic_role}>
      <line
        x1={target.x}
        y1={target.y}
        x2={endX}
        y2={endY}
        stroke={color}
        strokeWidth="3.2"
        strokeLinecap="round"
        markerEnd={`url(#physics-arrow-${vector.semantic_role})`}
      />
      <text
        x={(target.x + endX) / 2 + 2}
        y={(target.y + endY) / 2 - 3}
        fontSize="4.6"
        fontWeight="800"
        fill={color}
      >
        {vector.label}
      </text>
      {vector.magnitude ? (
        <text x={endX + 3} y={endY + 3} fontSize="3.2" fill="#64748b">
          {vector.magnitude}
        </text>
      ) : null}
    </g>
  );
}

export const PhysicsForceSceneRenderer: React.FC<RendererProps> = ({ step, progress, theme }) => {
  const snap = step.snapshot as PhysicsForceSceneSnapshot;
  const pack = getAssetPack(snap.pack_id ?? "physics-basic");
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
              markerWidth="9"
              markerHeight="9"
              refX="6"
              refY="3"
              orient="auto"
              markerUnits="userSpaceOnUse"
            >
              <path d="M0,0 L6,3 L0,6 Z" fill={vectorColor(role)} />
            </marker>
          ))}
        </defs>

        <rect x="0" y="0" width="100" height="100" rx="3" fill={theme === "dark" ? "#111827" : "#f7f9fc"} />
        <path d="M 8 82 H 94 M 10 18 V 84" fill="none" stroke="#9aa9b8" strokeWidth="0.7" opacity="0.55" />
        <path d="M 8 66 H 94 M 8 50 H 94 M 8 34 H 94 M 28 18 V 84 M 46 18 V 84 M 64 18 V 84 M 82 18 V 84" fill="none" stroke="#9aa9b8" strokeWidth="0.35" opacity="0.32" />

        <text x="8" y="11" fontSize="5.6" fontWeight="760" fill={theme === "dark" ? "#f8fafc" : "#182235"}>
          {step.title}
        </text>
        {formulaText ? (
          <text x="94" y="10.5" textAnchor="end" fontSize="4.2" fontWeight="760" fill={theme === "dark" ? "#f8fafc" : "#182235"}>
            {formulaText}
          </text>
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

        {snap.objects.map((object) => {
          const asset = object.asset_id ? pack?.assets.find((item) => item.id === object.asset_id) : undefined;
          return (
            <g key={object.id} data-object-id={object.id} data-asset-id={asset?.id}>
              <circle
                cx={object.x}
                cy={object.y}
                r={object.radius ?? 4.6}
                fill="#345995"
                stroke="#ffffff"
                strokeWidth="1.4"
              />
              <text x={object.x} y={object.y - 7} textAnchor="middle" fontSize="3.8" fontWeight="700" fill="#345995">
                {object.label}
              </text>
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
