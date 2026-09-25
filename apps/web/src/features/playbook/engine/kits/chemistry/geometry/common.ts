/**
 * Shared vocabulary for chemistry panel geometry.
 *
 * Each panel kind has a pure `…Geometry(panel)` function that the renderer
 * draws from and the layout tests read. It publishes:
 * - `shapes`: everything drawn that text must not cover (collision obstacles);
 * - `texts`: fixed-position text, each with the box it occupies and, when it
 *   sits inside a drawn shape on purpose (a card's lines, a meter's reading),
 *   that shape's id as `host`;
 * - `anchors`: named points callouts can pin to;
 * - `requests`: flexible labels the scene layout places around their anchor.
 */

import { estimateChemTextWidth } from "../chemMarkup";
import type { Box, LabelSide, Obstacle } from "../labelLayout";
import type { ChemTone } from "../sceneTypes";

export const CHEM_FONT = {
  stageTitle: 19,
  equation: 18,
  panelTitle: 15,
  label: 16,
  small: 14,
  card: 18,
  cardHeading: 15,
  caption: 14,
} as const;

/** Line box height as a multiple of the font size. */
export const LINE_HEIGHT = 1.3;
/** Padding around a label's text inside its plate. */
export const LABEL_PAD_X = 6;
export const LABEL_PAD_Y = 3;

export interface GeoText {
  id: string;
  text: string;
  /** Baseline anchor point. */
  x: number;
  y: number;
  anchor: "start" | "middle" | "end";
  fontSize: number;
  weight?: number;
  tone?: ChemTone | null;
  /** Drawn text box (for overlap tests). */
  box: Box;
  /** Shape id this text sits inside on purpose. */
  host?: string;
  /** Draw a paper plate behind the text. */
  plate?: boolean;
}

export interface GeoAnchor {
  x: number;
  y: number;
  /** Radius of the thing anchored to; labels keep at least this far away. */
  r?: number;
}

export interface FlexLabel {
  id: string;
  text: string;
  anchor: GeoAnchor;
  prefer?: LabelSide | null;
  fontSize?: number;
  tone?: ChemTone | null;
  /** Keep the label inside this box (defaults to the stage content area). */
  bounds?: Box;
  /** Draw a leader line from the anchor to the label. */
  leader?: boolean;
}

export interface PanelGeometry {
  shapes: Obstacle[];
  texts: GeoText[];
  anchors: Record<string, GeoAnchor>;
  requests: FlexLabel[];
}

export function emptyGeometry(): PanelGeometry {
  return { shapes: [], texts: [], anchors: {}, requests: [] };
}

/** Box of a single-line label drawn with its baseline at `y`. */
export function textBox(
  text: string,
  x: number,
  y: number,
  fontSize: number,
  anchor: GeoText["anchor"],
  pad = 0,
  weight = 400,
): Box {
  const width = estimateChemTextWidth(text, fontSize, weight);
  const left = anchor === "start" ? x : anchor === "middle" ? x - width / 2 : x - width;
  // Ascent ≈ 0.8 em above the baseline, descent ≈ 0.25 em below (with scripts).
  return { x: left - pad, y: y - fontSize * 0.86 - pad, w: width + pad * 2, h: fontSize * 1.14 + pad * 2 };
}

export function makeText(
  id: string,
  text: string,
  x: number,
  y: number,
  options: Partial<Pick<GeoText, "anchor" | "fontSize" | "weight" | "tone" | "host" | "plate">> = {},
): GeoText {
  const anchor = options.anchor ?? "start";
  const fontSize = options.fontSize ?? CHEM_FONT.label;
  return {
    id,
    text,
    x,
    y,
    anchor,
    fontSize,
    weight: options.weight,
    tone: options.tone,
    host: options.host,
    plate: options.plate,
    box: textBox(text, x, y, fontSize, anchor, options.plate ? LABEL_PAD_X / 2 : 0, options.weight ?? 400),
  };
}

export function rectShape(id: string, box: Box): Obstacle {
  return { kind: "rect", id, box };
}

export function circleShape(id: string, cx: number, cy: number, r: number): Obstacle {
  return { kind: "circle", id, cx, cy, r };
}

/** A polyline as a chain of circles every `spacing` units — curves and wires. */
export function polylineShapes(
  id: string,
  points: ReadonlyArray<readonly [number, number]>,
  halfWidth: number,
  spacing = 8,
): Obstacle[] {
  const shapes: Obstacle[] = [];
  for (let i = 0; i < points.length - 1; i += 1) {
    const [x1, y1] = points[i];
    const [x2, y2] = points[i + 1];
    const length = Math.hypot(x2 - x1, y2 - y1);
    const count = Math.max(1, Math.ceil(length / spacing));
    for (let k = 0; k < count; k += 1) {
      const t = k / count;
      shapes.push(circleShape(`${id}:${i}:${k}`, x1 + (x2 - x1) * t, y1 + (y2 - y1) * t, halfWidth));
    }
  }
  const last = points.at(-1);
  if (last) shapes.push(circleShape(`${id}:end`, last[0], last[1], halfWidth));
  return shapes;
}

/** Map a canonical design box onto a rect with a uniform scale, centred. */
export interface CanonicalFrame {
  scale: number;
  ox: number;
  oy: number;
  u: (value: number) => number;
  v: (value: number) => number;
  s: (value: number) => number;
}

export function fitCanonical(rect: Box, width: number, height: number): CanonicalFrame {
  const scale = Math.min(rect.w / width, rect.h / height);
  const ox = rect.x + (rect.w - width * scale) / 2;
  const oy = rect.y + (rect.h - height * scale) / 2;
  return {
    scale,
    ox,
    oy,
    u: (value) => ox + value * scale,
    v: (value) => oy + value * scale,
    s: (value) => value * scale,
  };
}

/** The label box a `FlexLabel` needs, plate padding included. */
export function flexLabelSize(label: FlexLabel): { w: number; h: number } {
  const fontSize = label.fontSize ?? CHEM_FONT.label;
  return {
    // Callouts render semibold; size every flexible label for that.
    w: estimateChemTextWidth(label.text, fontSize, 600) + LABEL_PAD_X * 2,
    h: fontSize * 1.14 + LABEL_PAD_Y * 2,
  };
}
