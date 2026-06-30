import React from "react";

import { AssetSvg } from "../assets/AssetSvg";
import type { AssetManifestEntry } from "../assets/assetRegistry";
import { resolveAssetById, resolveAssetByRole, resolveAssetForRenderer } from "../assets/assetResolver";
import type { BioCellCallout, BioProcessConnection, BioProcessSceneSnapshot, BioProcessStep } from "../types";
import type { RendererProps } from "./types";

const DEFAULT_BIOLOGY_PACK_ID = "biology-basic";
const CORE_PACK_ID = "core-visual-basic";

function resolveProcessAsset(processStep: BioProcessStep, packId: string): AssetManifestEntry | undefined {
  if (processStep.asset_id) return resolveAssetById(packId, processStep.asset_id);
  return (
    resolveAssetForRenderer("bio_process_scene", processStep.semantic_role, packId) ??
    resolveAssetByRole("biology", processStep.semantic_role, packId) ??
    resolveAssetByRole("biology", processStep.semantic_role)
  );
}

function resolveConnectionAsset(connection: BioProcessConnection): AssetManifestEntry | undefined {
  if (connection.asset_id) {
    return (
      resolveAssetById(CORE_PACK_ID, connection.asset_id) ??
      resolveAssetById(undefined, connection.asset_id)
    );
  }
  return (
    resolveAssetForRenderer("bio_process_scene", connection.semantic_role, CORE_PACK_ID) ??
    resolveAssetForRenderer("bio_process_scene", connection.semantic_role) ??
    resolveAssetByRole("core", connection.semantic_role, CORE_PACK_ID) ??
    resolveAssetByRole("core", connection.semantic_role)
  );
}

function stepById(steps: BioProcessStep[], id: string): BioProcessStep | undefined {
  return steps.find((step) => step.id === id);
}

function connectionGeometry(from: BioProcessStep, to: BioProcessStep) {
  const x1 = from.x + from.width / 2 + 1;
  const y1 = from.y;
  const x2 = to.x - to.width / 2 - 1;
  const y2 = to.y;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const distance = Math.max(8, Math.hypot(dx, dy));
  const angle = Math.atan2(dy, dx) * (180 / Math.PI);
  const midX = (x1 + x2) / 2;
  const midY = (y1 + y2) / 2;
  return { x1, y1, x2, y2, distance, angle, midX, midY };
}

function renderConnection(connection: BioProcessConnection, steps: BioProcessStep[], progress: number) {
  const from = stepById(steps, connection.from);
  const to = stepById(steps, connection.to);
  if (!from || !to) return null;

  const geometry = connectionGeometry(from, to);
  const asset = resolveConnectionAsset(connection);
  const visibleProgress = Math.max(0.2, progress);
  const arrowWidth = Math.min(28, Math.max(12, geometry.distance * 0.72));
  const arrowHeight = 7;

  return (
    <g
      key={connection.id}
      data-connection-id={connection.id}
      data-semantic-role={connection.semantic_role}
      opacity={visibleProgress}
    >
      <path
        d={`M ${geometry.x1} ${geometry.y1} C ${geometry.midX - 4} ${geometry.y1 - 4}, ${geometry.midX + 4} ${geometry.y2 + 4}, ${geometry.x2} ${geometry.y2}`}
        fill="none"
        stroke="#5b7c6a"
        strokeWidth="1.2"
        strokeLinecap="round"
        opacity="0.56"
      />
      <AssetSvg
        asset={asset}
        assetId={connection.asset_id ?? asset?.id}
        packId={CORE_PACK_ID}
        subject="core"
        semanticRole={connection.semantic_role}
        x={geometry.midX - arrowWidth / 2}
        y={geometry.midY - arrowHeight / 2}
        width={arrowWidth}
        height={arrowHeight}
        transform={`rotate(${geometry.angle} ${geometry.midX} ${geometry.midY})`}
        fallbackShape="rect"
      />
      {connection.label ? (
        <text
          x={geometry.midX}
          y={geometry.midY - 6.5}
          textAnchor="middle"
          fontSize="2.8"
          fontWeight="760"
          fill="#365443"
        >
          {connection.label}
        </text>
      ) : null}
    </g>
  );
}

function calloutAnchor(
  target: BioProcessStep,
  callout: BioCellCallout,
): { x1: number; y1: number; x2: number; y2: number; textAnchor: "start" | "middle" | "end" } {
  const side = callout.side ?? "top";
  if (side === "left") {
    return { x1: target.x - target.width / 2 + 2, y1: target.y, x2: Math.max(8, target.x - 26), y2: target.y - 8, textAnchor: "end" };
  }
  if (side === "right") {
    return { x1: target.x + target.width / 2 - 2, y1: target.y, x2: Math.min(92, target.x + 26), y2: target.y - 8, textAnchor: "start" };
  }
  if (side === "bottom") {
    return { x1: target.x, y1: target.y + target.height / 2 - 1, x2: target.x, y2: Math.min(84, target.y + 22), textAnchor: "middle" };
  }
  return { x1: target.x, y1: target.y - target.height / 2 + 1, x2: target.x, y2: Math.max(22, target.y - 24), textAnchor: "middle" };
}

function renderCallout(callout: BioCellCallout, steps: BioProcessStep[]) {
  const target = stepById(steps, callout.target_id);
  if (!target) return null;
  const anchor = calloutAnchor(target, callout);
  const width = anchor.textAnchor === "middle" ? 30 : 26;
  const rectX = anchor.textAnchor === "end" ? anchor.x2 - width : anchor.textAnchor === "middle" ? anchor.x2 - width / 2 : anchor.x2;
  const textX = anchor.textAnchor === "end" ? anchor.x2 - 2 : anchor.textAnchor === "middle" ? anchor.x2 : anchor.x2 + 2;

  return (
    <g key={callout.id} data-semantic-role="callout" data-target-id={callout.target_id}>
      <path
        d={`M ${anchor.x1} ${anchor.y1} L ${anchor.x2} ${anchor.y2}`}
        fill="none"
        stroke="#4f6f5a"
        strokeWidth="0.8"
        strokeLinecap="round"
      />
      <circle cx={anchor.x1} cy={anchor.y1} r="1.2" fill="#4f6f5a" />
      <rect x={rectX} y={anchor.y2 - 6.4} width={width} height="8.2" rx="2" fill="#ffffff" stroke="#d8e1d7" opacity="0.96" />
      <text x={textX} y={anchor.y2 - 1.2} textAnchor={anchor.textAnchor} fontSize="2.7" fontWeight="760" fill="#26384a">
        {callout.label}
      </text>
    </g>
  );
}

export const BioProcessSceneRenderer: React.FC<RendererProps> = ({ step, progress, theme }) => {
  const snap = step.snapshot as BioProcessSceneSnapshot;
  const packId = snap.pack_id ?? DEFAULT_BIOLOGY_PACK_ID;
  const p = Math.max(0, Math.min(1, progress));

  return (
    <div
      className="bio-process-scene"
      data-theme={theme}
      data-pack-id={packId}
      data-process-id={snap.process_id}
      style={{
        width: "100%",
        height: "100%",
        boxSizing: "border-box",
        padding: 24,
        background: theme === "dark" ? "#111827" : "#f7fbf7",
        color: theme === "dark" ? "#f8fafc" : "#182235",
        fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
      }}
    >
      <svg width="100%" height="100%" viewBox="0 0 100 100" role="img" aria-label={step.title}>
        <defs>
          <linearGradient id="bio-process-grid" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0" stopColor="#fbfff8" />
            <stop offset="1" stopColor="#e8f3ed" />
          </linearGradient>
        </defs>
        <rect x="0" y="0" width="100" height="100" rx="3" fill={theme === "dark" ? "#111827" : "url(#bio-process-grid)"} />
        <path d="M 8 26 H 92 M 8 44 H 92 M 8 62 H 92 M 8 80 H 92 M 18 18 V 86 M 38 18 V 86 M 58 18 V 86 M 78 18 V 86" fill="none" stroke="#b8c8bd" strokeWidth="0.28" opacity="0.28" />
        <text x="8" y="12" fontSize="5.6" fontWeight="780" fill={theme === "dark" ? "#f8fafc" : "#182235"}>
          {step.title}
        </text>
        <text x="92" y="12" textAnchor="end" fontSize="3.5" fontWeight="760" fill="#5b8c6a">
          {snap.process_id.replace(/_/g, " ")}
        </text>

        {(snap.connections ?? []).map((connection) => renderConnection(connection, snap.steps, p))}

        {snap.steps.map((processStep, index) => {
          const asset = resolveProcessAsset(processStep, packId);
          const opacity = Math.max(0.7, Math.min(1, p + index * 0.08));
          return (
            <g
              key={processStep.id}
              data-process-step-id={processStep.id}
              data-semantic-role={processStep.semantic_role}
              opacity={opacity}
            >
              <rect
                x={processStep.x - processStep.width / 2 - 3}
                y={processStep.y - processStep.height / 2 - 3}
                width={processStep.width + 6}
                height={processStep.height + 9}
                rx="3"
                fill="#ffffff"
                stroke="#d8e1d7"
                opacity="0.78"
              />
              <AssetSvg
                asset={asset}
                assetId={processStep.asset_id ?? asset?.id}
                packId={packId}
                subject="biology"
                semanticRole={processStep.semantic_role}
                x={processStep.x - processStep.width / 2}
                y={processStep.y - processStep.height / 2}
                width={processStep.width}
                height={processStep.height}
                fallbackShape="rect"
              />
              {processStep.label ? (
                <text
                  x={processStep.x}
                  y={processStep.y + processStep.height / 2 + 6.2}
                  textAnchor="middle"
                  fontSize="3"
                  fontWeight="760"
                  fill="#34513f"
                >
                  {processStep.label}
                </text>
              ) : null}
            </g>
          );
        })}

        {(snap.callouts ?? []).map((callout) => renderCallout(callout, snap.steps))}

        {snap.caption ? (
          <text x="50" y="94" textAnchor="middle" fontSize="3.5" fill={theme === "dark" ? "#cbd5e1" : "#566b5d"}>
            {snap.caption}
          </text>
        ) : null}
      </svg>
    </div>
  );
};
