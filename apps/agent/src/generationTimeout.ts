/** Abort-aware hard ceiling for one sidecar generation request. */

export class AgentGenerationTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`agent timed out after ${timeoutMs}ms`);
    this.name = "AgentGenerationTimeoutError";
  }
}

export async function runWithGenerationTimeout<T>(
  run: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
): Promise<T> {
  const controller = new AbortController();
  const timeoutError = new AgentGenerationTimeoutError(timeoutMs);
  let timedOut = false;
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const operation = run(controller.signal).catch((error: unknown) => {
    if (timedOut) {
      throw timeoutError;
    }
    throw error;
  });
  const timeout = new Promise<never>((_resolve, reject) => {
    timeoutId = setTimeout(() => {
      timedOut = true;
      // Abort listeners run synchronously. The live Agent and its telemetry
      // subscription therefore receive cancellation before the HTTP handler
      // observes the timeout rejection.
      controller.abort();
      reject(timeoutError);
    }, timeoutMs);
  });

  try {
    return await Promise.race([operation, timeout]);
  } finally {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }
  }
}
