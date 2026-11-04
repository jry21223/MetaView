import { z } from "zod";
import type { ComponentContext, ComponentDefinition, LocalElement } from "../../../shared/playbook";
import { compilePrimitiveSnapshot } from "./renderBridge";
import type { AuthoringFrame, AuthoringPrimitive } from "./types";

const empty = z.object({}).strict();
const amount = z.number().finite().min(0).max(10);
const sceneConfig = z.object({ title: z.string(), description: z.string() }).strict();
interface AuthoredMark { primitive: AuthoringPrimitive; label: string; objects: string[] }
const mark = (primitive: AuthoringPrimitive, label: string, objects: string[] = []): AuthoredMark => ({ primitive, label, objects });
const label = (id: string, x: number, y: number, text: string, objects: string[] = []): AuthoredMark => mark({ elementId: id, shape: "text", x, y, text, fontSize: 16 }, text, objects);
function finish(context: ComponentContext, marks: AuthoredMark[], focusElementId: string, info: string[] = []) {
  const primitives = marks.map((entry) => entry.primitive);
  const elements: LocalElement[] = marks.map(({ primitive, label: name, objects }) => ({ id: primitive.elementId, label: name, role: primitive.shape === "text" ? "text" : "shape", objectIds: objects }));
  const output: AuthoringFrame = {
    title: String(context.config.title), description: String(context.config.description), focusElementId,
    snapshot: compilePrimitiveSnapshot(primitives), primitives, controls: [], info,
  };
  return { output, elements };
}
function scene(id: string, evaluate: ComponentDefinition<AuthoringFrame>["evaluate"]): ComponentDefinition<AuthoringFrame> {
  return { id, version: "1", kind: "scene", config: sceneConfig, state: empty, inputs: { amount }, outputs: {}, evaluate };
}
export const solarScene = scene("astronomy.solar", (context) => {
  const marks: AuthoredMark[] = [];
  const radii = [105, 168, 245, 325];
  for (const [index, radius] of radii.entries()) marks.push(mark({ elementId: `orbit-${index}`, shape: "ellipse", x: 315, y: 285, rx: radius, ry: radius * .48, rotation: -12, tone: "muted" }, `轨道 ${index + 1}`));
  marks.push(mark({ elementId: "sun", shape: "circle", x: 315, y: 285, r: 35, tone: "focus" }, "太阳", ["sun"]));
  marks.push(label("sun.label", 296, 343, "太阳", ["sun"]));
  const phase = context.frame / 900 * Number(context.inputs.amount);
  const earth = { x: 315 + Math.cos(1.1 + phase) * 168, y: 285 + Math.sin(1.1 + phase) * 81 };
  marks.push(mark({ elementId: "earth", shape: "circle", ...earth, r: 13, tone: "primary" }, "地球", ["earth"]));
  marks.push(label("earth.label", earth.x - 18, earth.y + 34, "地球", ["earth"]));
  const saturn = { x: 315 + Math.cos(-.35 + phase * .25) * 325, y: 285 + Math.sin(-.35 + phase * .25) * 156 };
  marks.push(mark({ elementId: "saturn.rings", shape: "ellipse", ...saturn, rx: 63, ry: 19, rotation: -23, tone: "secondary" }, "土星环", ["saturn"]));
  marks.push(mark({ elementId: "saturn", shape: "circle", ...saturn, r: 32, tone: "secondary" }, "土星", ["saturn"]));
  marks.push(label("saturn.label", saturn.x - 18, saturn.y + 62, "土星", ["saturn"]));
  marks.push(label("scale-note", 62, 515, "行星大小与距离为示意，非精密星历"));
  return finish(context, marks, "saturn");
});
export const ringScene = scene("astronomy.rings", (context) => {
  const marks: AuthoredMark[] = [];
  for (let index = 0; index < 8; index++) marks.push(mark({ elementId: `ring-${index}`, shape: "ellipse", x: 440, y: 285, rx: 145 + index * 13, ry: 72 + index * 6.5, tone: "muted" }, `环轨道 ${index + 1}`, ["rings"]));
  marks.push(mark({ elementId: "saturn", shape: "circle", x: 440, y: 285, r: 70, tone: "secondary" }, "土星", ["saturn"]));
  marks.push(label("saturn.label", 422, 290, "土星", ["saturn"]));
  const phase = context.frame / 900 * Number(context.inputs.amount) * Math.PI * 2;
  const inner = { x: 440 + Math.cos(phase + 2.4) * 155, y: 285 + Math.sin(phase + 2.4) * 77.5 };
  const outer = { x: 440 + Math.cos(phase * .55 + .8) * 235, y: 285 + Math.sin(phase * .55 + .8) * 117.5 };
  marks.push(mark({ elementId: "inner", shape: "circle", ...inner, r: 7, tone: "focus" }, "内环碎片", ["inner"]));
  marks.push(mark({ elementId: "outer", shape: "circle", ...outer, r: 7, tone: "primary" }, "外环碎片", ["outer"]));
  marks.push(label("inner.label", inner.x - 55, inner.y - 21, "内环碎片", ["inner"]));
  marks.push(label("outer.label", outer.x - 30, outer.y + 32, "外环碎片", ["outer"]));
  marks.push(label("scale-note", 62, 515, "运动、大小与距离为示意，非精密模拟"));
  return finish(context, marks, "saturn", ["内环碎片绕行更快，外环碎片更慢。", "调节播放速度，再选择一粒碎片继续观察。"]);
});
export const graphScene = scene("algorithm.weighted-graph", (context) => {
  const weight = Number(context.inputs.amount);
  const indirect = weight > 4;
  const tied = weight === 4;
  const a = { id: "A", x: 95, y: 340 };
  const b = { id: "B", x: 445, y: 105 };
  const c = { id: "C", x: 795, y: 340 };
  const radius = 25;
  function edge(from: typeof a, to: typeof a, active: boolean) {
    const id = `edge-${from.id.toLowerCase()}${to.id.toLowerCase()}`;
    const length = Math.hypot(to.x - from.x, to.y - from.y);
    const dx = (to.x - from.x) * radius / length;
    const dy = (to.y - from.y) * radius / length;
    return mark({
      elementId: id, shape: "line", x: from.x + dx, y: from.y + dy,
      x2: to.x - dx, y2: to.y - dy, tone: active ? "primary" : "muted",
    }, id === "edge-ac" ? "直接边 A–C" : `边 ${from.id}–${to.id}`, [id]);
  }
  const marks: AuthoredMark[] = [
    edge(a, b, indirect || tied), edge(b, c, indirect || tied), edge(a, c, !indirect),
    label("edge-ab.label", 255, 215, "2", ["edge-ab"]),
    label("edge-bc.label", 624, 215, "2", ["edge-bc"]),
    label("edge-ac.label", 440, 369, String(weight), ["edge-ac"]),
  ];
  for (const node of [a, b, c]) {
    marks.push(mark({ elementId: `node-${node.id}`, shape: "circle", x: node.x, y: node.y, r: radius, tone: "secondary" }, `节点 ${node.id}`, [`node-${node.id}`]));
    marks.push(label(`node-${node.id}.label`, node.x - 5, node.y + 5, node.id, [`node-${node.id}`]));
  }
  const summary = tied ? "直达 4  ·  经 B 也是 4" : indirect ? `直达 ${weight}  ·  经 B 只需 4` : `经 B 需要 4  ·  直达只需 ${weight}`;
  marks.push(mark({ elementId: "path-summary", shape: "text", x: 310, y: 436, text: summary, fontSize: 20 }, summary));
  const comparison = tied ? "两条路径长度相同，都是 4。" : indirect ? `经 B 的长度是 2 + 2 = 4，小于直接边的 ${weight}。` : `直接边长度是 ${weight}，小于经 B 的 4。`;
  return finish(context, marks, "edge-ac", [comparison, "改变直接边的权重，观察最短路径什么时候切换。"]);
});
export const numberControl: ComponentDefinition<AuthoringFrame> = {
  id: "control.number", version: "1", kind: "control",
  config: z.object({ componentId: z.string(), label: z.string(), min: z.number(), max: z.number(), step: z.number() }).strict(),
  state: empty, inputs: { value: amount }, outputs: { change: amount },
  evaluate: ({ config, inputs }) => ({ output: {
    primitives: [], info: [], controls: [{ componentId: String(config.componentId), portId: "change", label: String(config.label), value: Number(inputs.value), min: Number(config.min), max: Number(config.max), step: Number(config.step) }],
  }, elements: [] }),
};
export const valueInfo: ComponentDefinition<AuthoringFrame> = {
  id: "info.value", version: "1", kind: "info",
  config: z.object({ label: z.string() }).strict(), state: empty, inputs: { value: amount }, outputs: {},
  evaluate: ({ config, inputs }) => ({ output: { primitives: [], controls: [], info: [`${String(config.label)}：${Number(inputs.value)}`] }, elements: [] }),
};
