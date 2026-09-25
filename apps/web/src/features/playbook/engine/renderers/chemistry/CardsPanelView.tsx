import React from "react";

import type { ChemCardsPanel } from "../../kits/chemistry/sceneTypes";
import { cardsLayout } from "../../kits/chemistry/geometry/cards";
import { toneColor, type ChemPalette } from "./chemPalette";

export function CardsPanelView({ panel, prev, morph, palette }: { panel: ChemCardsPanel; prev: ChemCardsPanel | null; morph: number; palette: ChemPalette }) {
  const previous = new Map((prev?.cards ?? []).map((card) => [card.id, JSON.stringify(card)]));
  return (
    <g data-chem-panel="cards" data-panel-id={panel.id}>
      {cardsLayout(panel).map(({ card, box }) => {
        const unchanged = previous.get(card.id) === JSON.stringify(card);
        const accent = card.tone && card.tone !== "ink" ? toneColor(palette, card.tone) : palette.line2;
        return (
          <g key={card.id} data-card={card.id} opacity={prev && !unchanged ? 0.35 + 0.65 * morph : 1}>
            <rect x={box.x} y={box.y} width={box.w} height={box.h} rx={10} fill={palette.plate} stroke={palette.line} strokeWidth={1.2} />
            <rect x={box.x} y={box.y + 8} width={3.5} height={box.h - 16} rx={1.75} fill={accent} />
          </g>
        );
      })}
    </g>
  );
}
