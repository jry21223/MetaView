/**
 * Pseudo-3D projection for molecule panels.
 *
 * The camera turns the model by yaw (about +y) and then pitch (about +x), the
 * same Euler order Chemiation uses, and maps it onto the panel with a mild
 * perspective: atoms nearer the viewer grow a little and farther ones shrink,
 * so depth reads without a vanishing point distorting bond angles. Everything
 * here is a pure function of the snapshot, so the browser, the Remotion
 * export and the layout tests see the same pixels.
 */

import type { ChemAtom, ChemMoleculesPanel } from "./sceneTypes";
import { elementStyle } from "./elements";

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** Size gain per ångström toward the viewer. */
export const PERSPECTIVE_PER_ANGSTROM = 0.045;

const DEG = Math.PI / 180;

export function rotateYawPitch(point: Vec3, yawDeg: number, pitchDeg: number): Vec3 {
  const yaw = yawDeg * DEG;
  const pitch = pitchDeg * DEG;
  const x1 = point.x * Math.cos(yaw) + point.z * Math.sin(yaw);
  const z1 = -point.x * Math.sin(yaw) + point.z * Math.cos(yaw);
  const y2 = point.y * Math.cos(pitch) - z1 * Math.sin(pitch);
  const z2 = point.y * Math.sin(pitch) + z1 * Math.cos(pitch);
  return { x: x1, y: y2, z: z2 };
}

export interface ProjectedAtom {
  id: string;
  atom: ChemAtom;
  /** Stage coordinates of the sphere centre. */
  sx: number;
  sy: number;
  /** Stage radius after perspective. */
  r: number;
  /** Rotated z in ångström (larger = nearer). */
  depth: number;
  /** 0 (farthest atom in the panel) … 1 (nearest). */
  depthNorm: number;
}

export function atomDisplayRadius(atom: Pick<ChemAtom, "element">, style: "ball_stick" | "space_fill"): number {
  const element = elementStyle(atom.element);
  return style === "space_fill" ? element.fillRadius : element.ballRadius;
}

function boundsCenter(points: Vec3[]): Vec3 {
  if (points.length === 0) return { x: 0, y: 0, z: 0 };
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const zs = points.map((p) => p.z);
  return {
    x: (Math.min(...xs) + Math.max(...xs)) / 2,
    y: (Math.min(...ys) + Math.max(...ys)) / 2,
    z: (Math.min(...zs) + Math.max(...zs)) / 2,
  };
}

/** Project every atom of a molecules panel into stage space. */
export function projectMoleculesPanel(panel: ChemMoleculesPanel): ProjectedAtom[] {
  const yaw = panel.view?.yaw ?? 0;
  const pitch = panel.view?.pitch ?? 0;
  const style = panel.style ?? "ball_stick";
  const center = panel.center ?? boundsCenter(panel.atoms);
  const cx = panel.rect.x + panel.rect.w / 2;
  const cy = panel.rect.y + panel.rect.h / 2;
  const rotated = panel.atoms.map((atom) =>
    rotateYawPitch({ x: atom.x - center.x, y: atom.y - center.y, z: atom.z - center.z }, yaw, pitch),
  );
  const depths = rotated.map((p) => p.z);
  const minDepth = Math.min(...depths);
  const maxDepth = Math.max(...depths);
  const span = maxDepth - minDepth;
  return panel.atoms.map((atom, index) => {
    const p = rotated[index];
    const gain = 1 + p.z * PERSPECTIVE_PER_ANGSTROM;
    return {
      id: atom.id,
      atom,
      sx: cx + p.x * panel.scale * gain,
      sy: cy - p.y * panel.scale * gain,
      r: atomDisplayRadius(atom, style) * panel.scale * gain,
      depth: p.z,
      depthNorm: span > 1e-6 ? (p.z - minDepth) / span : 0.5,
    };
  });
}
