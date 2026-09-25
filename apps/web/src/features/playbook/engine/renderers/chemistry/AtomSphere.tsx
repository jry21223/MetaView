import React from "react";

import { elementStyle } from "../../kits/chemistry/elements";
import type { ChemTone } from "../../kits/chemistry/sceneTypes";
import { sphereColors, toneColor, type ChemPalette } from "./chemPalette";
import { CHEM_FONT_FAMILY, ChemText } from "./ChemText";

interface AtomSphereProps {
  gradientId: string;
  palette: ChemPalette;
  element: string;
  cx: number;
  cy: number;
  r: number;
  depth?: number;
  isotope?: number | null;
  charge?: number | null;
  /** A previous charge fading out while `charge` fades in. */
  previousCharge?: number | null;
  chargeMix?: number;
  tone?: ChemTone | null;
  opacity?: number;
  showSymbol?: boolean;
  /** Smallest radius that still gets its element symbol (canvas units). */
  minSymbolRadius?: number;
  atomId?: string;
}

/** Radial-gradient stops for one sphere; rendered inside the scene's <defs>. */
export function SphereGradient({ id, palette, element, depth = 1 }: { id: string; palette: ChemPalette; element: string; depth?: number }) {
  const colors = sphereColors(palette, element, depth);
  return (
    <radialGradient id={id} cx="0.36" cy="0.3" r="0.78" fx="0.32" fy="0.26">
      <stop offset="0" stopColor={colors.highlight} />
      <stop offset="0.48" stopColor={colors.base} />
      <stop offset="1" stopColor={colors.shade} />
    </radialGradient>
  );
}

function chargeText(charge: number): string {
  const sign = charge > 0 ? "+" : "−";
  const magnitude = Math.abs(charge);
  return magnitude === 1 ? sign : `${magnitude}${sign}`;
}

function ChargeBadge({ cx, cy, r, charge, palette, opacity }: { cx: number; cy: number; r: number; charge: number; palette: ChemPalette; opacity: number }) {
  const text = chargeText(charge);
  const color = charge > 0 ? palette.focus : palette.primary;
  return (
    <g opacity={opacity} data-charge={charge}>
      <circle cx={cx} cy={cy} r={r} fill={palette.plate} stroke={color} strokeWidth={Math.max(1.2, r * 0.16)} />
      <text
        x={cx}
        y={cy + r * 0.36}
        textAnchor="middle"
        fontSize={text.length > 1 ? r * 0.95 : r * 1.25}
        fontWeight={700}
        fill={color}
        fontFamily={CHEM_FONT_FAMILY}
      >
        {text}
      </text>
    </g>
  );
}

/** One shaded atom: sphere, element symbol, isotope mark and charge badge. */
export function AtomSphere({
  gradientId,
  palette,
  element,
  cx,
  cy,
  r,
  depth = 1,
  isotope,
  charge,
  previousCharge,
  chargeMix = 1,
  tone,
  opacity = 1,
  showSymbol = true,
  minSymbolRadius = 8,
  atomId,
}: AtomSphereProps) {
  const colors = sphereColors(palette, element, depth);
  const style = elementStyle(element);
  const symbolColor = palette.theme === "dark" ? style.symbolOnDark : style.symbolOnLight;
  const label = isotope ? `^{${isotope}}${element}` : element;
  const symbolSize = Math.min(22, Math.max(minSymbolRadius * 1.1, r * (isotope ? 0.78 : element.length > 1 ? 0.82 : 0.98)));
  const badgeR = Math.max(7, r * 0.42);
  const badgeX = cx + r * 0.78;
  const badgeY = cy - r * 0.78;
  return (
    <g opacity={opacity} data-atom-id={atomId} data-element={element} data-isotope={isotope ?? undefined}>
      {tone === "focus" ? (
        <circle cx={cx} cy={cy} r={r + Math.max(3, r * 0.2)} fill="none" stroke={toneColor(palette, "focus")} strokeWidth={Math.max(2, r * 0.12)} opacity={0.9} />
      ) : null}
      <circle cx={cx} cy={cy} r={r} fill={`url(#${gradientId})`} stroke={colors.rim} strokeWidth={Math.max(0.8, r * 0.05)} />
      {showSymbol && r >= minSymbolRadius ? (
        <ChemText
          text={label}
          x={cx}
          y={cy + symbolSize * 0.36}
          fontSize={symbolSize}
          fill={symbolColor}
          anchor="middle"
          weight={650}
        />
      ) : null}
      {previousCharge ? (
        <ChargeBadge cx={badgeX} cy={badgeY} r={badgeR} charge={previousCharge} palette={palette} opacity={1 - chargeMix} />
      ) : null}
      {charge ? <ChargeBadge cx={badgeX} cy={badgeY} r={badgeR} charge={charge} palette={palette} opacity={previousCharge !== undefined ? chargeMix : 1} /> : null}
    </g>
  );
}
