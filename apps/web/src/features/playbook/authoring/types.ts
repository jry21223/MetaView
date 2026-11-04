import type { AnySnapshot } from "../engine/types";

/** Geometry shared by preview hit surfaces; coordinates use the 1000 × 560 stage. */
export type AuthoringTone = "primary" | "secondary" | "focus" | "muted";
interface PrimitiveBase {
  elementId: string;
  opacity?: number;
}
interface ShapeBase extends PrimitiveBase { tone?: AuthoringTone }
/** Only properties supported by the established MotionScene contract are exposed. */
export type AuthoringPrimitive =
  | (ShapeBase & { shape: "circle"; x: number; y: number; r: number })
  | (ShapeBase & { shape: "ellipse"; x: number; y: number; rx: number; ry: number; rotation?: number })
  | (ShapeBase & { shape: "line"; x: number; y: number; x2: number; y2: number })
  | (ShapeBase & { shape: "polygon"; points: Array<[number, number]> })
  | (PrimitiveBase & { shape: "text"; x: number; y: number; text: string; fontSize?: 16 | 20 | 34 });
export interface AuthoringControl {
  componentId: string;
  portId: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
}
export interface AuthoringFrame {
  focusElementId?: string;
  title?: string;
  description?: string;
  snapshot?: AnySnapshot;
  primitives: AuthoringPrimitive[];
  controls: AuthoringControl[];
  info: string[];
}
