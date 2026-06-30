import React from "react";

import { AssetSvg } from "../assets/AssetSvg";
import type { AssetManifestEntry } from "../assets/assetRegistry";
import { resolveAssetById, resolveAssetByRole, resolveAssetForRenderer } from "../assets/assetResolver";
import type { GeoMapFlow, GeoMapSceneSnapshot, GeoPressureCenter } from "../types";
import type { RendererProps } from "./types";

const VIEWBOX = "0 0 100 100";
const DEFAULT_GEO_PACK_ID = "geography-basic";

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

function resolveMapAsset(snap: GeoMapSceneSnapshot, packId: string): AssetManifestEntry | undefined {
  const explicitLayer = snap.layers.find(
    (layer) =>
      (layer.semantic_role === "map_layer" || layer.semantic_role === "land" || layer.semantic_role === "ocean") &&
      layer.asset_id,
  );
  const explicitAsset = resolveAssetById(packId, explicitLayer?.asset_id);
  if (explicitAsset) return explicitAsset;

  return (
    resolveAssetForRenderer("geo_map_scene", "map_layer", packId) ??
    resolveAssetForRenderer("geo_map_scene", "land", packId) ??
    resolveAssetForRenderer("geo_map_scene", "ocean", packId) ??
    resolveAssetByRole("geography", "map_layer", packId)
  );
}

function resolveFlowAsset(flow: GeoMapFlow, packId: string): AssetManifestEntry | undefined {
  const semanticAsset =
    resolveAssetForRenderer("geo_map_scene", flow.semantic_role, packId) ??
    resolveAssetForRenderer("geo_map_scene", "wind", packId) ??
    resolveAssetByRole("geography", flow.semantic_role, packId) ??
    resolveAssetByRole("geography", "wind", packId);
  const explicitAsset = resolveAssetById(packId, flow.asset_id);
  return explicitAsset ?? semanticAsset;
}

function particlePresetPoints(
  preset: GeoMapSceneSnapshot["particle_preset"],
  progress: number,
): Array<{ x: number; y: number; r: number; opacity: number }> {
  if (!preset) return [];
  const p = Math.max(0, Math.min(1, progress));
  const baseCount = preset === "moisture_particles" ? 9 : 7;
  return Array.from({ length: baseCount }, (_, index) => ({
    x: 62 - index * 3.8 + p * 8,
    y: 62 - (index % 3) * 8 + (preset === "wind_stream" ? Math.sin(index + p * Math.PI) * 1.4 : 0),
    r: preset === "moisture_particles" ? 1.1 : 0.9,
    opacity: preset === "current_flow" ? 0.5 : 0.68,
  }));
}

function pressureLabelPosition(
  center: GeoPressureCenter,
  centers: GeoPressureCenter[],
  index: number,
): { x: number; y: number; textAnchor: "middle" | "start" | "end" } {
  const overlapsEarlier = centers
    .slice(0, index)
    .some((other) => Math.abs(center.x - other.x) < 18 && Math.abs(center.y - other.y) < 14);
  if (!overlapsEarlier) {
    return { x: clampPercent(center.x), y: clampPercent(center.y - 8.2), textAnchor: "middle" };
  }

  const side = index % 2 === 0 ? -1 : 1;
  return {
    x: clampPercent(center.x + side * 11),
    y: clampPercent(center.y + (center.y < 52 ? 10 : -10)),
    textAnchor: side > 0 ? "start" : "end",
  };
}

function layerLabelPosition(index: number, total: number): { x: number; y: number } {
  const safeTotal = Math.max(1, total);
  const spacing = safeTotal === 1 ? 0 : 64 / (safeTotal - 1);
  return {
    x: safeTotal === 1 ? 50 : 18 + spacing * index,
    y: 83 + (index % 2) * 4,
  };
}

export const GeoMapSceneRenderer: React.FC<RendererProps> = ({ step, progress, theme }) => {
  const snap = step.snapshot as GeoMapSceneSnapshot;
  const packId = snap.pack_id ?? DEFAULT_GEO_PACK_ID;
  const mapAsset = resolveMapAsset(snap, packId);
  const particles = particlePresetPoints(snap.particle_preset, progress);
  const pressureCenters = snap.pressure_centers ?? [];

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

        <AssetSvg
          asset={mapAsset}
          assetId={mapAsset?.id}
          packId={packId}
          subject="geography"
          semanticRole="map_layer"
          x={8}
          y={21}
          width={84}
          height={58}
          fallbackShape="rect"
        />

        {pressureCenters.map((center, index) => {
          const label = pressureLabelPosition(center, pressureCenters, index);
          return (
            <g key={center.id} data-pressure-kind={center.kind}>
              <circle cx={center.x} cy={center.y} r="5.6" fill={pressureClass(center.kind)} opacity="0.92" />
              <text x={center.x} y={center.y + 1.6} textAnchor="middle" fontSize="5.2" fontWeight="800" fill="#fff">
                {center.kind === "high" ? "H" : "L"}
              </text>
              <text
                x={label.x}
                y={label.y}
                textAnchor={label.textAnchor}
                fontSize="3.3"
                fontWeight="700"
                fill="#26384a"
              >
                {center.label}
              </text>
            </g>
          );
        })}

        {snap.flows.map((flow) => {
          const flowAsset = resolveFlowAsset(flow, packId);
          return (
            <g
              key={flow.id}
              data-semantic-role={flow.semantic_role}
              data-asset-id={flowAsset?.id ?? flow.asset_id ?? undefined}
              data-asset-path={flowAsset?.path}
            >
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
          );
        })}

        {particles.map((particle, index) => (
          <circle
            key={index}
            cx={particle.x}
            cy={particle.y}
            r={particle.r}
            fill="#ffffff"
            opacity={particle.opacity}
            data-particle-preset={snap.particle_preset ?? undefined}
          />
        ))}

        {snap.layers.map((layer, index) => {
          const label = layerLabelPosition(index, snap.layers.length);
          return (
            <text
              key={layer.id}
              x={label.x}
              y={label.y}
              textAnchor="middle"
              fontSize="3.4"
              fontWeight="700"
              fill="#466172"
              data-semantic-role={layer.semantic_role}
            >
              {layer.label}
            </text>
          );
        })}

        {snap.caption ? (
          <text x="50" y="95" textAnchor="middle" fontSize="3.8" fill="#466172">
            {snap.caption}
          </text>
        ) : null}
      </svg>
    </div>
  );
};
