import { afterEach, describe, expect, it, vi } from "vitest";

import { SYSTEM_PROMPT } from "../src/agent.js";
import { makeAnimationToolTools } from "../src/tools/animationTools.js";

function getTool(name: string) {
  const tools = makeAnimationToolTools({
    apiBaseUrl: "http://api.test/",
    sharedToken: "secret",
  });
  const tool = tools.find((item) => item.name === name);
  if (!tool) throw new Error(`tool ${name} not found`);
  return tool;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("animation tool bridge", () => {
  it("lists backend animation tools with the shared token header", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          tools: [{ name: "math.show_function", description: "Show a function." }],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await getTool("animation_tool_list").execute("test", {});
    const details = result.details as {
      tools: Array<{ name: string; description: string }>;
    };

    expect(details.tools[0].name).toBe("math.show_function");
    expect(fetchMock).toHaveBeenCalledWith(
      "http://api.test/api/v1/agent/animation-tools",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({
          "X-MetaView-Agent-Token": "secret",
        }),
      }),
    );
  });

  it("expands a backend animation tool with free-form args", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          layers: [{ kind: "math_plot", plot: { curves: [] } }],
          issues: [],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await getTool("animation_tool_expand").execute("test", {
      tool: "math.show_function",
      args: { expression: "x**2", x_min: -2, x_max: 2 },
    });
    const details = result.details as {
      layers: Array<{ kind: string }>;
      issues: unknown[];
    };

    expect(details.layers[0].kind).toBe("math_plot");
    expect(details.issues).toEqual([]);
    const [, init] = fetchMock.mock.calls[0];
    expect(init).toEqual(
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "Content-Type": "application/json",
          "X-MetaView-Agent-Token": "secret",
        }),
        body: JSON.stringify({
          tool: "math.show_function",
          args: { expression: "x**2", x_min: -2, x_max: 2 },
        }),
      }),
    );
  });

  it("tells the model to prefer animation tools for common animations", () => {
    expect(SYSTEM_PROMPT).toContain("animation_tool_list");
    expect(SYSTEM_PROMPT).toContain("animation_tool_expand");
    expect(SYSTEM_PROMPT).toContain("do not invent raw LayerSpec JSON");
  });
});
