import type { ChemTitrationPanel } from "../sceneTypes";
import type { Box } from "../labelLayout";
import {
  CHEM_FONT,
  emptyGeometry,
  fitCanonical,
  makeText,
  rectShape,
  type CanonicalFrame,
  type GeoText,
  type PanelGeometry,
} from "./common";

/** Titration rig: stand, burette with a real 0–50 mL scale, conical flask, pH meter. */

const W = 380;
const H = 400;
const SCALE_TOP = 30;
const UNITS_PER_ML = 4;

export interface TitrationLayout {
  frame: CanonicalFrame;
  stand: { base: Box; rod: Box; clamp: Box };
  burette: Box;
  /** Stage y of the liquid surface for a dispensed volume. */
  levelY: (dispensedMl: number) => number;
  scaleBottomY: number;
  ticks: Array<{ ml: number; y: number; major: boolean }>;
  stopcock: Box;
  tip: [number, number][];
  tipEnd: [number, number];
  flask: [number, number][];
  flaskLiquid: [number, number][];
  liquidTopY: number;
  meter: Box;
  texts: GeoText[];
}

function mapBox(frame: CanonicalFrame, box: Box): Box {
  return { x: frame.u(box.x), y: frame.v(box.y), w: frame.s(box.w), h: frame.s(box.h) };
}

function fixed(value: number, digits: number): string {
  return value.toFixed(digits);
}

export function titrationLayout(panel: ChemTitrationPanel): TitrationLayout {
  const frame = fitCanonical(panel.rect, W, H);
  const map = (points: Array<[number, number]>): Array<[number, number]> => points.map(([u, v]) => [frame.u(u), frame.v(v)]);
  const capacity = panel.capacity_ml;
  const levelY = (ml: number) => frame.v(SCALE_TOP + Math.max(0, Math.min(capacity, ml)) * UNITS_PER_ML * (50 / capacity));
  const ticks = Array.from({ length: capacity / 5 + 1 }, (_, index) => {
    const ml = index * 5;
    return { ml, y: levelY(ml), major: ml % 10 === 0 };
  });
  const texts: GeoText[] = [
    ...ticks.filter((tick) => tick.major).map((tick) => makeText(`${panel.id}:tick:${tick.ml}`, String(tick.ml), frame.u(116), tick.y + 4, {
      anchor: "end",
      fontSize: 12,
      tone: "muted",
    })),
    makeText(`${panel.id}:titrant`, panel.titrant, frame.u(152), frame.v(46), { fontSize: CHEM_FONT.small, weight: 600 }),
    makeText(`${panel.id}:analyte`, panel.analyte, frame.u(204), frame.v(344), { fontSize: CHEM_FONT.small, weight: 600 }),
  ];
  if (panel.indicator) {
    texts.push(makeText(`${panel.id}:indicator`, `指示剂：${panel.indicator}`, frame.u(204), frame.v(366), { fontSize: CHEM_FONT.small, tone: "muted" }));
  }
  const meter = mapBox(frame, { x: 232, y: 206, w: 136, h: 84 });
  texts.push(makeText(`${panel.id}:meter:label`, "pH 计", frame.u(244), frame.v(228), { fontSize: 12, tone: "muted", host: `${panel.id}:meter` }));
  if (panel.ph !== null && panel.ph !== undefined) {
    texts.push(makeText(`${panel.id}:meter:value`, fixed(panel.ph, 2), frame.u(300), frame.v(272), {
      anchor: "middle",
      fontSize: 30,
      weight: 600,
      host: `${panel.id}:meter`,
    }));
  }
  texts.push(makeText(`${panel.id}:volume`, `已滴入 ${fixed(panel.dispensed_ml, 2)} mL`, frame.u(300), frame.v(312), {
    anchor: "middle",
    fontSize: CHEM_FONT.small,
    tone: "muted",
  }));
  return {
    frame,
    stand: {
      base: mapBox(frame, { x: 30, y: 384, w: 220, h: 10 }),
      rod: mapBox(frame, { x: 44, y: 16, w: 8, h: 368 }),
      clamp: mapBox(frame, { x: 48, y: 86, w: 74, h: 8 }),
    },
    burette: mapBox(frame, { x: 122, y: 16, w: 20, h: 236 }),
    levelY,
    scaleBottomY: levelY(capacity),
    ticks,
    stopcock: mapBox(frame, { x: 114, y: 252, w: 36, h: 9 }),
    tip: map([[124, 261], [140, 261], [134, 292], [130, 292]]),
    tipEnd: [frame.u(132), frame.v(292)],
    flask: map([[116, 298], [148, 298], [148, 318], [194, 382], [70, 382], [116, 318]]),
    flaskLiquid: map([[97.5, 346], [166.5, 346], [190, 379], [74, 379]]),
    liquidTopY: frame.v(346),
    meter,
    texts,
  };
}

export function titrationGeometry(panel: ChemTitrationPanel): PanelGeometry {
  const geometry = emptyGeometry();
  const layout = titrationLayout(panel);
  const { frame } = layout;
  geometry.shapes.push(
    rectShape(`${panel.id}:base`, layout.stand.base),
    rectShape(`${panel.id}:rod`, layout.stand.rod),
    rectShape(`${panel.id}:clamp`, layout.stand.clamp),
    rectShape(`${panel.id}:burette`, { ...layout.burette, h: layout.burette.h + frame.s(40) }),
    rectShape(`${panel.id}:stopcock`, layout.stopcock),
    rectShape(`${panel.id}:flask`, { x: frame.u(70), y: frame.v(298), w: frame.s(124), h: frame.s(84) }),
    rectShape(`${panel.id}:meter`, layout.meter),
  );
  geometry.anchors.burette_tip = { x: layout.tipEnd[0], y: layout.tipEnd[1], r: 2 };
  geometry.anchors.burette_level = { x: frame.u(132), y: layout.levelY(panel.dispensed_ml), r: frame.s(10) };
  geometry.anchors.flask = { x: frame.u(132), y: frame.v(366), r: frame.s(20) };
  geometry.anchors.meter = { x: layout.meter.x + layout.meter.w / 2, y: layout.meter.y, r: 0 };
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
