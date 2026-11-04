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
// An oblique sheet separates the two routes in space. Displayed distances
// are arbitrary; the weights on the edges determine the comparison.
const routeSheet = mark({
  elementId: "route-sheet", shape: "polygon", tone: "primary", opacity: .54,
  points: [[56, 248], [400, 41], [942, 143], [596, 364]],
}, "路径对照平面");
export const graphScene = scene("algorithm.weighted-graph", (context) => {
  const weight = Number(context.inputs.amount);
  const a = { id: "A", x: 176, y: 231 }, b = { id: "B", x: 437, y: 93 }, c = { id: "C", x: 814, y: 172 };
  const marks = [routeSheet];
  const nodeRadius = 27;
  function edge(from: typeof a, to: typeof a, direct: boolean) {
    const id = `edge-${from.id.toLowerCase()}${to.id.toLowerCase()}`;
    const distance = Math.hypot(to.x - from.x, to.y - from.y);
    const dx = (to.x - from.x) * nodeRadius / distance;
    const dy = (to.y - from.y) * nodeRadius / distance;
    const tone = direct ? "focus" : "secondary";
    const shortest = direct ? weight <= 4 : weight >= 4;
    marks.push(mark({ elementId: id, shape: "line", x: from.x + dx, y: from.y + dy, x2: to.x - dx, y2: to.y - dy, tone, opacity: shortest ? 1 : .48 }, direct ? "直接边 A–C" : `边 ${from.id}–${to.id}`, [id]));
    const x = (from.x + to.x) / 2, y = (from.y + to.y) / 2;
    marks.push(mark({ elementId: id + ".weight", shape: "circle", x, y, r: 13, tone: direct ? "focus" : "secondary" }, `边 ${from.id}–${to.id} 的权重`, [id]));
    marks.push(mark({ elementId: id + ".label", shape: "text", x: x - 6, y: y + 7, text: String(direct ? weight : 2), fontSize: 20 }, `边权 ${direct ? weight : 2}`, [id]));
  }
  edge(a, b, false); edge(b, c, false); edge(a, c, true);
  // Both tracers spend the same time per unit of weight and wait at C.
  const elapsed = (context.frame / 24) % (Math.max(4, weight) + 1);
  function traveler(id: string, from: typeof a, to: typeof a, progress: number, direct: boolean) {
    const fraction = Math.min(progress, 1);
    marks.push(mark({ elementId: id, shape: "circle", x: from.x + (to.x - from.x) * fraction, y: from.y + (to.y - from.y) * fraction, r: 7, tone: direct ? "focus" : "primary" }, direct ? "直达路线的行进点" : "经 B 路线的行进点", direct ? ["edge-ac"] : ["edge-ab", "edge-bc"]));
  }
  traveler("traveler-direct", a, c, weight === 0 ? 1 : elapsed / weight, true);
  traveler("traveler-via", elapsed < 2 ? a : b, elapsed < 2 ? b : c, elapsed < 2 ? elapsed / 2 : (elapsed - 2) / 2, false);
  for (const node of [a, b, c]) {
    const id = "node-" + node.id;
    marks.push(mark({ elementId: id + ".stem", shape: "line", x: node.x, y: node.y + 8, x2: node.x, y2: node.y + 49, tone: "secondary" }, `节点 ${node.id} 的定位针`, [id]));
    marks.push(mark({ elementId: id, shape: "circle", x: node.x, y: node.y, r: nodeRadius, tone: "primary" }, `节点 ${node.id}`, [id]));
    marks.push(mark({ elementId: id + ".label", shape: "text", x: node.x - 12, y: node.y + 12, text: node.id, fontSize: 34 }, `节点 ${node.id} 的名称`, [id]));
    const role = node.id === "A" ? "起点" : node.id === "B" ? "中转" : "终点";
    marks.push(label(id + ".role", node.x - 16, node.y - 42, role, [id]));
  }
  const comparison = weight === 4 ? "两条路径的总权重相同。" : weight > 4 ? `经 B 的路线少 ${weight - 4} 个权重单位。` : `直达路线少 ${4 - weight} 个权重单位。`;
  const stats = [
    { id: "via", x: 62, value: 4, caption: "途经 B", expression: "A → B → C", tone: "secondary" as const, objects: ["edge-ab", "edge-bc"] },
    { id: "direct", x: 560, value: weight, caption: "直接到达", expression: "A → C", tone: "focus" as const, objects: ["edge-ac"] },
  ];
  for (const stat of stats) {
    const { id, x, value, objects } = stat;
    marks.push(mark({ elementId: "comparison-" + id, shape: "text", x, y: 520, text: String(value), fontSize: 34 }, `${stat.caption}的总权重 ${value}`, objects));
    marks.push(mark({ elementId: "comparison-" + id + ".route", shape: "text", x: x + 50, y: 483, text: stat.expression, fontSize: 20 }, stat.caption, objects));
    const result = value === Math.min(4, weight) ? weight === 4 ? "并列最短" : "当前最短" : "备选路线";
    marks.push(label("comparison-" + id + ".label", x + 50, 515, result + " · 总权重", objects));
    marks.push(mark({ elementId: "comparison-" + id + ".bar", shape: "line", x, y: 543, x2: x + value * 35, y2: 543, tone: stat.tone }, `${stat.caption}的权重刻度`, objects));
  }
  const explanation = weight === 4 ? "两条路径长度相同，都是 4。" : weight > 4 ? `经 B 的长度是 2 + 2 = 4，小于直接边的 ${weight}。` : `直接边长度是 ${weight}，小于经 B 的 4。`;
  return finish(context, marks, "edge-ac", [comparison, explanation]);
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
