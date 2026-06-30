import React from "react";

import {
  findAssetById,
  findAssetByRole,
  type AssetManifestEntry,
  type SubjectVisualKitSubject,
} from "./assetRegistry";

type AssetFallbackShape = "rect" | "circle";

interface AssetSvgProps {
  asset?: AssetManifestEntry | null;
  assetId?: string | null;
  packId?: string | null;
  subject?: SubjectVisualKitSubject;
  semanticRole?: string | null;
  x: number;
  y: number;
  width: number;
  height: number;
  opacity?: number | string;
  preserveAspectRatio?: string;
  fallbackShape?: AssetFallbackShape;
  className?: string;
  transform?: string;
}

function resolveAsset({
  asset,
  assetId,
  packId,
  subject,
  semanticRole,
}: Pick<AssetSvgProps, "asset" | "assetId" | "packId" | "subject" | "semanticRole">): AssetManifestEntry | undefined {
  if (asset) return asset;
  const byId = findAssetById(assetId, packId);
  if (byId) return byId;
  if (subject && semanticRole) return findAssetByRole(subject, semanticRole, packId);
  return undefined;
}

function canRenderAsStaticAsset(asset: AssetManifestEntry | undefined): asset is AssetManifestEntry & { path: string } {
  return Boolean(asset?.path && (asset.type === "svg" || asset.type === "image"));
}

function MissingAssetFallback({
  x,
  y,
  width,
  height,
  shape,
}: {
  x: number;
  y: number;
  width: number;
  height: number;
  shape: AssetFallbackShape;
}) {
  if (shape === "circle") {
    const cx = x + width / 2;
    const cy = y + height / 2;
    const radius = Math.max(2, Math.min(width, height) / 2);
    return (
      <>
        <circle cx={cx} cy={cy} r={radius} fill="#345995" stroke="#ffffff" strokeWidth="1.4" />
        <path
          d={`M ${cx - radius * 0.55} ${cy - radius * 0.55} L ${cx + radius * 0.55} ${cy + radius * 0.55} M ${cx + radius * 0.55} ${cy - radius * 0.55} L ${cx - radius * 0.55} ${cy + radius * 0.55}`}
          fill="none"
          stroke="#ffffff"
          strokeWidth="1"
          strokeLinecap="round"
          opacity="0.72"
        />
      </>
    );
  }

  return (
    <>
      <rect x={x} y={y} width={width} height={height} rx="3" fill="#dff3fb" stroke="#6b8095" strokeWidth="0.8" />
      <path
        d={`M ${x + width * 0.2} ${y + height * 0.62} C ${x + width * 0.34} ${y + height * 0.36} ${x + width * 0.55} ${y + height * 0.4} ${x + width * 0.7} ${y + height * 0.58}`}
        fill="none"
        stroke="#6c8f3d"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <path
        d={`M ${x + width * 0.18} ${y + height * 0.18} L ${x + width * 0.82} ${y + height * 0.82} M ${x + width * 0.82} ${y + height * 0.18} L ${x + width * 0.18} ${y + height * 0.82}`}
        fill="none"
        stroke="#9b4d43"
        strokeWidth="1"
        strokeLinecap="round"
        opacity="0.72"
      />
    </>
  );
}

export function AssetSvg({
  asset,
  assetId,
  packId,
  subject,
  semanticRole,
  x,
  y,
  width,
  height,
  opacity,
  preserveAspectRatio = "xMidYMid meet",
  fallbackShape = "rect",
  className,
  transform,
}: AssetSvgProps) {
  const resolvedAsset = resolveAsset({ asset, assetId, packId, subject, semanticRole });
  const renderable = canRenderAsStaticAsset(resolvedAsset);
  const missing = !renderable;
  const requestedAssetId = assetId ?? resolvedAsset?.id;

  return (
    <g
      className={className}
      opacity={opacity}
      transform={transform}
      data-asset-id={resolvedAsset?.id ?? requestedAssetId ?? undefined}
      data-asset-path={resolvedAsset?.path}
      data-asset-type={resolvedAsset?.type}
      data-semantic-role={semanticRole ?? resolvedAsset?.semanticRoles[0]}
      data-missing-asset={missing ? "true" : undefined}
    >
      {renderable ? (
        <image
          href={resolvedAsset.path}
          x={x}
          y={y}
          width={width}
          height={height}
          preserveAspectRatio={preserveAspectRatio}
        />
      ) : (
        <MissingAssetFallback x={x} y={y} width={width} height={height} shape={fallbackShape} />
      )}
    </g>
  );
}
