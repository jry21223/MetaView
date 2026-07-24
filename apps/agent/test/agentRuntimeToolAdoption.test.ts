import { afterEach, describe, expect, it, vi } from "vitest";
import type { PlaybookOutput } from "../src/state/types.js";

const agentMock = vi.hoisted(() => ({
  prompts: [] as string[],
  models: [] as Array<{ provider: string; id: string; baseUrl: string }>,
  getModelCalls: [] as Array<{ provider: string; model: string }>,
  toolNames: [] as string[],
}));

vi.mock("@earendil-works/pi-ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@earendil-works/pi-ai")>();
  return {
    ...actual,
    getModel: vi.fn((provider: string, modelId: string) => {
      agentMock.getModelCalls.push({ provider, model: modelId });
      if (modelId === "deepseek-v4-pro") return undefined;
      return { provider: "test", id: "test-model", baseUrl: "" };
    }),
  };
});

vi.mock("@earendil-works/pi-agent-core", () => ({
  Agent: class MockAgent {
    private readonly options: {
      initialState: {
        model: unknown;
        tools: Array<{
          name: string;
          execute: (id: string, args: unknown) => Promise<unknown>;
        }>;
      };
      afterToolCall?: (context: {
        args: unknown;
        result: unknown;
        isError: boolean;
      }) => Promise<unknown> | unknown;
    };

    constructor(options: MockAgent["options"]) {
      this.options = options;
      agentMock.models.push(options.initialState.model as {
        provider: string;
        id: string;
        baseUrl: string;
      });
      agentMock.toolNames = options.initialState.tools.map((tool) => tool.name);
    }

    async prompt(prompt: string): Promise<void> {
      agentMock.prompts.push(prompt);
      const runtimeExecute = this.options.initialState.tools.find(
        (tool) => tool.name === "runtime_tool_execute",
      );
      if (!runtimeExecute) throw new Error("runtime_tool_execute missing");
      const args = {
        tool: "scene_blueprint.compile",
        args: {
          blueprint: {
            id: "east_asia_monsoon",
            subject: "geography",
            sceneType: "east_asia_monsoon",
            title: "东亚季风",
          },
        },
      };
      const result = await runtimeExecute.execute("runtime-call-1", args);
      await this.options.afterToolCall?.({ args, result, isError: false });
    }
  },
}));

function sceneBlueprintPlaybook(): PlaybookOutput {
  const snapshot = {
    kind: "geo_map_scene",
    pack_id: "geography-earth-basic",
    map_region: "east_asia",
    layers: [
      { id: "map", semantic_role: "map_layer", asset_id: "east-asia-land-110m" },
    ],
    flows: [
      {
        id: "summer",
        semantic_role: "monsoon_flow",
        asset_id: "monsoon-wind-arrow",
        from: [78, 68],
        to: [42, 38],
      },
    ],
    pressure_centers: [
      { id: "land-low", kind: "low", x: 38, y: 35, label: "land low" },
    ],
    particle_preset: "moisture_particles",
    caption: "东亚季风地图展示海陆热力差异。",
  };
  const steps = Array.from({ length: 8 }, (_, index) => ({
    step_id: `east_asia_monsoon_${index + 1}`,
    title: `东亚季风 ${index + 1}`,
    end_frame: (index + 1) * 180,
    narration_template: [`东亚季风第 ${index + 1} 步解释海陆热力差异。`],
    voiceover_text: `东亚季风第 ${index + 1} 步解释海陆热力差异和 monsoon_flow。`,
    tokens: [],
    code_highlight: null,
    snapshot,
    layers: [
      {
        timing: { enter_at: 0, exit_at: 1, appear_anim: "fade" as const, z_order: 0 },
        body: { ...snapshot },
      },
    ],
  }));
  return {
    fps: 30,
    total_frames: steps.at(-1)?.end_frame ?? 0,
    domain: "geography",
    title: "东亚季风",
    summary: "东亚季风由海陆热力差异驱动。",
    parameter_controls: [],
    steps,
  };
}

function mockBackend(playbook: PlaybookOutput) {
  return vi.spyOn(global, "fetch").mockImplementation(async (_url, init) => {
    const body = JSON.parse(String(init?.body ?? "{}")) as {
      tool?: string;
      args?: Record<string, unknown>;
    };
    if (body.tool === "scene_blueprint.compile") {
      return {
        ok: true,
        json: async () => ({
          tool: body.tool,
          ok: true,
          result: { valid: true, sceneType: "east_asia_monsoon", playbook },
          error: null,
        }),
      } as Response;
    }
    if (body.tool === "playbook.schema.validate") {
      return {
        ok: true,
        json: async () => ({ tool: body.tool, ok: true, result: { valid: true }, error: null }),
      } as Response;
    }
    return {
      ok: true,
      json: async () => ({
        tool: body.tool,
        ok: true,
        result: { status: "clean", issues: [], metrics: {} },
        error: null,
      }),
    } as Response;
  });
}

describe("agent runtime SceneBlueprint adoption", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    agentMock.prompts = [];
    agentMock.models = [];
    agentMock.getModelCalls = [];
    agentMock.toolNames = [];
  });

  it("returns the compiler Playbook and performs canonical backend preflight", async () => {
    const playbook = sceneBlueprintPlaybook();
    const fetchMock = mockBackend(playbook);
    const { runAgentGeneration } = await import("../src/agent.js");

    const result = await runAgentGeneration({
      prompt: "讲解东亚夏季风的海陆热力差异",
      lessonPlan: { schema_version: "1.0.0", title: "LESSON_PLAN_ONLY_MARKER" },
      availableTools: [{ name: "scene_blueprint.compile" }],
      apiBaseUrl: "http://api.test",
      agentSharedToken: "secret",
      defaultProvider: "openai",
      defaultModel: "gpt-4o-mini",
      defaultApiKey: "test-key",
    });

    expect(result.steps[0].snapshot.kind).toBe("geo_map_scene");
    expect(result.initial_data?.agent_tool_trace?.[0]).toContain("runtime_tool_execute:ok");
    expect(agentMock.prompts[0]).toContain("LESSON_PLAN_ONLY_MARKER");
    expect(JSON.stringify(result)).not.toContain("algorithm_array");
    expect(agentMock.toolNames).toContain("runtime_tool_execute");
    expect(fetchMock).toHaveBeenCalledTimes(4);
    const executedTools = fetchMock.mock.calls.map(([, init]) =>
      JSON.parse(String(init?.body ?? "{}")).tool,
    );
    expect(executedTools).toEqual([
      "scene_blueprint.compile",
      "playbook.schema.validate",
      "playbook.self_check",
      "playbook.visual_progression.validate",
    ]);
  });

  it("creates an OpenAI-compatible fallback model for unregistered custom models", async () => {
    mockBackend(sceneBlueprintPlaybook());
    const { runAgentGeneration } = await import("../src/agent.js");

    await runAgentGeneration({
      prompt: "讲解东亚夏季风的海陆热力差异",
      availableTools: [{ name: "scene_blueprint.compile" }],
      apiBaseUrl: "http://api.test",
      agentSharedToken: "secret",
      defaultProvider: "deepseek",
      defaultModel: "deepseek-v4-pro",
      defaultApiKey: "test-key",
      defaultBaseUrl: "https://api.deepseek.com/v1",
    });

    expect(agentMock.getModelCalls).toEqual([
      { provider: "deepseek", model: "deepseek-v4-pro" },
    ]);
    expect(agentMock.models[0]).toMatchObject({
      provider: "deepseek",
      id: "deepseek-v4-pro",
      baseUrl: "https://api.deepseek.com/v1",
    });
  });
});
