/**
 * Element palette and display radii for the chemistry renderers.
 *
 * Colours follow the CPK / Jmol convention every chemistry textbook uses
 * (hydrogen white, carbon grey, oxygen red, nitrogen blue, chlorine green…),
 * desaturated a step so a sphere reads as a teaching model on the paper
 * canvas rather than a neon toy (DESIGN.md §3). These are data-semantic
 * colours and live at the renderer boundary as named constants, as
 * DESIGN.md §16.1 allows; the dark variants keep the same hue family and
 * lift lightness so atoms stay distinct on the dark canvas.
 *
 * Radii are display radii in ångström, not physical ones: ball-and-stick
 * shrinks atoms so bonds stay visible; space-filling uses a compact ~55–60 %
 * of the van der Waals radius, so bonded neighbours still overlap the way a
 * model kit does while a whole mechanism stays readable on one stage.
 */

export interface ElementStyle {
  /** Sphere base colour, light theme. */
  light: string;
  /** Sphere base colour, dark theme. */
  dark: string;
  /** Ball-and-stick radius (Å). */
  ballRadius: number;
  /** Space-filling radius (Å). */
  fillRadius: number;
  /** Symbol colour drawn on the sphere. */
  symbolOnLight: string;
  symbolOnDark: string;
  /** Chinese element name, for legends and aria labels. */
  name: string;
}

const DARK_INK = "#1d2320";
const LIGHT_INK = "#f6f4ee";

export const ELEMENT_STYLES: Readonly<Record<string, ElementStyle>> = Object.freeze({
  H: { light: "#f1f0ea", dark: "#e4e8e4", ballRadius: 0.27, fillRadius: 0.62, symbolOnLight: DARK_INK, symbolOnDark: DARK_INK, name: "氢" },
  C: { light: "#5f6662", dark: "#8b938e", ballRadius: 0.38, fillRadius: 0.9, symbolOnLight: LIGHT_INK, symbolOnDark: DARK_INK, name: "碳" },
  N: { light: "#4a6fcf", dark: "#7f9be6", ballRadius: 0.37, fillRadius: 0.86, symbolOnLight: LIGHT_INK, symbolOnDark: DARK_INK, name: "氮" },
  O: { light: "#d24a3e", dark: "#ec7a6d", ballRadius: 0.37, fillRadius: 0.84, symbolOnLight: LIGHT_INK, symbolOnDark: DARK_INK, name: "氧" },
  S: { light: "#d2ad32", dark: "#e3c35a", ballRadius: 0.45, fillRadius: 0.94, symbolOnLight: DARK_INK, symbolOnDark: DARK_INK, name: "硫" },
  Cl: { light: "#43a152", dark: "#72c27f", ballRadius: 0.46, fillRadius: 0.91, symbolOnLight: LIGHT_INK, symbolOnDark: DARK_INK, name: "氯" },
  I: { light: "#7b3a8c", dark: "#b27cc2", ballRadius: 0.56, fillRadius: 1.03, symbolOnLight: LIGHT_INK, symbolOnDark: DARK_INK, name: "碘" },
  Na: { light: "#8d63c6", dark: "#b495e0", ballRadius: 0.5, fillRadius: 0.98, symbolOnLight: LIGHT_INK, symbolOnDark: DARK_INK, name: "钠" },
  K: { light: "#7a4fb3", dark: "#a98ad6", ballRadius: 0.56, fillRadius: 1.04, symbolOnLight: LIGHT_INK, symbolOnDark: DARK_INK, name: "钾" },
  Zn: { light: "#7c82ad", dark: "#a4a9cc", ballRadius: 0.5, fillRadius: 0.85, symbolOnLight: LIGHT_INK, symbolOnDark: DARK_INK, name: "锌" },
  Cu: { light: "#c0783a", dark: "#dc9a5e", ballRadius: 0.5, fillRadius: 0.85, symbolOnLight: LIGHT_INK, symbolOnDark: DARK_INK, name: "铜" },
  Fe: { light: "#c5633b", dark: "#df8a66", ballRadius: 0.5, fillRadius: 0.85, symbolOnLight: LIGHT_INK, symbolOnDark: DARK_INK, name: "铁" },
  Pt: { light: "#a3a8a4", dark: "#c4c9c5", ballRadius: 0.5, fillRadius: 0.85, symbolOnLight: DARK_INK, symbolOnDark: DARK_INK, name: "铂" },
});

const FALLBACK_STYLE: ElementStyle = {
  light: "#9aa39d",
  dark: "#b8c0ba",
  ballRadius: 0.42,
  fillRadius: 0.9,
  symbolOnLight: DARK_INK,
  symbolOnDark: DARK_INK,
  name: "",
};

export function elementStyle(element: string): ElementStyle {
  return ELEMENT_STYLES[element] ?? FALLBACK_STYLE;
}

/** Colour of an element in a theme. */
export function elementColor(element: string, theme: "light" | "dark"): string {
  const style = elementStyle(element);
  return theme === "dark" ? style.dark : style.light;
}

function parseHex(hex: string): [number, number, number] {
  const value = hex.replace("#", "");
  return [0, 2, 4].map((offset) => parseInt(value.slice(offset, offset + 2), 16)) as [number, number, number];
}

function toHex(channels: [number, number, number]): string {
  return `#${channels.map((c) => Math.round(Math.max(0, Math.min(255, c))).toString(16).padStart(2, "0")).join("")}`;
}

/**
 * Mix `hex` toward `target` by `amount` (0–1). Done in JS rather than CSS
 * `color-mix()` so gradient stops are plain colours in every render path.
 */
export function mixHex(hex: string, target: string, amount: number): string {
  const a = parseHex(hex);
  const b = parseHex(target);
  return toHex([0, 1, 2].map((i) => a[i] + (b[i] - a[i]) * amount) as [number, number, number]);
}
