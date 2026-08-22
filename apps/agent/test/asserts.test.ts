import { afterEach, describe, expect, it, vi } from "vitest";

import { PlaybookEmitter } from "../src/state/playbookEmitter.js";
import { makeAssertTools } from "../src/tools/asserts.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("assert tool authentication", () => {
  it("sends the shared token when configured", async () => {
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => ({
      ok: true,
      json: async () => ({ verdict: "increasing", reason: "positive derivative" }),
      text: async () => "",
    }));
    vi.stubGlobal("fetch", fetchMock);
    const tools = makeAssertTools({
      emitter: new PlaybookEmitter(),
      apiBaseUrl: "http://api:8000",
      sharedToken: "shared-secret",
    });
    const monotonic = tools.find((item) => item.name === "assert_monotonic");
    if (!monotonic) throw new Error("assert_monotonic tool missing");

    await monotonic.execute("call-1", {
      expression: "x**2",
      x_min: 0.1,
      x_max: 2,
    } as never);

    const init = fetchMock.mock.calls[0][1] as {
      headers: Record<string, string>;
    };
    expect(init.headers["X-MetaView-Agent-Token"]).toBe("shared-secret");
  });
});
