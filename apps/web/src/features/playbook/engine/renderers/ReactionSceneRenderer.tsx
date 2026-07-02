import React from "react";

import { AssetSvg } from "../assets/AssetSvg";
import type { AssetManifestEntry } from "../assets/assetRegistry";
import { resolveAssetById, resolveAssetByRole, resolveAssetForRenderer } from "../assets/assetResolver";
import type {
  Molecule2DCallout,
  ReactionArrow,
  ReactionElectronFlow,
  ReactionParticipant,
  ReactionSceneSnapshot,
} from "../types";
import { CoreCalloutLabel } from "./CoreCalloutLabel";
import { CoreFormulaTag } from "./CoreFormulaTag";
import { CoreLabGrid } from "./CoreLabGrid";
import type { RendererProps } from "./types";

const DEFAULT_CHEMISTRY_PACK_ID = "chemistry-basic";

interface ResolvedReactionAsset {
  asset?: AssetManifestEntry;
  assetId?: string;
}

function resolveReactionAsset(
  packId: string,
  semanticRole: string,
  assetId?: string | null,
): ResolvedReactionAsset {
  if (assetId) {
    return {
      asset: resolveAssetById(packId, assetId),
      assetId,
    };
  }
  const asset =
    resolveAssetForRenderer("reaction_scene", semanticRole, packId) ??
    resolveAssetByRole("chemistry", semanticRole, packId) ??
    resolveAssetForRenderer("reaction_scene", semanticRole) ??
    resolveAssetByRole("chemistry", semanticRole);
  return {
    asset,
    assetId: asset?.id,
  };
}

function vectorAngle(from: [number, number], to: [number, number]): number {
  return (Math.atan2(to[1] - from[1], to[0] - from[0]) * 180) / Math.PI;
}

function vectorLength(from: [number, number], to: [number, number]): number {
  return Math.max(8, Math.hypot(to[0] - from[0], to[1] - from[1]));
}

function participantFormula(participant: ReactionParticipant): string {
  const coefficient = participant.coefficient && participant.coefficient !== 1 ? String(participant.coefficient) : "";
  return `${coefficient}${participant.formula_latex}`;
}

function displayFormula(formula: string): string {
  return formula
    .replace(/\\rightarrow/g, "->")
    .replace(/\\quad/g, " ")
    .replace(/\\/g, "");
}

function renderParticipant(participant: ReactionParticipant, role: "reactant" | "product") {
  return (
    <g
      key={participant.id}
      data-participant-id={participant.id}
      data-semantic-role={role}
      data-asset-id={participant.asset_id ?? undefined}
    >
      <rect
        x={participant.x - 10}
        y={participant.y - 10}
        width="20"
        height="20"
        rx="3"
        fill={role === "reactant" ? "#fff8e7" : "#edf9f2"}
        stroke={role === "reactant" ? "#d7a83f" : "#69a985"}
        strokeWidth="0.8"
      />
      <text x={participant.x} y={participant.y - 1.4} textAnchor="middle" fontSize="5.6" fontWeight="820" fill="#1f2937">
        {participantFormula(participant)}
      </text>
      {participant.label ? (
        <text x={participant.x} y={participant.y + 6.1} textAnchor="middle" fontSize="2.8" fontWeight="650" fill="#5b6472">
          {participant.label}
        </text>
      ) : null}
    </g>
  );
}

function renderReactionArrow(arrow: ReactionArrow, packId: string) {
  const { asset, assetId } = resolveReactionAsset(packId, arrow.semantic_role, arrow.asset_id);
  const length = vectorLength(arrow.from, arrow.to);
  const angle = vectorAngle(arrow.from, arrow.to);
  const height = 8;
  const midX = (arrow.from[0] + arrow.to[0]) / 2;
  const midY = (arrow.from[1] + arrow.to[1]) / 2;

  return (
    <g key={arrow.id} data-reaction-arrow-id={arrow.id} data-semantic-role={arrow.semantic_role}>
      <AssetSvg
        asset={asset}
        assetId={assetId ?? arrow.asset_id}
        packId={packId}
        subject="chemistry"
        semanticRole={arrow.semantic_role}
        x={arrow.from[0]}
        y={arrow.from[1] - height / 2}
        width={length}
        height={height}
        preserveAspectRatio="none"
        transform={`rotate(${angle} ${arrow.from[0]} ${arrow.from[1]})`}
      />
      {arrow.label ? (
        <text x={midX} y={midY - 7} textAnchor="middle" fontSize="3.2" fontWeight="740" fill="#536177">
          {arrow.label}
        </text>
      ) : null}
    </g>
  );
}

function renderElectronFlow(flow: ReactionElectronFlow, packId: string) {
  const { asset, assetId } = resolveReactionAsset(packId, flow.semantic_role, flow.asset_id);
  const length = vectorLength(flow.from, flow.to);
  const angle = vectorAngle(flow.from, flow.to);
  const height = 11;
  const midX = (flow.from[0] + flow.to[0]) / 2;
  const midY = (flow.from[1] + flow.to[1]) / 2;

  return (
    <g key={flow.id} data-electron-flow-id={flow.id} data-semantic-role={flow.semantic_role}>
      <AssetSvg
        asset={asset}
        assetId={assetId ?? flow.asset_id}
        packId={packId}
        subject="chemistry"
        semanticRole={flow.semantic_role}
        x={flow.from[0]}
        y={flow.from[1] - height / 2}
        width={length}
        height={height}
        preserveAspectRatio="none"
        transform={`rotate(${angle} ${flow.from[0]} ${flow.from[1]})`}
        opacity="0.9"
      />
      {flow.label ? (
        <text x={midX} y={midY - 5.6} textAnchor="middle" fontSize="2.8" fontWeight="700" fill="#7b4260">
          {flow.label}
        </text>
      ) : null}
    </g>
  );
}

function targetPoint(
  targetId: string,
  reactants: ReactionParticipant[],
  products: ReactionParticipant[],
  arrows: ReactionArrow[],
): [number, number] {
  const participant = [...reactants, ...products].find((item) => item.id === targetId);
  if (participant) return [participant.x, participant.y];

  const arrow = arrows.find((item) => item.id === targetId);
  if (arrow) return [(arrow.from[0] + arrow.to[0]) / 2, (arrow.from[1] + arrow.to[1]) / 2];

  return [50, 28];
}

function calloutAnchor(point: [number, number], callout: Molecule2DCallout): { start: [number, number]; end: [number, number]; anchor: "start" | "middle" | "end" } {
  const [x, y] = point;
  if (callout.side === "left") return { start: [x - 5, y - 4], end: [Math.max(10, x - 22), y - 15], anchor: "end" };
  if (callout.side === "right") return { start: [x + 5, y - 4], end: [Math.min(90, x + 22), y - 15], anchor: "start" };
  if (callout.side === "bottom") return { start: [x, y + 7], end: [x, Math.min(87, y + 22)], anchor: "middle" };
  return { start: [x, y - 7], end: [x, Math.max(18, y - 22)], anchor: "middle" };
}

function renderCallout(
  callout: Molecule2DCallout,
  snap: ReactionSceneSnapshot,
) {
  const point = targetPoint(callout.target_id, snap.reactants, snap.products, snap.arrows);
  const anchor = calloutAnchor(point, callout);

  return (
    <CoreCalloutLabel
      key={callout.id}
      id={callout.id}
      targetId={callout.target_id}
      label={callout.label}
      anchor={{
        x1: anchor.start[0],
        y1: anchor.start[1],
        x2: anchor.end[0],
        y2: anchor.end[1],
        textAnchor: anchor.anchor,
      }}
      rendererKind="reaction_scene"
      stroke="#64748b"
      textFill="#243447"
      dotRadius={1.1}
    />
  );
}

function renderPlusSigns(reactants: ReactionParticipant[]) {
  return reactants.slice(0, -1).map((participant, index) => {
    const next = reactants[index + 1];
    const x = (participant.x + next.x) / 2;
    const y = (participant.y + next.y) / 2;
    return (
      <text key={`${participant.id}-plus`} x={x} y={y + 1.5} textAnchor="middle" fontSize="5.5" fontWeight="740" fill="#64748b">
        +
      </text>
    );
  });
}

export const ReactionSceneRenderer: React.FC<RendererProps> = ({ step, theme }) => {
  const snap = step.snapshot as ReactionSceneSnapshot;
  const packId = snap.pack_id ?? DEFAULT_CHEMISTRY_PACK_ID;

  return (
    <div
      className="reaction-scene"
      data-theme={theme}
      data-reaction-id={snap.reaction_id}
      data-pack-id={packId}
      style={{
        width: "100%",
        height: "100%",
        boxSizing: "border-box",
        padding: 24,
        background: theme === "dark" ? "#111827" : "#f8fbff",
        color: theme === "dark" ? "#f8fafc" : "#172033",
        fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
      }}
    >
      <svg width="100%" height="100%" viewBox="0 0 100 100" role="img" aria-label={step.title}>
        <CoreLabGrid rendererKind="reaction_scene" theme={theme} lightFill="#f8fbff" />
        <text x="8" y="12" fontSize="5.6" fontWeight="780" fill={theme === "dark" ? "#f8fafc" : "#172033"}>
          {step.title}
        </text>
        <CoreFormulaTag
          id={`${snap.reaction_id}-formula`}
          text={displayFormula(snap.formula_latex ?? snap.reaction_id)}
          rendererKind="reaction_scene"
          x={30}
          y={14.2}
          width={40}
          height={7.4}
          textY={19}
          textFill="#4f6f82"
        />

        <g data-semantic-role="reaction" data-reaction-id={snap.reaction_id}>
          {snap.reactants.map((participant) => renderParticipant(participant, "reactant"))}
          {renderPlusSigns(snap.reactants)}
          {snap.arrows.map((arrow) => renderReactionArrow(arrow, packId))}
          {(snap.electron_flows ?? []).map((flow) => renderElectronFlow(flow, packId))}
          {snap.products.map((participant) => renderParticipant(participant, "product"))}
        </g>

        {(snap.callouts ?? []).map((callout) => renderCallout(callout, snap))}

        {snap.caption ? (
          <text x="50" y="94" textAnchor="middle" fontSize="3.5" fill={theme === "dark" ? "#cbd5e1" : "#52647d"}>
            {snap.caption}
          </text>
        ) : null}
      </svg>
    </div>
  );
};
