import { z } from "zod";
import type { ComponentRegistry } from "./registry";
import type { JsonValue, Parameter, PlaybookDocument } from "./types";

/** Identifiers are addresses, never property paths or executable expressions. */
export const identifier = z.string().min(1).max(120).regex(/^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/)
  .refine((value) => !["__proto__", "constructor", "prototype"].includes(value));
const text = z.string().max(20_000);
export const revisionSchema = z.object({ playbookId: identifier, revisionId: identifier }).strict();
export const elementRefSchema = revisionSchema.extend({ sceneId: identifier, componentId: identifier, elementId: identifier }).strict();

/** Check before cloning or recursive schema parsing; cycles and oversized data fail closed. */
export function copyData<T>(value: T): T {
  const pending: Array<{ value: unknown; depth: number }> = [{ value, depth: 0 }];
  let count = 0;
  let bytes = 0;
  while (pending.length) {
    const item = pending.pop()!;
    if (++count > 50_000 || item.depth > 48) throw new Error("Playbook data budget exceeded");
    const data = item.value;
    if (typeof data === "number" && !Number.isFinite(data)) throw new Error("Non-finite number");
    if (data === null || typeof data === "boolean" || typeof data === "number") continue;
    if (typeof data === "string") {
      bytes += data.length;
    } else if (typeof data === "object" && (Array.isArray(data) || Object.getPrototypeOf(data) === Object.prototype || Object.getPrototypeOf(data) === null)) {
      // Never materialize Object.entries() for an unbounded container first.
      if (Array.isArray(data) && data.length > 50_000 - count - pending.length) {
        throw new Error("Playbook data budget exceeded");
      }
      let arrayEntries = 0;
      for (const key in data) {
        if (!Object.prototype.hasOwnProperty.call(data, key)) continue;
        if (count + pending.length >= 50_000) throw new Error("Playbook data budget exceeded");
        const descriptor = Object.getOwnPropertyDescriptor(data, key)!;
        if (!("value" in descriptor)) throw new Error("Only JSON data properties are allowed");
        if (Array.isArray(data)) {
          if (!/^(0|[1-9][0-9]*)$/.test(key) || Number(key) >= data.length) throw new Error("Invalid array property");
          arrayEntries++;
        }
        bytes += key.length;
        if (bytes > 2_000_000) throw new Error("Playbook data budget exceeded");
        pending.push({ value: descriptor.value, depth: item.depth + 1 });
      }
      if (Array.isArray(data) && arrayEntries !== data.length) throw new Error("Sparse arrays are not JSON data");
    } else throw new Error("Only JSON data is allowed");
    if (bytes > 2_000_000) throw new Error("Playbook data budget exceeded");
  }
  return JSON.parse(JSON.stringify(value)) as T;
}
const jsonValue = z.custom<JsonValue>((value) => {
  try { copyData(value); return true; } catch { return false; }
}, "Expected bounded JSON data");
export const jsonObjectSchema = z.record(identifier, jsonValue);
const parameterSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("number"), initial: z.number().finite(), min: z.number().finite(), max: z.number().finite() }).strict(),
  z.object({ type: z.literal("string"), initial: z.string().max(2000), options: z.array(z.string().max(2000)).min(1).max(500) }).strict(),
  z.object({ type: z.literal("boolean"), initial: z.boolean() }).strict(),
]);
const componentSchema = z.object({
  id: identifier,
  definition: z.object({ id: identifier, version: identifier }).strict(),
  kind: z.enum(["scene", "control", "info"]),
  config: jsonObjectSchema, initialState: jsonObjectSchema,
  inputs: z.record(identifier, identifier),
}).strict();
const documentSchema = z.object({
  schemaVersion: z.literal("1"), ref: revisionSchema, title: text.min(1),
  scenes: z.array(z.object({ id: identifier, componentIds: z.array(identifier).min(1).max(1000) }).strict()).min(1).max(100),
  components: z.array(componentSchema).min(1).max(1000),
  parameters: z.record(identifier, parameterSchema),
  bindings: z.array(z.object({ componentId: identifier, portId: identifier, parameterId: identifier }).strict()).max(2000),
  objects: z.array(z.object({ id: identifier, label: text, description: text }).strict()).max(5000),
  assets: z.array(z.object({ id: identifier, digest: z.string().regex(/^sha256:[a-f0-9]{64}$/) }).strict()).max(1000),
}).strict();
export function unique(ids: string[], name: string) {
  if (new Set(ids).size !== ids.length) throw new Error(`Duplicate ${name}`);
}
export function sameKeys(actual: object, expected: object) {
  const keys = Object.keys(actual).sort();
  if (JSON.stringify(keys) !== JSON.stringify(Object.keys(expected).sort())) throw new Error("Mismatched declared keys");
}
export function parameterValue(parameter: Parameter, value: JsonValue): JsonValue {
  if (parameter.type === "number" && typeof value === "number" && Number.isFinite(value) && value >= parameter.min && value <= parameter.max) return value;
  if (parameter.type === "string" && typeof value === "string" && parameter.options.includes(value)) return value;
  if (parameter.type === "boolean" && typeof value === "boolean") return value;
  throw new Error("Invalid parameter value");
}
export function loadDocument<T>(input: unknown, registry: ComponentRegistry<T>): PlaybookDocument {
  const document = documentSchema.parse(copyData(input));
  unique(document.scenes.map((entry) => entry.id), "scene");
  unique(document.components.map((entry) => entry.id), "component");
  unique(document.objects.map((entry) => entry.id), "object");
  unique(document.assets.map((entry) => entry.id), "asset");
  for (const parameter of Object.values(document.parameters)) parameterValue(parameter, parameter.initial);
  const instances = new Map(document.components.map((instance) => [instance.id, instance]));
  const placed = new Set<string>();
  for (const scene of document.scenes) {
    unique(scene.componentIds, "scene placement");
    for (const id of scene.componentIds) {
      if (!instances.has(id)) throw new Error(`Missing component: ${id}`);
      placed.add(id);
    }
  }
  if (placed.size !== instances.size) throw new Error("Unplaced component");
  for (const instance of document.components) {
    const definition = registry.get(instance.definition);
    if (definition.kind !== instance.kind) throw new Error("Component kind mismatch");
    instance.config = copyData(definition.config.parse(instance.config));
    instance.initialState = copyData(definition.state.parse(instance.initialState));
    sameKeys(instance.inputs, definition.inputs);
    for (const [name, id] of Object.entries(instance.inputs)) {
      const parameter = document.parameters[id];
      if (!parameter) throw new Error(`Missing parameter: ${id}`);
      definition.inputs[name].parse(parameter.initial);
    }
  }
  unique(document.bindings.map((entry) => JSON.stringify([entry.componentId, entry.portId, entry.parameterId])), "binding");
  for (const binding of document.bindings) {
    const instance = instances.get(binding.componentId);
    const parameter = document.parameters[binding.parameterId];
    if (!instance || !parameter) throw new Error("Dangling binding");
    const output = registry.get(instance.definition).outputs[binding.portId];
    if (!output) throw new Error("Unknown output port");
    // Actual values are checked at dispatch; schema compatibility cannot be inferred from arbitrary parsers.
    output.parse(parameter.initial);
  }
  return document;
}

export const runtimeStateSchema = z.object({
  sceneId: identifier, frame: z.number().int().min(0).max(10_000_000),
  parameters: jsonObjectSchema,
  componentStates: z.record(identifier, jsonObjectSchema),
  view: jsonObjectSchema,
  selection: z.array(elementRefSchema).max(100),
}).strict();
export const snapshotSchema = z.object({
  schemaVersion: z.literal("1"), id: identifier, source: revisionSchema, state: runtimeStateSchema,
}).strict();
export const localElementSchema = z.object({
  id: identifier, label: text, role: identifier, objectIds: z.array(identifier).max(100), parentId: identifier.optional(),
}).strict();
export const commandSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("emit"), componentId: identifier, portId: identifier, value: jsonValue }).strict(),
  z.object({ type: z.literal("select"), elements: z.array(elementRefSchema).max(100) }).strict(),
  z.object({ type: z.literal("seek"), sceneId: identifier, frame: z.number().int().min(0).max(10_000_000) }).strict(),
  z.object({ type: z.literal("view"), view: jsonObjectSchema }).strict(),
  z.object({ type: z.literal("component-state"), componentId: identifier, state: jsonObjectSchema }).strict(),
]);
