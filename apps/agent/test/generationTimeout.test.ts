import { afterEach, describe, expect, it, vi } from "vitest";

import {
  AgentGenerationTimeoutError,
  runWithGenerationTimeout,
} from "../src/generationTimeout.js";

describe("runWithGenerationTimeout", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("aborts in-flight generation before rejecting with a timeout", async () => {
    vi.useFakeTimers();
    let aborted = false;
    let listenerActive = true;
    const generation = runWithGenerationTimeout(
      async (signal) =>
        await new Promise<string>((_resolve, reject) => {
          signal.addEventListener(
            "abort",
            () => {
              aborted = true;
              listenerActive = false;
              reject(new Error("generation aborted"));
            },
            { once: true },
          );
        }),
      50,
    );
    const rejection = expect(generation).rejects.toBeInstanceOf(
      AgentGenerationTimeoutError,
    );

    await vi.advanceTimersByTimeAsync(50);
    await rejection;

    expect(aborted).toBe(true);
    expect(listenerActive).toBe(false);
  });
});
