/**
 * Whole-stage layout for a `chemistry_scene`: header, panels, flexible labels
 * and callouts, computed as data before anything is drawn.
 *
 * The renderer draws exactly what this returns, and the case tests run the
 * same function over every step to prove two promises the old chemistry
 * renderers broke: no text sits on a drawn shape or on other text, and
 * nothing leaves the stage.
 */

import type { ChemistrySceneSnapshot, ChemPanel, ChemTone } from "./sceneTypes";
import { CHEM_STAGE_HEIGHT, CHEM_STAGE_WIDTH } from "./sceneTypes";
import { estimateChemTextWidth, parseChemMarkup } from "./chemMarkup";
import {
  boxInside,
  boxesOverlapArea,
  obstacleOverlap,
  placeLabels,
  type Box,
  type LabelRequest,
  type Obstacle,
} from "./labelLayout";
import {
  CHEM_FONT,
  flexLabelSize,
  makeText,
  rectShape,
  type FlexLabel,
  type GeoText,
  type PanelGeometry,
} from "./geometry/common";
import { moleculesGeometry } from "./geometry/molecules";
import { fitFont } from "./geometry/cards";
import { particlesGeometry } from "./geometry/particles";
import { galvanicGeometry } from "./geometry/galvanic";
import { titrationGeometry } from "./geometry/titration";
import { chartGeometry, energyGeometry } from "./geometry/chart";
import { cardsGeometry } from "./geometry/cards";

export const CHEM_STAGE: Box = { x: 0, y: 0, w: CHEM_STAGE_WIDTH, h: CHEM_STAGE_HEIGHT };
/** Where panels and labels may go: below the header, above the caption. */
export const CHEM_CONTENT: Box = { x: 8, y: 46, w: CHEM_STAGE_WIDTH - 16, h: CHEM_STAGE_HEIGHT - 46 - 28 };

export function panelGeometry(panel: ChemPanel): PanelGeometry {
  switch (panel.type) {
    case "molecules":
      return moleculesGeometry(panel);
    case "particles":
      return particlesGeometry(panel);
    case "galvanic_cell":
      return galvanicGeometry(panel);
    case "titration":
      return titrationGeometry(panel);
    case "chart":
      return chartGeometry(panel);
    case "energy_profile":
      return energyGeometry(panel);
    case "cards":
      return cardsGeometry(panel);
  }
}

export interface PlacedChemLabel {
  id: string;
  text: string;
  fontSize: number;
  tone: ChemTone;
  box: Box;
  anchor: { x: number; y: number };
  /** Where the leader leaves the target: on its rim, so the line never covers the thing it names. */
  leaderStart: { x: number; y: number };
  leaderEnd: { x: number; y: number };
  leader: boolean;
  overlap: number;
  /** Callout labels get a plate and a leader; panel labels sit bare. */
  callout: boolean;
}

export interface ChemSceneLayout {
  panels: Map<string, PanelGeometry>;
  /** Header chip, panel shapes: everything text must avoid. */
  shapes: Obstacle[];
  /** Fixed text: header, caption and every panel's own text. */
  texts: GeoText[];
  /** Placed flexible labels and callouts. */
  labels: PlacedChemLabel[];
  /** Callout targets that no panel publishes. */
  unresolved: string[];
  equationChip: Box | null;
}

function headerTexts(snapshot: ChemistrySceneSnapshot, title: string | null): { texts: GeoText[]; chip: Box | null } {
  const texts: GeoText[] = [];
  let chip: Box | null = null;
  let titleRight = 20;
  if (title) {
    const text = makeText("stage:title", title, 20, 30, { fontSize: CHEM_FONT.stageTitle, weight: 600 });
    texts.push(text);
    titleRight = text.box.x + text.box.w;
  }
  if (snapshot.equation) {
    // The chip takes what the title leaves, shrinking its font to fit.
    const room = CHEM_STAGE_WIDTH - 20 - (titleRight + 24) - 24;
    const fontSize = fitFont(snapshot.equation, room, CHEM_FONT.equation, 12, 600);
    const width = estimateChemTextWidth(snapshot.equation, fontSize, 600);
    chip = { x: CHEM_STAGE_WIDTH - 20 - width - 24, y: 10, w: width + 24, h: 30 };
    // Anchored at the right edge so any font drift grows inward, never off stage.
    texts.push(makeText("stage:equation", snapshot.equation, chip.x + chip.w - 12, 31, {
      anchor: "end",
      fontSize,
      weight: 600,
      host: "stage:equation-chip",
    }));
  }
  if (snapshot.caption) {
    texts.push(makeText("stage:caption", snapshot.caption, 20, CHEM_STAGE_HEIGHT - 10, { fontSize: CHEM_FONT.caption, tone: "muted" }));
  }
  return { texts, chip };
}

function rimPoint(anchor: { x: number; y: number }, r: number, toward: { x: number; y: number }): { x: number; y: number } {
  const dx = toward.x - anchor.x;
  const dy = toward.y - anchor.y;
  const length = Math.hypot(dx, dy);
  if (r <= 0 || length <= r + 2) return anchor;
  return { x: anchor.x + (dx / length) * (r + 2), y: anchor.y + (dy / length) * (r + 2) };
}

function toRequest(label: FlexLabel): LabelRequest {
  const size = flexLabelSize(label);
  return {
    id: label.id,
    anchor: { x: label.anchor.x, y: label.anchor.y },
    w: size.w,
    h: size.h,
    prefer: label.prefer,
    clearance: label.anchor.r ?? 0,
    bounds: label.bounds,
  };
}

export function layoutChemistryScene(snapshot: ChemistrySceneSnapshot, title: string | null = null): ChemSceneLayout {
  const panels = new Map<string, PanelGeometry>();
  const shapes: Obstacle[] = [];
  const header = headerTexts(snapshot, title);
  const texts: GeoText[] = [...header.texts];
  if (header.chip) shapes.push(rectShape("stage:equation-chip", header.chip));
  const flex: FlexLabel[] = [];
  for (const panel of snapshot.panels) {
    const geometry = panelGeometry(panel);
    panels.set(panel.id, geometry);
    shapes.push(...geometry.shapes);
    texts.push(...geometry.texts);
    flex.push(...geometry.requests);
  }

  const unresolved: string[] = [];
  const callouts: FlexLabel[] = [];
  for (const callout of snapshot.callouts ?? []) {
    const [panelId, anchorId] = callout.target.split("/");
    const anchor = panels.get(panelId)?.anchors[anchorId];
    if (!anchor) {
      unresolved.push(callout.target);
      continue;
    }
    callouts.push({
      id: `callout:${callout.id}`,
      text: callout.text,
      anchor,
      prefer: callout.prefer,
      fontSize: CHEM_FONT.label,
      tone: callout.tone ?? "ink",
      leader: true,
    });
  }

  const ordered = [...flex, ...callouts];
  const reserved = texts.map((text) => text.box);
  const placed = placeLabels(ordered.map(toRequest), shapes, CHEM_CONTENT, reserved);
  const labels: PlacedChemLabel[] = placed.map((label, index) => {
    const source = ordered[index];
    return {
      id: label.id,
      text: source.text,
      fontSize: source.fontSize ?? CHEM_FONT.label,
      tone: source.tone ?? "ink",
      box: label.box,
      anchor: label.anchor,
      leaderStart: rimPoint(label.anchor, source.anchor.r ?? 0, label.leaderEnd),
      leaderEnd: label.leaderEnd,
      leader: Boolean(source.leader),
      overlap: label.overlap,
      callout: source.id.startsWith("callout:"),
    };
  });
  return { panels, shapes, texts, labels, unresolved, equationChip: header.chip };
}

export interface LayoutProblem {
  kind: "text-on-shape" | "text-on-text" | "text-overflow" | "label-overlap" | "off-stage" | "unresolved-target" | "raw-markup";
  id: string;
  other?: string;
}

const TOUCH_TOLERANCE = 0.5;

function significant(area: number): boolean {
  return area > TOUCH_TOLERANCE;
}

/**
 * Everything wrong with a layout, as data: text over a shape it does not
 * live in, text over text, a label the placer could not clear, anything
 * outside the stage, or a callout aimed at nothing.
 */
/** Markup the typesetter could not consume (e.g. a subscript nested in a superscript) would be drawn literally. */
function leavesRawMarkup(text: string): boolean {
  return parseChemMarkup(text).some((segment) => /[_^{}]/.test(segment.text));
}

export function chemistryLayoutProblems(layout: ChemSceneLayout): LayoutProblem[] {
  const problems: LayoutProblem[] = [];
  for (const target of layout.unresolved) problems.push({ kind: "unresolved-target", id: target });
  for (const item of [...layout.texts, ...layout.labels]) {
    if (leavesRawMarkup(item.text)) problems.push({ kind: "raw-markup", id: item.id });
  }
  const hosts = new Map(layout.shapes.filter((shape) => shape.kind === "rect").map((shape) => [shape.id, shape]));
  layout.texts.forEach((text, index) => {
    if (!boxInside(text.box, CHEM_STAGE)) problems.push({ kind: "off-stage", id: text.id });
    const host = text.host ? hosts.get(text.host) : undefined;
    if (host?.kind === "rect" && !boxInside(text.box, host.box, 1)) problems.push({ kind: "text-overflow", id: text.id, other: host.id });
    for (const shape of layout.shapes) {
      if (text.host && (shape.id === text.host || shape.id.startsWith(`${text.host}:`))) continue;
      if (significant(obstacleOverlap(shape, text.box))) {
        problems.push({ kind: "text-on-shape", id: text.id, other: shape.id });
        break;
      }
    }
    for (const other of layout.texts.slice(index + 1)) {
      if (significant(boxesOverlapArea(text.box, other.box))) problems.push({ kind: "text-on-text", id: text.id, other: other.id });
    }
  });
  for (const label of layout.labels) {
    if (label.overlap > TOUCH_TOLERANCE) problems.push({ kind: "label-overlap", id: label.id });
    if (!boxInside(label.box, CHEM_STAGE)) problems.push({ kind: "off-stage", id: label.id });
  }
  return problems;
}
