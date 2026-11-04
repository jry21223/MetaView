import { createRegistry, type ExplorationProvider, type ExplorationReply, type ExplorationRequest, type PlaybookDocument } from "../../../shared/playbook";
import { graphScene, numberControl, ringScene, solarScene, valueInfo } from "./exampleKits";
import type { AuthoringFrame } from "./types";

export const exampleRegistry = createRegistry<AuthoringFrame>([solarScene, ringScene, graphScene, numberControl, valueInfo]);
interface DocumentOptions { id: string; title: string; description: string; definition: string; value: number; label: string; min: number; max: number; step: number; objects: PlaybookDocument["objects"] }
function createExampleDocument(options: DocumentOptions): PlaybookDocument {
  return {
    schemaVersion: "1", ref: { playbookId: options.id, revisionId: "r1" }, title: options.title,
    scenes: [{ id: "main", componentIds: ["scene", "control", "info"] }],
    components: [
      { id: "scene", definition: { id: options.definition, version: "1" }, kind: "scene", config: { title: options.title, description: options.description }, initialState: {}, inputs: { amount: "amount" } },
      { id: "control", definition: { id: "control.number", version: "1" }, kind: "control", config: { componentId: "control", label: options.label, min: options.min, max: options.max, step: options.step }, initialState: {}, inputs: { value: "amount" } },
      { id: "info", definition: { id: "info.value", version: "1" }, kind: "info", config: { label: options.label }, initialState: {}, inputs: { value: "amount" } },
    ],
    parameters: { amount: { type: "number", initial: options.value, min: options.min, max: options.max } },
    bindings: [{ componentId: "control", portId: "change", parameterId: "amount" }],
    objects: options.objects, assets: [],
  };
}
const solarObjects = [
  { id: "sun", label: "太阳", description: "太阳系的恒星" },
  { id: "earth", label: "地球", description: "绕太阳公转的行星" },
  { id: "saturn", label: "土星", description: "具有由独立绕行碎片构成的环的行星" },
];
const ringObjects = [
  solarObjects[2],
  { id: "rings", label: "土星环", description: "由许多独立绕行的碎片构成的环" },
  { id: "inner", label: "内环碎片", description: "较内侧轨道上的碎片" },
  { id: "outer", label: "外环碎片", description: "较外侧轨道上的碎片" },
];
const graphObjects = [
  { id: "edge-ab", label: "边 A–B", description: "权重为 2" },
  { id: "edge-bc", label: "边 B–C", description: "权重为 2" },
  { id: "edge-ac", label: "直接边 A–C", description: "连接 A 和 C 的可调权重边" },
  ...["A", "B", "C"].map((id) => ({ id: `node-${id}`, label: `节点 ${id}`, description: "加权无向图中的节点" })),
];
export const solarDocument = createExampleDocument({ id: "solar-system", title: "太阳系观测站", description: "选择一个元素，沿着好奇心继续。", definition: "astronomy.solar", value: 1, label: "播放速度", min: .25, max: 3, step: .25, objects: solarObjects });
export const graphDocument = createExampleDocument({ id: "weighted-graph", title: "最短路径观测站", description: "一条更直接的边，一定是更短的路吗？", definition: "algorithm.weighted-graph", value: 5, label: "直接边 A–C 的权重", min: 1, max: 9, step: 1, objects: graphObjects });

export interface AuthoringExample {
  id: string;
  title: string;
  document: PlaybookDocument;
  defaultElementId: string;
  prompt: string;
  hints: string[];
  provider: ExplorationProvider;
}
/** Offline fixture adapter. Its content is intentionally outside the domain-neutral runtime. */
function fixtureProvider(options: {
  prompt: string;
  objectId: string;
  reply: (request: ExplorationRequest) => ExplorationReply;
  child: (request: ExplorationRequest) => PlaybookDocument;
}): ExplorationProvider {
  return {
    async respond(request) {
      if (request.prompt !== options.prompt || !request.objects.some((object) => object.id === options.objectId)) {
        throw new Error("此离线样例仅预置了当前建议问题；尚未连接真实 AI。");
      }
      return options.reply(request);
    },
    async build({ request, proposal }) {
      const expected = options.reply(request).proposal;
      if (!expected || proposal.id !== expected.id) throw new Error("Unknown offline proposal");
      return options.child(request);
    },
  };
}
const solarPrompt = "土星环为什么不会散开？";
const graphPrompt = "为什么最短路径不走这条边？";
export const exampleCatalog: AuthoringExample[] = [
  {
    id: "solar", title: "太阳系", document: solarDocument, defaultElementId: "saturn", prompt: solarPrompt,
    hints: [solarPrompt, "如何改变这个对象的表现？", "从这个元素继续探索"],
    provider: fixtureProvider({
      prompt: solarPrompt, objectId: "saturn",
      reply: () => ({
        paragraphs: ["环不是一整块圆盘，而是许多冰与岩石碎片。每一粒都受土星引力束缚，沿自己的轨道绕行。", "靠内的碎片绕得更快，外侧更慢。它们并非静止悬着，也不是永远不变。"],
        references: [{ label: "NASA · Cassini", url: "https://science.nasa.gov/mission/cassini/faq/" }],
        proposal: { id: "ring-orbits", title: "土星环：每一粒都在绕行", summary: "观察两粒碎片，对照内外环的绕行节奏。", capabilities: ["选择内、外两粒碎片", "改变播放速度", "保留返回太阳系的路径"] },
      }),
      child: (request) => createExampleDocument({ id: `ring-orbits-${request.id.slice(0, 90)}`, title: "土星环：每一粒都在绕行", description: "它们看似一体，实际各自绕行。", definition: "astronomy.rings", value: Number(request.context.state.parameters.amount), label: "播放速度", min: .25, max: 3, step: .25, objects: ringObjects }),
    }),
  },
  {
    id: "graph", title: "图算法", document: graphDocument, defaultElementId: "edge-ac", prompt: graphPrompt,
    hints: [graphPrompt, "如何改变这条边的权重？", "从这条边继续探索"],
    provider: fixtureProvider({
      prompt: graphPrompt, objectId: "edge-ac",
      reply: (request) => {
        const weight = Number(request.context.state.parameters.amount);
        const comparison = weight > 4 ? `直接边 A–C 的权重是 ${weight}，而经过 B 的路线是 2 + 2 = 4，所以最短路径选择 A → B → C。` : weight === 4 ? "现在两条路径长度相同，都是 4。最短路径不再唯一。" : `现在直接边 A–C 的权重是 ${weight}，比经过 B 的 4 更小，所以最短路径已经改为 A → C。`;
        return {
          paragraphs: [comparison, "最短路径比较的是权重总和。你可以改变直接边的权重，观察路径何时切换。"],
          proposal: { id: "edge-weight-lab", title: "边权实验室", summary: "改变 A–C 的权重，让两条候选路线在同一张图中对照。", capabilities: ["调整直接边的权重", "观察最短路径切换与等长情况", "返回原图保留提问和参数"] },
        };
      },
      child: (request) => createExampleDocument({ id: `edge-weight-lab-${request.id.slice(0, 85)}`, title: "边权实验室", description: "改变一条边，看最短路径怎样变化。", definition: "algorithm.weighted-graph", value: Number(request.context.state.parameters.amount), label: "直接边 A–C 的权重", min: 1, max: 9, step: 1, objects: graphObjects }),
    }),
  },
];
export type { AuthoringFrame, AuthoringPrimitive, AuthoringControl } from "./types";
