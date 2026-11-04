import { commandSchema, copyData, identifier, loadDocument, localElementSchema, parameterValue, runtimeStateSchema, sameKeys, snapshotSchema, unique } from "./validation";
import type { ComponentRegistry } from "./registry";
import type { CanvasElement, ContextSnapshot, PlaybookDocument, ResolvedWork, RevisionRef, RuntimeState } from "./types";

export function sameRevision(a: RevisionRef, b: RevisionRef) {
  return a.playbookId === b.playbookId && a.revisionId === b.revisionId;
}
function address(element: CanvasElement["ref"]): string {
  return JSON.stringify([element.playbookId, element.revisionId, element.sceneId, element.componentId, element.elementId]);
}
/** Deterministic state only. This interface grants no network, AI, edit or publish authority. */
export function createRuntime<T>(source: unknown, registry: ComponentRegistry<T>) {
  const document: PlaybookDocument = loadDocument(source, registry);
  const instances = new Map(document.components.map((instance) => [instance.id, instance]));
  let state: RuntimeState = {
    sceneId: document.scenes[0].id, frame: 0,
    parameters: Object.fromEntries(Object.entries(document.parameters).map(([id, parameter]) => [id, parameter.initial])),
    componentStates: Object.fromEntries(document.components.map((instance) => [instance.id, instance.initialState])),
    view: {}, selection: [],
  };
  function validateState(input: unknown): RuntimeState {
    const next = runtimeStateSchema.parse(copyData(input));
    sameKeys(next.parameters, document.parameters);
    sameKeys(next.componentStates, Object.fromEntries(instances));
    for (const [id, parameter] of Object.entries(document.parameters)) parameterValue(parameter, next.parameters[id]);
    for (const instance of document.components) {
      const definition = registry.get(instance.definition);
      next.componentStates[instance.id] = copyData(definition.state.parse(next.componentStates[instance.id]));
      // A shared parameter must remain valid for every scene that consumes it.
      for (const [name, parameter] of Object.entries(instance.inputs)) {
        definition.inputs[name].parse(next.parameters[parameter]);
      }
    }
    return next;
  }
  function resolve(next: RuntimeState): ResolvedWork<T> {
    const scene = document.scenes.find((entry) => entry.id === next.sceneId);
    if (!scene) throw new Error("Unknown scene");
    const elements: CanvasElement[] = [];
    const components = scene.componentIds.map((id) => {
      const instance = instances.get(id)!;
      const definition = registry.get(instance.definition);
      const inputs = Object.fromEntries(Object.entries(instance.inputs).map(([name, parameter]) => [name, definition.inputs[name].parse(next.parameters[parameter])]));
      const result = definition.evaluate(copyData({ config: instance.config, state: next.componentStates[id], inputs, frame: next.frame, view: next.view }));
      if (!Array.isArray(result.elements) || elements.length + result.elements.length > 5000) throw new Error("Element budget exceeded");
      const local = result.elements.map((element) => localElementSchema.parse(copyData(element)));
      unique(local.map((element) => element.id), "element");
      const localIds = new Map(local.map((element) => [element.id, element]));
      for (const element of local) {
        if (element.objectIds.some((object) => !document.objects.some((entry) => entry.id === object))) throw new Error("Unknown semantic object");
        const seen = new Set([element.id]);
        let parent = element.parentId;
        while (parent) {
          if (seen.has(parent) || !localIds.has(parent)) throw new Error("Invalid element hierarchy");
          seen.add(parent); parent = localIds.get(parent)!.parentId;
        }
        elements.push({ ...element, ref: { ...document.ref, sceneId: next.sceneId, componentId: id, elementId: element.id } });
      }
      return { id, kind: instance.kind, ...(result.output === undefined ? {} : { output: copyData(result.output) }) };
    });
    unique(next.selection.map(address), "selection");
    for (const ref of next.selection) if (!elements.some((element) => address(element.ref) === address(ref))) throw new Error("Stale or unavailable element");
    return copyData({ source: document.ref, state: next, components, elements });
  }
  state = validateState(state);
  resolve(state);
  return Object.freeze({
    read: () => resolve(state),
    document: () => copyData(document),
    dispatch(input: unknown): ResolvedWork<T> {
      const command = commandSchema.parse(copyData(input));
      const next = copyData(state);
      switch (command.type) {
        case "emit": {
          if (!document.scenes.find((scene) => scene.id === state.sceneId)!.componentIds.includes(command.componentId)) throw new Error("Inactive component");
          const instance = instances.get(command.componentId)!;
          const output = registry.get(instance.definition).outputs[command.portId];
          if (!output) throw new Error("Unknown output port");
          const value = output.parse(command.value);
          for (const binding of document.bindings.filter((entry) => entry.componentId === instance.id && entry.portId === command.portId)) next.parameters[binding.parameterId] = parameterValue(document.parameters[binding.parameterId], value);
          break;
        }
        case "select": next.selection = command.elements; break;
        case "seek": next.sceneId = command.sceneId; next.frame = command.frame; next.selection = []; break;
        case "view": next.view = command.view; break;
        case "component-state": {
          if (!instances.has(command.componentId)) throw new Error("Unknown component");
          next.componentStates[command.componentId] = command.state;
          break;
        }
      }
      const validated = validateState(next);
      const result = resolve(validated);
      state = validated;
      return result;
    },
    capture(id: string): ContextSnapshot {
      return copyData({ schemaVersion: "1", id: identifier.parse(id), source: document.ref, state });
    },
    restore(input: unknown): ResolvedWork<T> {
      const snapshot = snapshotSchema.parse(copyData(input));
      if (!sameRevision(snapshot.source, document.ref)) throw new Error("Snapshot revision mismatch");
      const next = validateState(snapshot.state);
      const result = resolve(next);
      state = next;
      return result;
    },
  });
}
export type PlaybookRuntime<T> = ReturnType<typeof createRuntime<T>>;
