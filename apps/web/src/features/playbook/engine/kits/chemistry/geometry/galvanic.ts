import type { ChemGalvanicPanel, ChemHalfCell, ChemIonRoute } from "../sceneTypes";
import type { Box } from "../labelLayout";
import {
  CHEM_FONT,
  circleShape,
  emptyGeometry,
  fitCanonical,
  makeText,
  polylineShapes,
  rectShape,
  type CanonicalFrame,
  type GeoText,
  type PanelGeometry,
} from "./common";

/**
 * Galvanic-cell apparatus drawn from a canonical design box, scaled uniformly
 * into the panel rect. Two layouts: the single beaker of the opening
 * experiment (zinc strip straight in copper sulfate) and the classic two
 * half-cells joined by a wire, a meter and a salt bridge.
 */

type Point = [number, number];

export interface BeakerShape {
  /** Outer glass box: rim at the top, open. */
  glass: Box;
  /** Liquid box inside the glass. */
  liquid: Box;
}

export interface ElectrodeShape {
  element: string;
  /** Unworn electrode box. */
  body: Box;
  /** Box after wear (narrower, same centre). */
  worn: Box;
  /** Part below the liquid line, where a deposit can grow. */
  submergedTop: number;
}

export interface GalvanicLayout {
  frame: CanonicalFrame;
  beakers: BeakerShape[];
  electrodes: ElectrodeShape[];
  wire: Point[][];
  meter: { cx: number; cy: number; r: number } | null;
  bridge: Point[] | null;
  bridgeWidth: number;
  routes: Partial<Record<ChemIonRoute, Point[][]>>;
  electronPath: Point[];
  texts: GeoText[];
}

const TWO = { W: 540, H: 380 };
const ONE = { W: 360, H: 380 };

function wornBox(body: Box, wear: number): Box {
  const w = body.w * (1 - 0.55 * Math.max(0, Math.min(1, wear)));
  return { x: body.x + (body.w - w) / 2, y: body.y, w, h: body.h };
}

function electrodeText(
  panelId: string,
  side: "left" | "right" | "single",
  cell: ChemHalfCell,
  frame: CanonicalFrame,
  x: number,
  y: number,
  anchor: GeoText["anchor"],
): GeoText[] {
  const texts = [
    makeText(`${panelId}:${side}:electrode`, cell.electrode_label, frame.u(x), frame.v(y), {
      anchor,
      fontSize: CHEM_FONT.label,
      weight: 600,
    }),
  ];
  if (cell.role) {
    texts.push(makeText(`${panelId}:${side}:role`, cell.role === "negative" ? "负极" : "正极", frame.u(x), frame.v(y + 21), {
      anchor,
      fontSize: CHEM_FONT.small,
      weight: 600,
      tone: cell.role === "negative" ? "focus" : "primary",
    }));
  }
  return texts;
}

function mapPoints(frame: CanonicalFrame, points: Point[]): Point[] {
  return points.map(([u, v]) => [frame.u(u), frame.v(v)]);
}

function mapBox(frame: CanonicalFrame, box: Box): Box {
  return { x: frame.u(box.x), y: frame.v(box.y), w: frame.s(box.w), h: frame.s(box.h) };
}

function twoBeakerLayout(panel: ChemGalvanicPanel): GalvanicLayout {
  const frame = fitCanonical(panel.rect, TWO.W, TWO.H);
  const right = panel.right ?? panel.left;
  const beaker = (x: number): BeakerShape => ({
    glass: mapBox(frame, { x, y: 150, w: 192, h: 186 }),
    liquid: mapBox(frame, { x: x + 3, y: 172, w: 186, h: 161 }),
  });
  const electrode = (x: number, cell: ChemHalfCell): ElectrodeShape => {
    const body = mapBox(frame, { x, y: 92, w: 24, h: 208 });
    return { element: cell.electrode, body, worn: wornBox(body, cell.wear ?? 0), submergedTop: frame.v(172) };
  };
  const ys = [206, 246, 286];
  const routes: GalvanicLayout["routes"] = {
    left_out: ys.map((y) => mapPoints(frame, [[150, y], [190, y + 14]])),
    left_in: ys.map((y) => mapPoints(frame, [[96, y], [122, y]])),
    right_out: ys.map((y) => mapPoints(frame, [[418, y], [458, y + 14]])),
    right_in: ys.map((y) => mapPoints(frame, [[462, y], [418, y]])),
    // Ions leave the open end of the bridge and fan out into the solution:
    // one lane passes under the electrode, one rises beside it.
    bridge_to_left: [
      mapPoints(frame, [[204, 304], [172, 318], [100, 324]]),
      mapPoints(frame, [[200, 300], [180, 286], [168, 232]]),
    ],
    bridge_to_right: [
      mapPoints(frame, [[336, 304], [368, 318], [440, 324]]),
      mapPoints(frame, [[340, 300], [360, 286], [372, 232]]),
    ],
  };
  const wire: Point[][] = [
    mapPoints(frame, [[136, 92], [136, 34], [246, 34]]),
    mapPoints(frame, [[294, 34], [404, 34], [404, 92]]),
  ];
  const flowRight = (panel.electron_flow ?? "none") !== "right_to_left";
  const electronPath = mapPoints(frame, flowRight
    ? [[136, 92], [136, 34], [404, 34], [404, 92]]
    : [[404, 92], [404, 34], [136, 34], [136, 92]]);
  const texts: GeoText[] = [
    ...electrodeText(panel.id, "left", panel.left, frame, 114, 112, "end"),
    ...electrodeText(panel.id, "right", right, frame, 426, 112, "start"),
    makeText(`${panel.id}:left:solution`, panel.left.solution, frame.u(136), frame.v(364), { anchor: "middle", fontSize: CHEM_FONT.small, tone: "muted" }),
    makeText(`${panel.id}:right:solution`, right.solution, frame.u(404), frame.v(364), { anchor: "middle", fontSize: CHEM_FONT.small, tone: "muted" }),
  ];
  if (panel.salt_bridge) {
    texts.push(makeText(`${panel.id}:bridge`, `盐桥（${panel.salt_bridge.cation.replace("+", "")}${panel.salt_bridge.anion.replace("-", "")}）`, frame.u(270), frame.v(124) - frame.s(10) - 6, {
      anchor: "middle",
      fontSize: CHEM_FONT.small,
      tone: "muted",
    }));
  }
  if (panel.meter) {
    texts.push(makeText(`${panel.id}:meter`, panel.meter.reading, frame.u(270), frame.v(58) + 19, {
      anchor: "middle",
      fontSize: CHEM_FONT.label,
      weight: 600,
    }));
  }
  if ((panel.electron_flow ?? "none") !== "none") {
    texts.push(makeText(`${panel.id}:electrons`, flowRight ? "e^- →" : "← e^-", frame.u(190), frame.v(22), {
      anchor: "middle",
      fontSize: CHEM_FONT.small,
      weight: 600,
      tone: "focus",
    }));
  }
  return {
    frame,
    beakers: [beaker(40), beaker(308)],
    electrodes: [electrode(124, panel.left), electrode(392, right)],
    wire,
    meter: panel.meter ? { cx: frame.u(270), cy: frame.v(34), r: frame.s(24) } : null,
    bridge: panel.salt_bridge ? mapPoints(frame, [[206, 300], [206, 124], [334, 124], [334, 300]]) : null,
    bridgeWidth: frame.s(20),
    routes,
    electronPath,
    texts,
  };
}

function singleBeakerLayout(panel: ChemGalvanicPanel): GalvanicLayout {
  const frame = fitCanonical(panel.rect, ONE.W, ONE.H);
  const body = mapBox(frame, { x: 168, y: 70, w: 24, h: 230 });
  const ys = [206, 246, 286];
  return {
    frame,
    beakers: [{
      glass: mapBox(frame, { x: 70, y: 150, w: 220, h: 186 }),
      liquid: mapBox(frame, { x: 73, y: 172, w: 214, h: 161 }),
    }],
    electrodes: [{ element: panel.left.electrode, body, worn: wornBox(body, panel.left.wear ?? 0), submergedTop: frame.v(172) }],
    wire: [],
    meter: null,
    bridge: null,
    bridgeWidth: 0,
    routes: {
      left_out: ys.map((y) => mapPoints(frame, [[166, y], [118, y + 12]])),
      left_in: ys.map((y) => mapPoints(frame, [[252, y], [196, y]])),
    },
    electronPath: [],
    texts: [
      ...electrodeText(panel.id, "single", panel.left, frame, 202, 94, "start"),
      makeText(`${panel.id}:single:solution`, panel.left.solution, frame.u(180), frame.v(364), { anchor: "middle", fontSize: CHEM_FONT.small, tone: "muted" }),
    ],
  };
}

export function galvanicLayout(panel: ChemGalvanicPanel): GalvanicLayout {
  return panel.mode === "single_beaker" ? singleBeakerLayout(panel) : twoBeakerLayout(panel);
}

export function galvanicGeometry(panel: ChemGalvanicPanel): PanelGeometry {
  const geometry = emptyGeometry();
  const layout = galvanicLayout(panel);
  layout.beakers.forEach((beaker, index) => {
    geometry.shapes.push(rectShape(`${panel.id}:beaker:${index}`, beaker.glass));
  });
  layout.electrodes.forEach((electrode, index) => {
    geometry.shapes.push(rectShape(`${panel.id}:electrode:${index}`, electrode.body));
  });
  layout.wire.forEach((segment, index) => {
    geometry.shapes.push(...polylineShapes(`${panel.id}:wire:${index}`, segment, layout.frame.s(5)));
  });
  if (layout.meter) {
    geometry.shapes.push(circleShape(`${panel.id}:meter`, layout.meter.cx, layout.meter.cy, layout.meter.r + 2));
    geometry.anchors.meter = { x: layout.meter.cx, y: layout.meter.cy, r: layout.meter.r };
  }
  if (layout.bridge) {
    geometry.shapes.push(...polylineShapes(`${panel.id}:bridge`, layout.bridge, layout.bridgeWidth / 2 + 2, 10));
    geometry.anchors.bridge = { x: (layout.bridge[1][0] + layout.bridge[2][0]) / 2, y: layout.bridge[1][1], r: layout.bridgeWidth / 2 };
  }
  const [leftElectrode, rightElectrode] = layout.electrodes;
  geometry.anchors.left_electrode = { x: leftElectrode.body.x + leftElectrode.body.w / 2, y: leftElectrode.submergedTop + 40 * layout.frame.scale, r: leftElectrode.body.w / 2 };
  if (rightElectrode) {
    geometry.anchors.right_electrode = { x: rightElectrode.body.x + rightElectrode.body.w / 2, y: rightElectrode.submergedTop + 40 * layout.frame.scale, r: rightElectrode.body.w / 2 };
  }
  layout.beakers.forEach((beaker, index) => {
    geometry.anchors[index === 0 ? "left_solution" : "right_solution"] = {
      x: beaker.liquid.x + beaker.liquid.w / 2,
      y: beaker.liquid.y + beaker.liquid.h * 0.6,
      r: 0,
    };
  });
  if (layout.wire.length > 0) {
    geometry.anchors.wire = { x: layout.frame.u(190), y: layout.frame.v(34), r: 4 };
  }
  geometry.texts.push(...layout.texts);
  if (panel.title) {
    geometry.texts.push(makeText(`${panel.id}:title`, panel.title, panel.rect.x + 4, panel.rect.y + 16, {
      fontSize: CHEM_FONT.panelTitle,
      weight: 600,
      tone: "muted",
    }));
  }
  return geometry;
}
