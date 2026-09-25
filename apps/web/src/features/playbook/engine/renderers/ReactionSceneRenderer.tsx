import React from "react";

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
import { chemPalette, type ChemPalette } from "./chemistry/chemPalette";
import { ChemText } from "./chemistry/ChemText";
import { chemMarkupToUnicode } from "../kits/chemistry/chemMarkup";
import type { RendererProps } from "./types";

/**
 * `reaction_scene`: a schematic reaction row from generated runs.
 *
 * Participant positions arrive in a 0–100 box laid out horizontally. The
 * canvas is widened to the stage's proportion and x is stretched across it,
 * so neighbouring participant cards (fixed width) no longer collide the way
 * the square canvas made them; colours come from the semantic tokens so the
 * dark theme stops painting light cards on a navy slab.
 */

const CANVAS_WIDTH = 178;
const X_MARGIN = 10;
const X_SCALE = (CANVAS_WIDTH - 2 * X_MARGIN) / 100;
const CARD_WIDTH = 22;
const CARD_HEIGHT = 20;

function sx(x: number): number {
  return X_MARGIN + x * X_SCALE;
}

function participantFormula(participant: ReactionParticipant): string {
  const coefficient = participant.coefficient && participant.coefficient !== 1 ? String(participant.coefficient) : "";
  return `${coefficient}${participant.formula_latex}`;
}

function displayFormula(formula: string): string {
  return chemMarkupToUnicode(formula
    .replace(/\\rightarrow/g, "→")
    .replace(/\\quad/g, " ")
    .replace(/\\/g, ""));
}

/** A participant card is washed with its role colour so it reads as a card, not an outline. */
const CARD_TINT_OPACITY = 0.16;

function renderParticipant(participant: ReactionParticipant, role: "reactant" | "product", palette: ChemPalette) {
  const x = sx(participant.x);
  const tone = role === "reactant" ? palette.secondary : palette.primary;
  const card = {
    x: x - CARD_WIDTH / 2,
    y: participant.y - CARD_HEIGHT / 2,
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    rx: 3,
  };
  return (
    <g
      key={participant.id}
      data-participant-id={participant.id}
      data-semantic-role={role}
      data-asset-id={participant.asset_id ?? undefined}
    >
      <rect {...card} fill={palette.plate} />
      <rect {...card} fill={tone} fillOpacity={CARD_TINT_OPACITY} stroke={tone} strokeWidth="0.8" />
      <ChemText text={participantFormula(participant)} x={x} y={participant.y - 0.6} fontSize={5.4} fill={palette.ink} anchor="middle" weight={700} />
      {participant.label ? (
        <text x={x} y={participant.y + 6.1} textAnchor="middle" fontSize="2.8" fontWeight="600" fill={palette.ink2}>
          {participant.label}
        </text>
      ) : null}
    </g>
  );
}

function renderReactionArrow(arrow: ReactionArrow, palette: ChemPalette, markerId: string) {
  const x1 = sx(arrow.from[0]);
  const x2 = sx(arrow.to[0]);
  const midX = (x1 + x2) / 2;
  const midY = (arrow.from[1] + arrow.to[1]) / 2;
  return (
    <g key={arrow.id} data-reaction-arrow-id={arrow.id} data-semantic-role={arrow.semantic_role}>
      <line x1={x1} y1={arrow.from[1]} x2={x2} y2={arrow.to[1]} stroke={palette.ink2} strokeWidth="1.2" strokeLinecap="round" markerEnd={`url(#${markerId})`} />
      {arrow.label ? (
        <text x={midX} y={midY - 3.6} textAnchor="middle" fontSize="3" fontWeight="650" fill={palette.ink2}>
          {arrow.label}
        </text>
      ) : null}
    </g>
  );
}

function renderElectronFlow(flow: ReactionElectronFlow, palette: ChemPalette, markerId: string) {
  const x1 = sx(flow.from[0]);
  const x2 = sx(flow.to[0]);
  const midX = (x1 + x2) / 2;
  const midY = (flow.from[1] + flow.to[1]) / 2;
  const bendY = Math.min(flow.from[1], flow.to[1]) - 10;
  return (
    <g key={flow.id} data-electron-flow-id={flow.id} data-semantic-role={flow.semantic_role}>
      <path
        d={`M ${x1} ${flow.from[1]} Q ${midX} ${bendY} ${x2} ${flow.to[1]}`}
        fill="none"
        stroke={palette.focus}
        strokeWidth="1.2"
        strokeLinecap="round"
        markerEnd={`url(#${markerId})`}
      />
      {flow.label ? (
        <ChemText text={flow.label} x={midX} y={midY - 6.4} fontSize={2.9} fill={palette.focus} anchor="middle" weight={700} />
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
  if (participant) return [sx(participant.x), participant.y];
  const arrow = arrows.find((item) => item.id === targetId);
  if (arrow) return [(sx(arrow.from[0]) + sx(arrow.to[0])) / 2, (arrow.from[1] + arrow.to[1]) / 2];
  return [CANVAS_WIDTH / 2, 28];
}

function calloutAnchor(point: [number, number], callout: Molecule2DCallout): { start: [number, number]; end: [number, number]; anchor: "start" | "middle" | "end" } {
  const [x, y] = point;
  if (callout.side === "left") return { start: [x - CARD_WIDTH / 2, y - 4], end: [Math.max(8, x - 24), y - 15], anchor: "end" };
  if (callout.side === "right") return { start: [x + CARD_WIDTH / 2, y - 4], end: [Math.min(CANVAS_WIDTH - 8, x + 24), y - 15], anchor: "start" };
  if (callout.side === "bottom") return { start: [x, y + CARD_HEIGHT / 2], end: [x, Math.min(87, y + 24)], anchor: "middle" };
  return { start: [x, y - CARD_HEIGHT / 2], end: [x, Math.max(20, y - 22)], anchor: "middle" };
}

function renderPlusSigns(reactants: ReactionParticipant[], palette: ChemPalette) {
  return reactants.slice(0, -1).map((participant, index) => {
    const next = reactants[index + 1];
    const x = (sx(participant.x) + sx(next.x)) / 2;
    const y = (participant.y + next.y) / 2;
    return (
      <text key={`${participant.id}-plus`} x={x} y={y + 1.8} textAnchor="middle" fontSize="5.5" fontWeight="600" fill={palette.ink2}>
        +
      </text>
    );
  });
}

export const ReactionSceneRenderer: React.FC<RendererProps> = ({ step, theme }) => {
  const snap = step.snapshot as ReactionSceneSnapshot;
  const palette = chemPalette(theme);
  const uid = `rx${React.useId().replace(/[^a-zA-Z0-9]/g, "")}`;

  return (
    <div
      className="reaction-scene"
      data-theme={theme}
      data-reaction-id={snap.reaction_id}
      data-pack-id={snap.pack_id ?? undefined}
      style={{
        width: "100%",
        height: "100%",
        boxSizing: "border-box",
        padding: 12,
        background: palette.surface,
        color: palette.ink,
        fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
      }}
    >
      <svg width="100%" height="100%" viewBox={`0 0 ${CANVAS_WIDTH} 100`} role="img" aria-label={step.title}>
        <defs>
          <marker id={`${uid}-arrow`} markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
            <path d="M0,0 L5,3 L0,6 Z" fill={palette.ink2} />
          </marker>
          <marker id={`${uid}-electron`} markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
            <path d="M0,0 L5,3 L0,6 Z" fill={palette.focus} />
          </marker>
        </defs>
        <CoreLabGrid rendererKind="reaction_scene" theme={theme} width={CANVAS_WIDTH} />
        <text x="8" y="11" fontSize="5" fontWeight="650" fill={palette.ink}>
          {step.title}
        </text>
        <CoreFormulaTag
          id={`${snap.reaction_id}-formula`}
          text={displayFormula(snap.formula_latex ?? snap.reaction_id)}
          rendererKind="reaction_scene"
          x={CANVAS_WIDTH - 62}
          y={5}
          width={56}
          height={7.4}
          textY={10.2}
          textFill={palette.ink}
          fill={palette.plate}
          stroke={palette.line2}
        />

        <g data-semantic-role="reaction" data-reaction-id={snap.reaction_id}>
          {snap.reactants.map((participant) => renderParticipant(participant, "reactant", palette))}
          {renderPlusSigns(snap.reactants, palette)}
          {snap.arrows.map((arrow) => renderReactionArrow(arrow, palette, `${uid}-arrow`))}
          {(snap.electron_flows ?? []).map((flow) => renderElectronFlow(flow, palette, `${uid}-electron`))}
          {snap.products.map((participant) => renderParticipant(participant, "product", palette))}
        </g>

        {(snap.callouts ?? []).map((callout) => {
          const anchor = calloutAnchor(targetPoint(callout.target_id, snap.reactants, snap.products, snap.arrows), callout);
          return (
            <CoreCalloutLabel
              key={callout.id}
              id={callout.id}
              targetId={callout.target_id}
              label={callout.label}
              anchor={{ x1: anchor.start[0], y1: anchor.start[1], x2: anchor.end[0], y2: anchor.end[1], textAnchor: anchor.anchor }}
              rendererKind="reaction_scene"
              stroke={palette.ink3}
              textFill={palette.ink}
              fill={palette.plate}
              dotRadius={1.1}
            />
          );
        })}

        {snap.caption ? (
          <text x={CANVAS_WIDTH / 2} y="94" textAnchor="middle" fontSize="3.4" fill={palette.ink2}>
            {snap.caption}
          </text>
        ) : null}
      </svg>
    </div>
  );
};
