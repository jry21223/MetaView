import type { ChemCard, ChemCardsPanel } from "../sceneTypes";
import type { Box } from "../labelLayout";
import { estimateChemTextWidth } from "../chemMarkup";
import { CHEM_FONT, emptyGeometry, makeText, rectShape, type GeoText, type PanelGeometry } from "./common";

/** Equation / half-reaction / readout cards stacked top-down in their panel. */

const PAD_X = 14;
const PAD_TOP = 10;
const PAD_BOTTOM = 10;
const GAP = 10;
const HEADING_STEP = 22;
const LINE_STEP = 27;
const TITLE_ZONE = 24;
/** Card lines shrink to fit their card, but never below this. */
export const MIN_CARD_FONT = 13;

/** The largest font (≤ `max`) at which `text` fits in `width`. */
export function fitFont(text: string, width: number, max: number, min = MIN_CARD_FONT, weight = 400): number {
  const perUnit = estimateChemTextWidth(text, 1, weight);
  if (perUnit <= 0) return max;
  return Math.max(min, Math.min(max, Math.floor((width / perUnit) * 10) / 10));
}

export interface CardLayout {
  card: ChemCard;
  box: Box;
  texts: GeoText[];
}

export function cardHeight(card: ChemCard): number {
  return PAD_TOP + (card.heading ? HEADING_STEP : 0) + card.lines.length * LINE_STEP + PAD_BOTTOM - 4;
}

export function cardsLayout(panel: ChemCardsPanel): CardLayout[] {
  let y = panel.rect.y + (panel.title ? TITLE_ZONE : 0);
  return panel.cards.map((card) => {
    const box: Box = { x: panel.rect.x, y, w: panel.rect.w, h: cardHeight(card) };
    const host = `${panel.id}:card:${card.id}`;
    const texts: GeoText[] = [];
    let baseline = y + PAD_TOP + 14;
    if (card.heading) {
      texts.push(makeText(`${host}:heading`, card.heading, box.x + PAD_X, baseline, {
        fontSize: fitFont(card.heading, box.w - PAD_X * 2, CHEM_FONT.cardHeading, 12, 600),
        weight: 600,
        tone: card.tone ?? "muted",
        host,
      }));
      baseline += HEADING_STEP;
    }
    const lineFont = Math.min(...card.lines.map((line) => fitFont(line, box.w - PAD_X * 2, CHEM_FONT.card)));
    card.lines.forEach((line, index) => {
      texts.push(makeText(`${host}:line:${index}`, line, box.x + PAD_X, baseline + 4, {
        fontSize: lineFont,
        host,
      }));
      baseline += LINE_STEP;
    });
    y += box.h + GAP;
    return { card, box, texts };
  });
}

export function cardsGeometry(panel: ChemCardsPanel): PanelGeometry {
  const geometry = emptyGeometry();
  for (const layout of cardsLayout(panel)) {
    geometry.shapes.push(rectShape(`${panel.id}:card:${layout.card.id}`, layout.box));
    geometry.texts.push(...layout.texts);
    geometry.anchors[layout.card.id] = { x: layout.box.x, y: layout.box.y + layout.box.h / 2, r: 0 };
  }
  if (panel.title) {
    geometry.texts.push(makeText(`${panel.id}:title`, panel.title, panel.rect.x + 4, panel.rect.y + 16, {
      fontSize: CHEM_FONT.panelTitle,
      weight: 600,
      tone: "muted",
    }));
  }
  return geometry;
}
