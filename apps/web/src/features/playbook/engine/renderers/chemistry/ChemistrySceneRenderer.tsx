import React from "react";

import type { ChemistrySceneSnapshot, ChemPanel } from "../../kits/chemistry/sceneTypes";
import { CHEM_STAGE_HEIGHT, CHEM_STAGE_WIDTH } from "../../kits/chemistry/sceneTypes";
import { layoutChemistryScene, type PlacedChemLabel } from "../../kits/chemistry/sceneLayout";
import { LABEL_PAD_X, LABEL_PAD_Y, type GeoText } from "../../kits/chemistry/geometry/common";
import { ELEMENT_STYLES } from "../../kits/chemistry/elements";
import { labelOpacity, morphProgress } from "../../kits/chemistry/transitions";
import type { RendererProps } from "../types";
import { chemPalette, toneColor, type ChemPalette } from "./chemPalette";
import { ChemText, CHEM_FONT_FAMILY } from "./ChemText";
import { MoleculesPanelView } from "./MoleculesPanelView";
import { ParticleGradients, ParticlesPanelView } from "./ParticlesPanelView";
import { GalvanicPanelView } from "./GalvanicPanelView";
import { TitrationPanelView } from "./TitrationPanelView";
import { ChartPanelView, EnergyPanelView } from "./ChartPanelView";
import { CardsPanelView } from "./CardsPanelView";

/**
 * Renderer for `chemistry_scene`: a full-width stage (1000 × 456 units, the
 * player's own aspect) holding side-by-side panels. Geometry, text boxes and
 * label placement all come from `layoutChemistryScene`; this component only
 * paints them and runs the step-to-step morph on the frame clock.
 */

function sameScene(prev: RendererProps["prevStep"], snap: ChemistrySceneSnapshot): ChemistrySceneSnapshot | null {
  if (!prev || prev.snapshot.kind !== "chemistry_scene") return null;
  const previous = prev.snapshot as ChemistrySceneSnapshot;
  return previous.scene_id === snap.scene_id ? previous : null;
}

function matchingPanel<T extends ChemPanel>(prev: ChemistrySceneSnapshot | null, panel: T): T | null {
  const found = prev?.panels.find((item) => item.id === panel.id && item.type === panel.type);
  return (found as T | undefined) ?? null;
}

function PanelView({ panel, prev, morph, arrowReveal, frame, palette, uid }: {
  panel: ChemPanel;
  prev: ChemPanel | null;
  morph: number;
  arrowReveal: number;
  frame: number;
  palette: ChemPalette;
  uid: string;
}) {
  switch (panel.type) {
    case "molecules":
      return <MoleculesPanelView panel={panel} prev={prev as typeof panel | null} morph={morph} arrowReveal={arrowReveal} palette={palette} uid={uid} />;
    case "particles":
      return <ParticlesPanelView panel={panel} prev={prev as typeof panel | null} morph={morph} frame={frame} palette={palette} uid={uid} />;
    case "galvanic_cell":
      return <GalvanicPanelView panel={panel} prev={prev as typeof panel | null} morph={morph} frame={frame} palette={palette} uid={uid} />;
    case "titration":
      return <TitrationPanelView panel={panel} prev={prev as typeof panel | null} morph={morph} frame={frame} palette={palette} />;
    case "chart":
      return <ChartPanelView panel={panel} prev={prev as typeof panel | null} morph={morph} palette={palette} uid={uid} />;
    case "energy_profile":
      return <EnergyPanelView panel={panel} prev={prev as typeof panel | null} morph={morph} palette={palette} uid={uid} />;
    case "cards":
      return <CardsPanelView panel={panel} prev={prev as typeof panel | null} morph={morph} palette={palette} />;
  }
}

function FixedText({ text, palette, opacity }: { text: GeoText; palette: ChemPalette; opacity: number }) {
  return (
    <g opacity={opacity}>
      {text.plate ? (
        <rect x={text.box.x} y={text.box.y} width={text.box.w} height={text.box.h} rx={4} fill={palette.plate} opacity={0.9} />
      ) : null}
      <ChemText
        id={text.id}
        text={text.text}
        x={text.x}
        y={text.y}
        fontSize={text.fontSize}
        fill={toneColor(palette, text.tone ?? "ink")}
        anchor={text.anchor}
        weight={text.weight}
      />
    </g>
  );
}

function FlexLabel({ label, palette, opacity }: { label: PlacedChemLabel; palette: ChemPalette; opacity: number }) {
  const color = toneColor(palette, label.tone);
  const start = label.leaderStart;
  const distance = Math.hypot(label.leaderEnd.x - start.x, label.leaderEnd.y - start.y);
  const showLeader = label.leader && distance > 10;
  return (
    <g opacity={opacity} data-chem-label={label.id} data-callout={label.callout ? "true" : undefined}>
      {showLeader ? (
        <g>
          <line x1={start.x} y1={start.y} x2={label.leaderEnd.x} y2={label.leaderEnd.y} stroke={color} strokeWidth={1.3} opacity={0.75} />
          <circle cx={start.x} cy={start.y} r={2.2} fill={color} />
        </g>
      ) : null}
      <rect
        x={label.box.x}
        y={label.box.y}
        width={label.box.w}
        height={label.box.h}
        rx={5}
        fill={palette.plate}
        opacity={label.callout ? 0.96 : 0.82}
        stroke={label.callout ? color : "none"}
        strokeOpacity={0.5}
        strokeWidth={1.1}
      />
      <ChemText
        text={label.text}
        x={label.box.x + LABEL_PAD_X}
        y={label.box.y + LABEL_PAD_Y + label.fontSize * 0.86}
        fontSize={label.fontSize}
        fill={color}
        weight={label.callout ? 600 : 500}
      />
    </g>
  );
}

function panelOfText(textId: string, panelIds: string[]): string | null {
  return panelIds.find((id) => textId.startsWith(`${id}:`)) ?? null;
}

export const ChemistrySceneRenderer: React.FC<RendererProps> = ({ step, prevStep, frame, stepStartFrame, theme }) => {
  const snap = step.snapshot as ChemistrySceneSnapshot;
  const palette = chemPalette(theme);
  const uid = `chem${React.useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const layout = React.useMemo(() => layoutChemistryScene(snap, step.title), [snap, step.title]);
  const prev = sameScene(prevStep, snap);
  const localFrame = Math.max(0, frame - stepStartFrame);
  const morph = prev ? morphProgress(localFrame) : 1;
  const labelsIn = prev ? labelOpacity(localFrame) : 1;
  const panelIds = snap.panels.map((panel) => panel.id);
  const entering = new Set(snap.panels.filter((panel) => prev && !matchingPanel(prev, panel)).map((panel) => panel.id));
  const leaving = prev ? prev.panels.filter((panel) => !snap.panels.some((item) => item.id === panel.id)) : [];
  const chip = layout.equationChip;
  return (
    <div
      className="chemistry-scene"
      data-theme={theme}
      data-scene-id={snap.scene_id}
      style={{ width: "100%", height: "100%", boxSizing: "border-box", fontFamily: CHEM_FONT_FAMILY }}
    >
      <svg
        width="100%"
        height="100%"
        viewBox={`0 0 ${CHEM_STAGE_WIDTH} ${CHEM_STAGE_HEIGHT}`}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={[step.title, snap.caption].filter(Boolean).join("：")}
      >
        <defs>
          <ParticleGradients elements={Object.keys(ELEMENT_STYLES)} palette={palette} uid={uid} />
        </defs>
        {leaving.map((panel) => (
          <g key={`leaving-${panel.id}`} opacity={1 - morph}>
            <PanelView panel={panel} prev={null} morph={1} arrowReveal={0} frame={frame} palette={palette} uid={uid} />
          </g>
        ))}
        {snap.panels.map((panel) => (
          <g key={panel.id} opacity={entering.has(panel.id) ? morph : 1}>
            <PanelView panel={panel} prev={matchingPanel(prev, panel)} morph={morph} arrowReveal={labelsIn} frame={frame} palette={palette} uid={uid} />
          </g>
        ))}
        {chip ? (
          <rect x={chip.x} y={chip.y} width={chip.w} height={chip.h} rx={8} fill={palette.plate} stroke={palette.line2} strokeWidth={1.2} data-equation-chip="true" />
        ) : null}
        {layout.texts.map((text) => {
          const owner = panelOfText(text.id, panelIds);
          const opacity = owner && entering.has(owner) ? morph : 1;
          return <FixedText key={text.id} text={text} palette={palette} opacity={opacity} />;
        })}
        {layout.labels.map((label) => (
          <FlexLabel key={label.id} label={label} palette={palette} opacity={labelsIn} />
        ))}
      </svg>
    </div>
  );
};
