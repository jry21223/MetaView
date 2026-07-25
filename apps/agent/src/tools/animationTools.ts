/** Animation Tool Registry bridge with executable application semantics. */

import { Type } from "@earendil-works/pi-ai";
import type { AgentTool } from "@earendil-works/pi-agent-core";

import type { PlaybookEmitter } from "../state/playbookEmitter.js";
import type { LayerOutput } from "../state/types.js";
import { defineTool, toolResult } from "./common.js";

export interface AnimationToolDeps {
  apiBaseUrl: string;
  sharedToken?: string;
  emitter?: PlaybookEmitter;
  allowedRuntimeTools?: ReadonlySet<string>;
  runId?: string;
  signal?: AbortSignal;
}

const ANIMATION_CAPABILITIES = new Set([
  "animation_tool.list",
  "animation_tool.expand",
]);

interface AnimationToolInfo {
  name: string;
  description: string;
  args_schema: unknown;
}

interface AnimationToolIssue {
  code: string;
  tool: string;
  path: string;
  message: string;
}

interface LayerSpecWire {
  kind: string;
  timing?: {
    enter_at?: number;
    exit_at?: number;
    appear_anim?: string | null;
    z_order?: number;
  };
  scene?: Record<string, unknown> | null;
  plot?: Record<string, unknown> | null;
  table_scene?: Record<string, unknown> | null;
  graph_scene?: Record<string, unknown> | null;
  stats_chart_scene?: Record<string, unknown> | null;
  motion_scene?: Record<string, unknown> | null;
  katex_overlay?: Record<string, unknown> | null;
  narration_card?: Record<string, unknown> | null;
}

interface AnimationToolListResult {
  tools: AnimationToolInfo[];
}

interface AnimationToolExpandResult {
  layers: LayerSpecWire[];
  issues: AnimationToolIssue[];
}

export function makeAnimationToolTools(deps: AnimationToolDeps): AgentTool[] {
  const base = deps.apiBaseUrl.replace(/\/$/, "");
  const allowed = deps.allowedRuntimeTools;

  async function request<T>(
    path: string,
    init: { method?: string; body?: unknown } = {},
  ): Promise<T> {
    if (deps.signal?.aborted) {
      throw abortError(deps.signal);
    }
    const headers: Record<string, string> = {};
    if (init.body !== undefined) headers["Content-Type"] = "application/json";
    if (deps.sharedToken) headers["X-MetaView-Agent-Token"] = deps.sharedToken;
    const response = await fetch(`${base}${path}`, {
      method: init.method ?? "GET",
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: deps.signal,
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(`animation tool ${path} HTTP ${response.status}: ${detail.slice(0, 240)}`);
    }
    return (await response.json()) as T;
  }

  function assertAllowed(name: string): void {
    // Fail-closed: require an explicit allowlist. "*" is not a superuser grant.
    if (allowed?.has(name)) return;
    // Expand capability implies list so models can discover args_schema before expand.
    if (
      name === "animation_tool.list" &&
      allowed?.has("animation_tool.expand")
    ) {
      return;
    }
    throw new Error(`runtime capability ${name} is not allowed for this run`);
  }

  return [
    defineTool(
      "animation_tool_list",
      "Animation tools: list",
      "List animation registry macros authorized for the current run inventory. " +
        "When the allowlist only grants animation_tool.list/expand, the full " +
        "deterministic registry is in scope; concrete macro names narrow the list.",
      Type.Object({}),
      async () => {
        assertAllowed("animation_tool.list");
        const result = await request<AnimationToolListResult>("/api/v1/agent/animation-tools");
        return toolResult({
          tools: filterAnimationRegistry(result.tools, allowed),
        });
      },
    ) as AgentTool,

    defineTool(
      "animation_tool_expand",
      "Animation tools: expand and apply",
      "Expand a deterministic animation macro and attach the validated layers to the active step draft.",
      Type.Object({
        tool: Type.String({ minLength: 1 }),
        args: Type.Record(Type.String(), Type.Unknown(), {
          description: "Arguments matching the selected registry tool schema.",
        }),
      }),
      async (args) => {
        assertAllowed("animation_tool.expand");
        if (deps.emitter && !deps.emitter.hasOpenStep()) {
          throw new Error("animation_tool_expand requires an active step draft");
        }
        const body: Record<string, unknown> = {
          tool: args.tool,
          args: args.args,
        };
        if (deps.runId !== undefined) body.run_id = deps.runId;
        if (allowed !== undefined) body.allowed_tools = [...allowed];
        const result = await request<AnimationToolExpandResult>(
          "/api/v1/agent/animation-tools/expand",
          {
            method: "POST",
            body,
          },
        );
        if (!deps.emitter) {
          // Backward-compatible discovery mode: callers that do not provide an
          // emitter can inspect the deterministic expansion without applying it.
          return toolResult({
            ...result,
            ok: true as const,
            tool: args.tool,
            layer_count: result.layers.length,
            snapshot_kind: result.layers[0]?.kind ?? null,
            applied_to_draft: null,
          });
        }
        if (result.issues.length > 0) {
          const issue = result.issues[0];
          throw new Error(`${issue.code} at ${issue.path}: ${issue.message}`);
        }
        const materialized = result.layers.map(materializeLayerSpec);
        if (materialized.length === 0) {
          throw new Error(`animation tool ${args.tool} produced no layers`);
        }
        const snapshot = structuredClone(materialized[0].body);
        deps.emitter.applyCompiledLayers(snapshot, materialized, {
          animation_tool: args.tool,
          source: "runtime_registry",
        });
        return toolResult({
          ...result,
          ok: true as const,
          tool: args.tool,
          layer_count: materialized.length,
          snapshot_kind: String(snapshot.kind ?? ""),
          applied_to_draft: deps.emitter.currentDraftId(),
        });
      },
    ) as AgentTool,
  ];
}

function filterAnimationRegistry(
  tools: AnimationToolInfo[],
  allowed?: ReadonlySet<string>,
): AnimationToolInfo[] {
  if (!allowed) return [];
  const concreteMacros = tools
    .map((tool) => tool.name)
    .filter((name) => allowed.has(name) && !ANIMATION_CAPABILITIES.has(name));
  // Inventory may enumerate concrete macros (e.g. math.show_function). When it
  // does, only those macros are discoverable. Capability-only inventories grant
  // the full deterministic registry for the authorized expand/list capability.
  if (concreteMacros.length > 0) {
    return tools.filter((tool) => allowed.has(tool.name));
  }
  if (allowed.has("animation_tool.expand") || allowed.has("animation_tool.list")) {
    return tools;
  }
  return [];
}

function abortError(signal: AbortSignal): Error {
  const reason = signal.reason;
  return reason instanceof Error ? reason : new Error("animation tool request aborted");
}

function materializeLayerSpec(spec: LayerSpecWire): LayerOutput {
  const body = materializeBody(spec);
  const appear = spec.timing?.appear_anim ?? "fade";
  const allowedAnimations = new Set(["fade", "draw", "slide", "scale", "none"]);
  if (!allowedAnimations.has(appear)) {
    throw new Error(`unsupported compiled appear animation ${JSON.stringify(appear)}`);
  }
  return {
    timing: {
      enter_at: spec.timing?.enter_at ?? 0,
      exit_at: spec.timing?.exit_at ?? 1,
      appear_anim: appear as LayerOutput["timing"]["appear_anim"],
      z_order: spec.timing?.z_order ?? 0,
    },
    body,
  };
}

function materializeBody(spec: LayerSpecWire): Record<string, unknown> {
  switch (spec.kind) {
    case "math_scene":
      return { kind: "math_scene", ...(spec.scene ?? {}) };
    case "math_plot":
      return { kind: "math_plot", ...(spec.plot ?? {}) };
    case "table_scene":
      return { kind: "table_scene", ...(spec.table_scene ?? {}) };
    case "graph_scene":
      return { kind: "graph_scene", ...(spec.graph_scene ?? {}) };
    case "stats_chart_scene":
      return { kind: "stats_chart_scene", ...(spec.stats_chart_scene ?? {}) };
    case "motion_scene":
      return { kind: "motion_scene", ...(spec.motion_scene ?? {}) };
    case "katex_overlay":
      return { kind: "katex_overlay", ...(spec.katex_overlay ?? {}) };
    case "narration_card":
      return { kind: "narration_card", ...(spec.narration_card ?? {}) };
    default:
      throw new Error(
        `animation layer kind ${JSON.stringify(spec.kind)} cannot yet be materialized by the sidecar; use a SceneBlueprint/compiler result instead`,
      );
  }
}
