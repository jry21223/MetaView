import { afterEach, describe, expect, it, vi } from "vitest";
import type { AttemptSink } from "../src/agent.js";
import type { PlaybookOutput } from "../src/state/types.js";

const agentMock = vi.hoisted(() => ({
  prompts: [] as string[],
  models: [] as Array<{ provider: string; id: string; baseUrl: string }>,
  getModelCalls: [] as Array<{ provider: string; model: string }>,
  listeners: [] as Array<(event: unknown) => void | Promise<void>>,
  subscribeCalls: 0,
  promptError: null as Error | null,
  hangPrompt: false,
  abortCalls: 0,
}));

vi.mock("@earendil-works/pi-ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@earendil-works/pi-ai")>();
  return {
    ...actual,
    getModel: vi.fn((provider: string, modelId: string) => {
      agentMock.getModelCalls.push({ provider, model: modelId });
      if (modelId === "deepseek-v4-pro") {
        return undefined;
      }
      return {
        provider: "test",
        id: "test-model",
        baseUrl: "",
      };
    }),
  };
});

vi.mock("@earendil-works/pi-agent-core", () => ({
  Agent: class MockAgent {
    private resolveAbort: (() => void) | null = null;
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
    }

    async prompt(prompt: string): Promise<void> {
      agentMock.prompts.push(prompt);
      for (const listener of agentMock.listeners) {
        await listener({
          type: "message_end",
          message: {
            role: "assistant",
            provider: "test",
            model: "test-model",
            usage: { input: 12, output: 3, cacheRead: 2, cacheWrite: 0 },
            content: [],
          },
        });
      }
      if (agentMock.promptError) {
        throw agentMock.promptError;
      }
      if (agentMock.hangPrompt) {
        await new Promise<void>((resolve) => {
          this.resolveAbort = resolve;
        });
        return;
      }
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

    subscribe(listener: (event: unknown) => void | Promise<void>): () => void {
      agentMock.subscribeCalls += 1;
      agentMock.listeners.push(listener);
      return () => {
        agentMock.listeners = agentMock.listeners.filter(
          (candidate) => candidate !== listener,
        );
      };
    }

    abort(): void {
      agentMock.abortCalls += 1;
      this.resolveAbort?.();
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
    agentMock.models = [];
    agentMock.getModelCalls = [];
    agentMock.listeners = [];
    agentMock.subscribeCalls = 0;
    agentMock.promptError = null;
    agentMock.hangPrompt = false;
    agentMock.abortCalls = 0;
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
      lessonPlan: {
        schema_version: "1.0.0",
        title: "LESSON_PLAN_ONLY_MARKER",
      },
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
    expect(agentMock.prompts[0]).toContain("LESSON_PLAN_ONLY_MARKER");
    expect(JSON.stringify(result)).not.toContain("LESSON_PLAN_ONLY_MARKER");
    expect(JSON.stringify(result)).not.toContain("algorithm_array");
    expect(agentMock.subscribeCalls).toBe(0);
  });

  it("creates an OpenAI-compatible fallback model for unregistered custom models", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        tool: "scene_blueprint.compile",
        ok: true,
        result: {
          valid: true,
          sceneType: "east_asia_monsoon",
          playbook: sceneBlueprintPlaybook(),
        },
        error: null,
      }),
    } as Response);
    const { runAgentGeneration } = await import("../src/agent.js");

    await runAgentGeneration({
      prompt: "讲解东亚夏季风的海陆热力差异",
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

  it("keeps telemetry observed before a failed provider attempt", async () => {
    agentMock.promptError = new Error("provider failed");
    const { runAgentGeneration } = await import("../src/agent.js");
    const attempts: AttemptSink = [];

    await expect(
      runAgentGeneration(
        {
          prompt: "explain failure",
          apiBaseUrl: "http://api.test",
          defaultProvider: "openai",
          defaultModel: "gpt-4o-mini",
          defaultApiKey: "test-key",
        },
        attempts,
      ),
    ).rejects.toThrow("provider failed");

    expect(attempts).toHaveLength(1);
    expect(attempts[0]).toMatchObject({
      attempt_index: 0,
      outcome: "failed",
      self_check_status: null,
      self_check_issue_codes: [],
      error_code: "Error",
      telemetry: {
        model_turns: 1,
        usage: {
          input_tokens: 12,
          output_tokens: 3,
          cache_read_tokens: 2,
          cache_write_tokens: 0,
        },
      },
    });
    expect(attempts[0]?.started_at).toMatch(/Z$/);
    expect(attempts[0]?.finished_at).toMatch(/Z$/);
  });

  it("keeps every attempt when AgentSelfCheckError is thrown", async () => {
    const blocked = sceneBlueprintPlaybook();
    blocked.steps[0]!.voiceover_text = "";
    vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        tool: "scene_blueprint.compile",
        ok: true,
        result: {
          valid: true,
          sceneType: "east_asia_monsoon",
          playbook: blocked,
        },
        error: null,
      }),
    } as Response);
    const { runAgentGeneration } = await import("../src/agent.js");
    const attempts: AttemptSink = [];

    await expect(
      runAgentGeneration(
        {
          prompt: "讲解东亚夏季风的海陆热力差异",
          apiBaseUrl: "http://api.test",
          defaultProvider: "openai",
          defaultModel: "gpt-4o-mini",
          defaultApiKey: "test-key",
        },
        attempts,
      ),
    ).rejects.toMatchObject({
      name: "AgentSelfCheckError",
      report: { status: "blocked" },
    });

    expect(attempts).toHaveLength(3);
    expect(attempts.map((attempt) => attempt.attempt_index)).toEqual([0, 1, 2]);
    expect(attempts.map((attempt) => attempt.self_check_status)).toEqual([
      "blocked",
      "blocked",
      "blocked",
    ]);
    expect(attempts.every((attempt) => attempt.telemetry.model_turns === 1)).toBe(
      true,
    );
    expect(agentMock.listeners).toHaveLength(0);
  });

  it("aborts pi-agent and snapshots the in-flight attempt on timeout", async () => {
    agentMock.hangPrompt = true;
    const { runAgentGeneration } = await import("../src/agent.js");
    const { runWithGenerationTimeout } = await import(
      "../src/generationTimeout.js"
    );
    const attempts: AttemptSink = [];

    await expect(
      runWithGenerationTimeout(
        async (abortSignal) =>
          await runAgentGeneration(
            {
              prompt: "explain a timeout",
              apiBaseUrl: "http://api.test",
              defaultProvider: "openai",
              defaultModel: "gpt-4o-mini",
              defaultApiKey: "test-key",
              abortSignal,
            },
            attempts,
          ),
        10,
      ),
    ).rejects.toMatchObject({ name: "AgentGenerationTimeoutError" });

    expect(agentMock.abortCalls).toBe(1);
    expect(agentMock.listeners).toHaveLength(0);
    expect(attempts).toHaveLength(1);
    expect(attempts[0]).toMatchObject({
      attempt_index: 0,
      telemetry: {
        model_turns: 1,
        usage: {
          input_tokens: 12,
          output_tokens: 3,
          cache_read_tokens: 2,
          cache_write_tokens: 0,
        },
      },
    });
  });
});
