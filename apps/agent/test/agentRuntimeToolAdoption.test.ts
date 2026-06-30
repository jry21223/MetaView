import { afterEach, describe, expect, it, vi } from "vitest";
import type { PlaybookOutput } from "../src/state/types.js";

const agentMock = vi.hoisted(() => ({
  prompts: [] as string[],
}));

vi.mock("@earendil-works/pi-ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@earendil-works/pi-ai")>();
  return {
    ...actual,
    getModel: vi.fn(() => ({
      provider: "test",
      id: "test-model",
      baseUrl: "",
    })),
  };
});

vi.mock("@earendil-works/pi-agent-core", () => ({
  Agent: class MockAgent {
    private readonly options: {
      initialState: {
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
    }

    async prompt(prompt: string): Promise<void> {
      agentMock.prompts.push(prompt);
      const runtimeExecute = this.options.initialState.tools.find(
        (tool) => tool.name === "runtime_tool_execute",
      );
      if (!runtimeExecute) {
        throw new Error("runtime_tool_execute missing");
      }
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
      {
        id: "map",
        semantic_role: "map_layer",
        asset_id: "east-asia-land-110m",
      },
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
        timing: {
          enter_at: 0,
          exit_at: 1,
          appear_anim: "fade" as const,
          z_order: 0,
        },
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

describe("agent runtime SceneBlueprint adoption", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    agentMock.prompts = [];
  });

  it("returns the PlaybookScript produced by scene_blueprint.compile", async () => {
    const playbook = sceneBlueprintPlaybook();
    const fetchMock = vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        tool: "scene_blueprint.compile",
        ok: true,
        result: { valid: true, sceneType: "east_asia_monsoon", playbook },
        error: null,
      }),
    } as Response);
    const { runAgentGeneration } = await import("../src/agent.js");

    const result = await runAgentGeneration({
      prompt: "讲解东亚夏季风的海陆热力差异",
      apiBaseUrl: "http://api.test",
      agentSharedToken: "secret",
      defaultProvider: "openai",
      defaultModel: "gpt-4o-mini",
      defaultApiKey: "test-key",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://api.test/api/v1/agent/runtime-tools/execute",
      expect.objectContaining({
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-MetaView-Agent-Token": "secret",
        },
      }),
    );
    expect(result).toEqual(playbook);
    expect(result.steps[0].snapshot.kind).toBe("geo_map_scene");
    expect(JSON.stringify(result)).not.toContain("algorithm_array");
  });
});
