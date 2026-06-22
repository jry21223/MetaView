import { describe, expect, it, vi } from "vitest";

import { makeRuntimeToolTools } from "../src/tools/runtimeTools.js";

function getTool(name: string) {
  const tools = makeRuntimeToolTools({
    apiBaseUrl: "http://api.test",
    sharedToken: "secret",
  });
  const tool = tools.find((item) => item.name === name);
  if (!tool) throw new Error(`missing tool ${name}`);
  return tool;
}

describe("runtime tool bridge", () => {
  it("lists backend runtime tools with the shared token header", async () => {
    const fetchMock = vi.spyOn(global, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        tools: [
          {
            name: "playbook.schema.validate",
            description: "Validate PlaybookScript.",
            args_schema: { type: "object" },
            domain: "playbook",
            deterministic: true,
          },
        ],
      }),
    } as Response);

    const result = await getTool("runtime_tool_list").execute("list", {});
    const payload = result.details as { tools: Array<{ name: string }> };

    expect(fetchMock).toHaveBeenCalledWith(
      "http://api.test/api/v1/agent/runtime-tools",
      expect.objectContaining({
        headers: { "X-MetaView-Agent-Token": "secret" },
      }),
    );
    expect(payload.tools[0].name).toBe("playbook.schema.validate");
    fetchMock.mockRestore();
  });

  it("executes backend runtime tools with free-form args", async () => {
    const fetchMock = vi.spyOn(global, "fetch").mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        tool: "geometry.assert_monotonic",
        ok: true,
        result: { verdict: "increasing", reason: "positive derivative" },
        error: null,
      }),
    } as Response);

    const result = await getTool("runtime_tool_execute").execute("execute", {
      tool: "geometry.assert_monotonic",
      args: { expression: "x**2", x_min: 0.1, x_max: 2 },
    });
    const payload = result.details as { result: { verdict: string } };

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
    expect(payload.result.verdict).toBe("increasing");
    fetchMock.mockRestore();
  });
});
