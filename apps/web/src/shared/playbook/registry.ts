import type { ComponentDefinition } from "./types";

export function createRegistry<T>(definitions: readonly ComponentDefinition<T>[]) {
  const entries = new Map<string, ComponentDefinition<T>>();
  for (const definition of definitions) {
    const key = JSON.stringify([definition.id, definition.version]);
    if (entries.has(key)) throw new Error(`Duplicate definition: ${definition.id}@${definition.version}`);
    entries.set(key, Object.freeze({ ...definition, inputs: Object.freeze({ ...definition.inputs }), outputs: Object.freeze({ ...definition.outputs }) }));
  }
  return Object.freeze({
    get(ref: { id: string; version: string }): ComponentDefinition<T> {
      const definition = entries.get(JSON.stringify([ref.id, ref.version]));
      if (!definition) throw new Error(`Unknown definition: ${ref.id}@${ref.version}`);
      return definition;
    },
  });
}
export type ComponentRegistry<T> = ReturnType<typeof createRegistry<T>>;
