export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };
export interface DataSchema<T> { parse(value: unknown): T }
export interface RevisionRef { playbookId: string; revisionId: string }
export interface ElementRef extends RevisionRef { sceneId: string; componentId: string; elementId: string }
export type ComponentKind = "scene" | "control" | "info";
export interface LocalElement {
  id: string;
  label: string;
  role: string;
  objectIds: string[];
  parentId?: string;
}
export interface CanvasElement extends LocalElement { ref: ElementRef }
export interface ComponentContext {
  config: JsonObject;
  state: JsonObject;
  inputs: JsonObject;
  frame: number;
  view: JsonObject;
}
/** Installed, trusted code. Documents contain only its versioned identifier. */
export interface ComponentDefinition<T> {
  id: string;
  version: string;
  kind: ComponentKind;
  config: DataSchema<JsonObject>;
  state: DataSchema<JsonObject>;
  inputs: Record<string, DataSchema<JsonValue>>;
  outputs: Record<string, DataSchema<JsonValue>>;
  evaluate(context: ComponentContext): { output?: T; elements: LocalElement[] };
}
export interface ComponentInstance {
  id: string;
  definition: { id: string; version: string };
  kind: ComponentKind;
  config: JsonObject;
  initialState: JsonObject;
  inputs: Record<string, string>;
}
export type Parameter =
  | { type: "number"; initial: number; min: number; max: number }
  | { type: "string"; initial: string; options: string[] }
  | { type: "boolean"; initial: boolean };
export interface PlaybookDocument {
  schemaVersion: "1";
  ref: RevisionRef;
  title: string;
  scenes: Array<{ id: string; componentIds: string[] }>;
  components: ComponentInstance[];
  parameters: Record<string, Parameter>;
  bindings: Array<{ componentId: string; portId: string; parameterId: string }>;
  objects: Array<{ id: string; label: string; description: string }>;
  assets: Array<{ id: string; digest: string }>;
}
export interface RuntimeState {
  sceneId: string;
  frame: number;
  parameters: JsonObject;
  componentStates: Record<string, JsonObject>;
  view: JsonObject;
  selection: ElementRef[];
}
export interface ContextSnapshot {
  schemaVersion: "1";
  id: string;
  source: RevisionRef;
  state: RuntimeState;
}
export interface ResolvedWork<T> {
  source: RevisionRef;
  state: RuntimeState;
  components: Array<{ id: string; kind: ComponentKind; output?: T }>;
  elements: CanvasElement[];
}
export type RuntimeCommand =
  | { type: "emit"; componentId: string; portId: string; value: JsonValue }
  | { type: "select"; elements: ElementRef[] }
  | { type: "seek"; sceneId: string; frame: number }
  | { type: "view"; view: JsonObject }
  | { type: "component-state"; componentId: string; state: JsonObject };
