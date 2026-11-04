import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createRegistry, createRuntime, type ComponentDefinition, type PlaybookDocument } from "./index";

const number = z.number().finite();
const scene: ComponentDefinition<number> = {
  id: "test.scene", version: "1", kind: "scene",
  config: z.object({}).strict(), state: z.object({}).strict(),
  inputs: { amount: number }, outputs: {},
  evaluate: ({ inputs }) => ({ output: Number(inputs.amount), elements: [
    { id: "shape", label: "Shape", role: "shape", objectIds: ["object"] },
    { id: "label", label: "Label", role: "text", objectIds: [] },
  ] }),
};
const control: ComponentDefinition<number> = {
  id: "test.control", version: "1", kind: "control",
  config: z.object({}).strict(), state: z.object({}).strict(),
  inputs: {}, outputs: { change: number },
  evaluate: () => ({ elements: [] }),
};
function document(): PlaybookDocument {
  return {
    schemaVersion: "1", ref: { playbookId: "work", revisionId: "r1" }, title: "Work",
    scenes: [{ id: "main", componentIds: ["scene", "control"] }],
    components: [
      { id: "scene", definition: { id: "test.scene", version: "1" }, kind: "scene", config: {}, initialState: {}, inputs: { amount: "amount" } },
      { id: "control", definition: { id: "test.control", version: "1" }, kind: "control", config: {}, initialState: {}, inputs: {} },
    ],
    parameters: { amount: { type: "number", initial: 2, min: 0, max: 10 } },
    bindings: [{ componentId: "control", portId: "change", parameterId: "amount" }],
    objects: [{ id: "object", label: "Object", description: "A knowledge object" }], assets: [],
  };
}
const registry = () => createRegistry([scene, control]);

describe("composable playbook runtime", () => {
  it("connects a control to a scene without either knowing the other", () => {
    const runtime = createRuntime(document(), registry());
    runtime.dispatch({ type: "emit", componentId: "control", portId: "change", value: 7 });
    expect(runtime.read().components.find((entry) => entry.id === "scene")?.output).toBe(7);
  });
});

it("rejects malformed documents, dependency mismatches and invalid initial values before loading", () => {
  for (const change of [
    (doc: PlaybookDocument) => { doc.components.push(doc.components[0]); },
    (doc: PlaybookDocument) => { doc.components[0].definition.version = "missing"; },
    (doc: PlaybookDocument) => { doc.components[0].kind = "info"; },
    (doc: PlaybookDocument) => { doc.scenes[0].componentIds.push("missing"); },
    (doc: PlaybookDocument) => { doc.components[0].inputs.amount = "missing"; },
    (doc: PlaybookDocument) => { doc.parameters.amount.initial = 100; },
    (doc: PlaybookDocument) => { doc.components[0].config = { html: "<script>" }; },
  ]) {
    const doc = document(); change(doc);
    expect(() => createRuntime(doc, registry())).toThrow();
  }
});

it("rejects an invalid parameter update atomically", () => {
  const runtime = createRuntime(document(), registry());
  expect(() => runtime.dispatch({ type: "emit", componentId: "control", portId: "change", value: 100 })).toThrow();
  expect(runtime.read().state.parameters.amount).toBe(2);
});

it("restores the exact visible state from a detached serialized snapshot", () => {
  const runtime = createRuntime(document(), registry());
  const label = runtime.read().elements.find((entry) => entry.id === "label")!.ref;
  runtime.dispatch({ type: "emit", componentId: "control", portId: "change", value: 7 });
  runtime.dispatch({ type: "seek", sceneId: "main", frame: 42 });
  runtime.dispatch({ type: "view", view: { zoom: 2 } });
  runtime.dispatch({ type: "select", elements: [label] });
  const captured = runtime.capture("snapshot");
  runtime.dispatch({ type: "emit", componentId: "control", portId: "change", value: 1 });
  runtime.restore(JSON.parse(JSON.stringify(captured)));
  expect(runtime.read().state).toEqual({
    sceneId: "main", frame: 42, view: { zoom: 2 }, parameters: { amount: 7 },
    componentStates: { scene: {}, control: {} }, selection: [label],
  });
  captured.state.parameters.amount = 9;
  expect(runtime.read().state.parameters.amount).toBe(7);
});

it("rejects stale element references and forged snapshots without changing state", () => {
  const runtime = createRuntime(document(), registry());
  const ref = runtime.read().elements[0].ref;
  expect(() => runtime.dispatch({ type: "select", elements: [{ ...ref, revisionId: "r0" }] })).toThrow();
  expect(() => runtime.dispatch({ type: "select", elements: [{ ...ref, elementId: "deleted" }] })).toThrow();
  const snapshot = runtime.capture("snapshot");
  snapshot.state.componentStates.extra = {};
  expect(() => runtime.restore(snapshot)).toThrow();
  expect(runtime.read().state.selection).toEqual([]);
});

it("does not expose mutable state to callers or installed evaluators", () => {
  const mutable: ComponentDefinition<number> = { ...scene, evaluate: (context) => {
    context.state.surprise = true;
    return { output: 1, elements: [] };
  } };
  const doc = document();
  const runtime = createRuntime(doc, createRegistry([mutable, control]));
  const read = runtime.read(); read.state.parameters.amount = 10;
  runtime.read();
  expect(runtime.capture("snapshot").state.componentStates.scene).toEqual({});
  expect(runtime.read().state.parameters.amount).toBe(2);
  expect(doc.components[0].initialState).toEqual({});
});

it("checks inactive consumers before committing a shared parameter change", () => {
  const narrow: ComponentDefinition<number> = {
    ...scene, id: "test.narrow", inputs: { amount: z.number().max(5) },
  };
  const doc = document();
  doc.components.push({ ...doc.components[0], id: "narrow", definition: { id: "test.narrow", version: "1" } });
  doc.scenes.push({ id: "other", componentIds: ["narrow"] });
  const runtime = createRuntime(doc, createRegistry([scene, control, narrow]));
  expect(() => runtime.dispatch({ type: "emit", componentId: "control", portId: "change", value: 7 })).toThrow();
  expect(runtime.read().state.parameters.amount).toBe(2);
  expect(() => runtime.dispatch({ type: "seek", sceneId: "other", frame: 0 })).not.toThrow();
});

it("rejects sparse-array length before serializing it into a large document", () => {
  const doc = document();
  const sparse: null[] = []; sparse.length = 1_000_000;
  doc.components[0].config = { sparse };
  expect(() => createRuntime(doc, registry())).toThrow(/budget|Sparse/);
});

it("stops a wide container at its budget without reading later properties", () => {
  const wide: Record<string, number> = {};
  for (let index = 0; index < 50_001; index++) wide[`item${index}`] = index;
  Object.defineProperty(wide, "later", { enumerable: true, get() { throw new Error("Read past the budget"); } });
  const doc = document(); doc.components[0].config = { wide };
  expect(() => createRuntime(doc, registry())).toThrow(/budget/);
});
