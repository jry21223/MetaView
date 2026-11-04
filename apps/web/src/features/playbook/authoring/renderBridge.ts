import { z } from "zod";
import type { ResolvedWork } from "../../../shared/playbook";
import type { MotionObject, MotionSceneSnapshot, MotionStyle } from "../engine/motion/types";
import type { PlaybookScript } from "../engine/types";
import type { AuthoringFrame, AuthoringPrimitive, AuthoringTone } from "./types";

function motionStyle(tone: AuthoringTone | undefined): MotionStyle {
  return tone === "focus" ? "accent" : tone ?? "primary";
}
const coordinate = z.number().finite();
const dimensions = coordinate.positive();
const base = { elementId: z.string().min(1), opacity: z.number().min(0).max(1).optional() };
const shapeBase = { ...base, tone: z.enum(["primary", "secondary", "focus", "muted"]).optional() };
const primitiveSchema = z.discriminatedUnion("shape", [
  z.object({ ...shapeBase, shape: z.literal("circle"), x: coordinate, y: coordinate, r: dimensions }).strict(),
  z.object({ ...shapeBase, shape: z.literal("ellipse"), x: coordinate, y: coordinate, rx: dimensions, ry: dimensions, rotation: coordinate.optional() }).strict(),
  z.object({ ...shapeBase, shape: z.literal("line"), x: coordinate, y: coordinate, x2: coordinate, y2: coordinate }).strict(),
  z.object({ ...shapeBase, shape: z.literal("polygon"), points: z.array(z.tuple([coordinate, coordinate])).min(3).max(2000) }).strict(),
  z.object({ ...base, shape: z.literal("text"), x: coordinate, y: coordinate, text: z.string().max(20000), fontSize: z.union([z.literal(16), z.literal(20), z.literal(34)]).optional() }).strict(),
]);
/** Compile authored geometry into the existing rendering contract, never a second renderer. */
export function compilePrimitiveSnapshot(primitives: readonly AuthoringPrimitive[]): MotionSceneSnapshot {
  const validated = z.array(primitiveSchema).max(5000).parse(primitives);
  const objects: MotionObject[] = validated.map((primitive): MotionObject => {
    if (primitive.shape === "text") return { id: primitive.elementId, type: "text", x: primitive.x, y: primitive.y, text: primitive.text, style: primitive.fontSize === 34 ? "title" : primitive.fontSize === 20 ? "label" : "caption" };
    const common = { id: primitive.elementId, style: motionStyle(primitive.tone) };
    switch (primitive.shape) {
      case "circle": return { ...common, type: "point", x: primitive.x, y: primitive.y, r: primitive.r };
      case "line": return { ...common, type: "segment", x1: primitive.x, y1: primitive.y, x2: primitive.x2, y2: primitive.y2 };
      case "polygon": return { ...common, type: "polygon", points: primitive.points };
      case "ellipse": {
        const angle = (primitive.rotation ?? 0) * Math.PI / 180;
        const points = Array.from({ length: 80 }, (_, index): [number, number] => {
          const phase = index / 80 * Math.PI * 2;
          const x = primitive.rx * Math.cos(phase);
          const y = primitive.ry * Math.sin(phase);
          return [primitive.x + x * Math.cos(angle) - y * Math.sin(angle), primitive.y + x * Math.sin(angle) + y * Math.cos(angle)];
        });
        return { ...common, type: "polygon", points };
      }
    }
  });
  return {
    kind: "motion_scene",
    viewport: { width: 1000, height: 560, world: { xMin: 0, xMax: 1000, yMin: 0, yMax: 560 } },
    objects,
    tracks: validated.filter((primitive) => primitive.opacity !== undefined).map((primitive) => ({
      target: primitive.elementId, property: "opacity", keyframes: [{ t: 0, value: primitive.opacity! }, { t: 1, value: primitive.opacity! }],
    })),
  };
}
export function compileAuthoringScript(work: ResolvedWork<AuthoringFrame>, title = "交互探索"): PlaybookScript {
  const frames = work.components.flatMap((entry) => entry.output ? [entry.output] : []);
  const snapshots = frames.flatMap((frame) => frame.snapshot ? [frame.snapshot] : []);
  if (!snapshots.length) throw new Error("The work has no renderable scene");
  const actualTitle = frames.find((frame) => frame.title)?.title ?? title;
  return {
    schema_version: "1.0.0", domain: "general", fps: 30, total_frames: 300,
    title: actualTitle, summary: frames.find((frame) => frame.description)?.description ?? "",
    parameter_controls: [],
    steps: [{
      step_id: work.state.sceneId, end_frame: 300, title: actualTitle,
      voiceover_text: "", tokens: [], snapshot: snapshots[0],
      layers: snapshots.map((body, index) => ({ id: `scene-${index}`, body, timing: { enter_at: 0, exit_at: 1, appear_anim: "none", z_order: index } })),
    }],
  };
}
