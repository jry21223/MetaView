import React from "react";

import { findAssetByRole, getAssetPack } from "../assets/assetRegistry";
import type { GeoMapFlow, GeoMapSceneSnapshot } from "../types";
import type { RendererProps } from "./types";

const VIEWBOX = "0 0 100 100";

function clampPercent(value: number): number {
  return Math.max(4, Math.min(96, value));
}

function flowPath(flow: GeoMapFlow, progress: number): string {
  const [x0, y0] = flow.from;
  const [x1, y1] = flow.to;
  const p = Math.max(0, Math.min(1, progress));
  const cx = (x0 + x1) / 2;
  const cy = Math.min(y0, y1) - 12;
  const tx = x0 + (x1 - x0) * p;
  const ty = y0 + (y1 - y0) * p;
  return `M ${clampPercent(x0)} ${clampPercent(y0)} Q ${clampPercent(cx)} ${clampPercent(cy)} ${clampPercent(tx)} ${clampPercent(ty)}`;
}

function pressureClass(kind: "high" | "low"): string {
  return kind === "high" ? "#2f80c9" : "#d55343";
}

export const GeoMapSceneRenderer: React.FC<RendererProps> = ({ step, progress, theme }) => {
  const snap = step.snapshot as GeoMapSceneSnapshot;
  const pack = getAssetPack(snap.pack_id ?? "geography-basic");
  const windAsset = snap.flows[0]?.asset_id
    ? pack?.assets.find((asset) => asset.id === snap.flows[0]?.asset_id)
    : findAssetByRole("geography", "wind");
  const particleCount = snap.particle_preset ? 9 : 0;

  return (
    <div
      className="geo-map-scene"
      data-theme={theme}
      data-map-region={snap.map_region ?? "world"}
      style={{
        width: "100%",
        height: "100%",
        boxSizing: "border-box",
        padding: 24,
        background: theme === "dark" ? "#101821" : "#f5f8fb",
        color: theme === "dark" ? "#f4f7fb" : "#182235",
        fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
      }}
    >
      <svg width="100%" height="100%" viewBox={VIEWBOX} role="img" aria-label={step.title}>
        <defs>
          <marker
            id="geo-flow-arrow"
            markerWidth="5"
            markerHeight="5"
            refX="4.5"
            refY="2.5"
            orient="auto"
            markerUnits="userSpaceOnUse"
          >
            <path d="M0,0 L5,2.5 L0,5 Z" fill="#1f8abd" />
          </marker>
          <linearGradient id="geo-ocean" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0" stopColor="#dff3fb" />
            <stop offset="1" stopColor="#b7d9ee" />
          </linearGradient>
        </defs>

        <rect x="0" y="0" width="100" height="100" rx="3" fill="url(#geo-ocean)" />
        <rect x="4" y="5" width="92" height="14" rx="3" fill="rgba(255,255,255,0.72)" />
        <text x="8" y="14" fontSize="5.2" fontWeight="760" fill="#182235">
          {step.title}
        </text>
        <text x="92" y="14" textAnchor="end" fontSize="3.6" fontWeight="700" fill="#466172">
          {snap.map_region ?? "world"}
        </text>

        <path
          d="M18 26 C33 19 50 24 61 36 C73 49 66 68 50 76 C35 83 19 75 12 59 C6 45 8 32 18 26 Z"
          fill="#d8e6c0"
          stroke="#8fac6b"
          strokeWidth="0.9"
          data-semantic-role="land"
        />
        <path
          d="M62 35 C77 38 90 49 94 64 C86 79 71 86 53 82 C66 72 72 52 62 35 Z"
          fill="#a9cfe7"
          opacity="0.8"
          data-semantic-role="ocean"
        />

        {snap.pressure_centers?.map((center) => (
          <g key={center.id} data-pressure-kind={center.kind}>
            <circle cx={center.x} cy={center.y} r="5.6" fill={pressureClass(center.kind)} opacity="0.92" />
            <text x={center.x} y={center.y + 1.6} textAnchor="middle" fontSize="5.2" fontWeight="800" fill="#fff">
              {center.kind === "high" ? "H" : "L"}
            </text>
            <text x={center.x} y={center.y - 8.2} textAnchor="middle" fontSize="3.3" fontWeight="700" fill="#26384a">
              {center.label}
            </text>
          </g>
        ))}

        {snap.flows.map((flow) => (
          <g key={flow.id} data-semantic-role={flow.semantic_role} data-asset-id={windAsset?.id}>
            <path
              d={flowPath(flow, progress)}
              fill="none"
              stroke="#1f8abd"
              strokeWidth={2.6 + Math.min(1.2, flow.strength ?? 1)}
              strokeLinecap="round"
              markerEnd="url(#geo-flow-arrow)"
              opacity="0.9"
            />
            <text
              x={(flow.from[0] + flow.to[0]) / 2}
              y={Math.min(flow.from[1], flow.to[1]) - 15}
              textAnchor="middle"
              fontSize="4"
              fontWeight="760"
              fill="#176d9d"
            >
              {flow.label}
            </text>
          </g>
        ))}

        {Array.from({ length: particleCount }).map((_, index) => (
          <circle
            key={index}
            cx={62 - index * 3.8 + progress * 8}
            cy={62 - (index % 3) * 8}
            r="1.1"
            fill="#ffffff"
            opacity="0.68"
            data-particle-preset={snap.particle_preset ?? undefined}
          />
        ))}

        {snap.layers.map((layer, index) => (
          <text
            key={layer.id}
            x={index === 0 ? 23 : 78}
            y={index === 0 ? 82 : 86}
            textAnchor="middle"
            fontSize="3.4"
            fontWeight="700"
            fill="#466172"
            data-semantic-role={layer.semantic_role}
          >
            {layer.label}
          </text>
        ))}

        {snap.caption ? (
          <text x="50" y="95" textAnchor="middle" fontSize="3.8" fill="#466172">
            {snap.caption}
          </text>
        ) : null}
      </svg>
    </div>
  );
};
