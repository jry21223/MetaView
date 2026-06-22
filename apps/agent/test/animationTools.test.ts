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
          tools: [
            {
              name: "math.show_function",
              description: "Show a function.",
              args_schema: {
                type: "object",
                properties: {
                  expression: { type: "string" },
                  x_min: { type: "number" },
                  x_max: { type: "number" },
                },
              },
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await getTool("animation_tool_list").execute("test", {});
    const details = result.details as {
      tools: Array<{
        name: string;
        description: string;
        args_schema: { properties: Record<string, unknown> };
      }>;
    };

    expect(details.tools[0].name).toBe("math.show_function");
    expect(details.tools[0].args_schema.properties).toHaveProperty("expression");
    expect(details.tools[0].args_schema.properties).toHaveProperty("x_min");
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

  it("covers the quadratic tangent golden fixture without a model call", async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      if (!init || init.method === "GET") {
        return new Response(
          JSON.stringify({
            tools: [
              {
                name: "math.show_tangent",
                description: "Show a function and tangent line at a selected x value.",
                args_schema: {
                  type: "object",
                  properties: {
                    expression: { type: "string", minLength: 1 },
                    x0: { type: "number" },
                    tangent_expression: { type: "string", minLength: 1 },
                    x_min: { type: "number" },
                    x_max: { type: "number" },
                  },
                  required: ["expression", "x0", "tangent_expression"],
                },
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }

      return new Response(
        JSON.stringify({
          layers: [
            {
              kind: "math_plot",
              plot: {
                curves: [
                  { expression: "x^2", label: "f(x)", emphasis: "primary" },
                  { expression: "4*x - 4", label: "tangent", emphasis: "secondary" },
                ],
                marker_x: 2,
              },
            },
          ],
          issues: [],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const listResult = await getTool("animation_tool_list").execute("list", {});
    const listDetails = listResult.details as {
      tools: Array<{ name: string; args_schema: { properties: Record<string, unknown> } }>;
    };

    expect(SYSTEM_PROMPT).toContain("function plots, tangents");
    expect(listDetails.tools[0].name).toBe("math.show_tangent");
    expect(listDetails.tools[0].args_schema.properties).toHaveProperty("tangent_expression");

    const expandResult = await getTool("animation_tool_expand").execute("expand", {
      tool: "math.show_tangent",
      args: {
        expression: "x^2",
        x0: 2,
        tangent_expression: "4*x - 4",
        x_min: -3,
        x_max: 5,
      },
    });
    const expandDetails = expandResult.details as {
      layers: Array<{ kind: string; plot: { marker_x: number } }>;
      issues: unknown[];
    };

    expect(expandDetails.issues).toEqual([]);
    expect(expandDetails.layers[0].kind).toBe("math_plot");
    expect(expandDetails.layers[0].plot.marker_x).toBe(2);
  });

  it("tells the model to prefer animation tools for common animations", () => {
    expect(SYSTEM_PROMPT).toContain("animation_tool_list");
    expect(SYSTEM_PROMPT).toContain("animation_tool_expand");
    expect(SYSTEM_PROMPT).toContain("args_schema");
    expect(SYSTEM_PROMPT).toContain("do not invent raw LayerSpec JSON");
  });

  it("keeps the workflow prompt as a flat four-step checklist", () => {
    const workflow = SYSTEM_PROMPT.match(
      /Workflow you MUST follow:[\s\S]*?Output discipline:/,
    )?.[0];

    expect(workflow).toBeTruthy();
    expect(workflow).toContain("1. Call `plan_outline` FIRST");
    expect(workflow).toContain("2. Use deterministic runtime and animation tools");
    expect(workflow).toContain("3. Build each visual step");
    expect(workflow).toContain("4. Verify claims and finish");
    expect(workflow).not.toMatch(/^\s+[a-d]\./m);
    expect(workflow?.match(/^\d+\./gm)).toEqual(["1.", "2.", "3.", "4."]);
  });
});
