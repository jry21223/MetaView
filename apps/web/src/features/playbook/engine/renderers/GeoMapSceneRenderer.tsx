import React from "react";

import { resolveGeoJsonAssetData, type GeoJsonFeatureCollection } from "../assets/assetGeoJson";
import type { AssetManifestEntry } from "../assets/assetRegistry";
import { resolveAssetById, resolveAssetByRole, resolveAssetForRenderer } from "../assets/assetResolver";
import { compileGeoJsonToSvgPaths } from "../kits/geography/MapProjectionCompiler";
import type { GeoMapFlow, GeoMapSceneSnapshot, GeoPressureCenter } from "../types";
import type { RendererProps } from "./types";

const VIEWBOX = "0 0 100 100";
const DEFAULT_GEO_PACK_ID = "geography-earth-basic";
const MAP_VIEWPORT = { x: 8, y: 21, width: 84, height: 58 };

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

function explicitLayerAsset(
  snap: GeoMapSceneSnapshot,
  packId: string,
  semanticRoles: string[],
): AssetManifestEntry | undefined {
  for (const layer of snap.layers) {
    if (!semanticRoles.includes(layer.semantic_role) || !layer.asset_id) continue;
    const asset = resolveAssetById(packId, layer.asset_id);
    if (asset) return asset;
  }
  return undefined;
}

function resolveLayerAsset(
  snap: GeoMapSceneSnapshot,
  packId: string,
  semanticRole: string,
  fallbacks: string[] = [],
): AssetManifestEntry | undefined {
  const roles = [semanticRole, ...fallbacks];
  return (
    explicitLayerAsset(snap, packId, roles) ??
    roles.reduce<AssetManifestEntry | undefined>(
      (resolved, role) =>
        resolved ??
        resolveAssetForRenderer("geo_map_scene", role, packId) ??
        resolveAssetByRole("geography", role, packId),
      undefined,
    )
  );
}

function uniqueAssets(assets: Array<AssetManifestEntry | undefined>): AssetManifestEntry[] {
  const seen = new Set<string>();
  return assets.filter((asset): asset is AssetManifestEntry => {
    if (!asset || seen.has(asset.id)) return false;
    seen.add(asset.id);
    return true;
  });
}

function resolveMapAssets(snap: GeoMapSceneSnapshot, packId: string): AssetManifestEntry[] {
  const land = resolveLayerAsset(snap, packId, "land", ["map_layer"]);
  const boundary = resolveLayerAsset(snap, packId, "country_boundary");
  const coastline = resolveLayerAsset(snap, packId, "coastline");
  return uniqueAssets([land, boundary, coastline]);
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

function geoJsonLayerStyle(asset: AssetManifestEntry): {
  className: string;
  fill: string;
  stroke: string;
  strokeWidth: number;
  opacity: number;
} {
  if (asset.semanticRoles.includes("country_boundary")) {
    return { className: "country_boundary", fill: "none", stroke: "#6f7d58", strokeWidth: 0.34, opacity: 0.72 };
  }
  if (asset.semanticRoles.includes("coastline")) {
    return { className: "coastline", fill: "none", stroke: "#4a758f", strokeWidth: 0.72, opacity: 0.82 };
  }
  return { className: "land", fill: "#d6e6bf", stroke: "#78935a", strokeWidth: 0.42, opacity: 0.98 };
}

function naturalEarthLayer(data: GeoJsonFeatureCollection, asset: AssetManifestEntry): string {
  return data.metadata?.natural_earth_layer ?? asset.semanticRoles[0] ?? asset.id;
}

function renderMapAsset(asset: AssetManifestEntry) {
  const geojson = resolveGeoJsonAssetData(asset);
  if (!geojson) return null;

  const style = geoJsonLayerStyle(asset);
  const compiled = compileGeoJsonToSvgPaths(geojson, {
    viewport: MAP_VIEWPORT,
    className: style.className,
    precision: 3,
  });
  return (
    <g
      key={asset.id}
      data-asset-id={asset.id}
      data-asset-path={asset.path}
      data-asset-type={asset.type}
      data-semantic-role={asset.semanticRoles[0]}
      data-natural-earth-layer={naturalEarthLayer(geojson, asset)}
    >
      {compiled.paths.map((path) => (
        <path
          key={path.id}
          d={path.d}
          fill={style.fill}
          stroke={style.stroke}
          strokeWidth={style.strokeWidth}
          opacity={style.opacity}
          data-feature-name={path.sourceName}
          data-map-path-class={path.className}
        />
      ))}
    </g>
  );
}

export const GeoMapSceneRenderer: React.FC<RendererProps> = ({ step, progress, theme }) => {
  const snap = step.snapshot as GeoMapSceneSnapshot;
  const packId = snap.pack_id ?? DEFAULT_GEO_PACK_ID;
  const mapAssets = resolveMapAssets(snap, packId);
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
        </defs>

        <rect x="0" y="0" width="100" height="100" rx="3" fill={theme === "dark" ? "#17242b" : "#eef5f4"} />
        <rect x="4" y="5" width="92" height="14" rx="3" fill="rgba(255,255,255,0.72)" />
        <text x="8" y="14" fontSize="5.2" fontWeight="760" fill="#182235">
          {step.title}
        </text>
        {mapAssets.map(renderMapAsset)}

        {pressureCenters.map((center, index) => {
          const label = pressureLabelPosition(center, pressureCenters, index);
          return (
            <g key={center.id} data-pressure-kind={center.kind}>
              <circle cx={center.x} cy={center.y} r="4.5" fill="#ffffff" stroke={pressureClass(center.kind)} strokeWidth="1.2" />
              <text x={center.x} y={center.y + 1.4} textAnchor="middle" fontSize="4.4" fontWeight="800" fill={pressureClass(center.kind)}>
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
          return (
            <g
              key={flow.id}
              data-semantic-role={flow.semantic_role}
            >
              <path
                d={flowPath(flow, progress)}
                fill="none"
                stroke="#1f8abd"
                strokeWidth={1.2 + Math.min(0.55, (flow.strength ?? 1) * 0.3)}
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
