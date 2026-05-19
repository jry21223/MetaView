/**
 * Shared helpers used by every tool registry module (drawing / templates /
 * asserts). Kept tiny on purpose — anything domain-specific lives in the
 * respective registry file.
 */

import { type Static, type TSchema } from "@earendil-works/pi-ai";
import type { AgentTool, AgentToolResult } from "@earendil-works/pi-agent-core";

/** Wrap a JSON-serializable details object into the AgentToolResult envelope
 *  pi-agent-core expects. ``content`` is what the model sees; ``details`` is
 *  what the rest of our code reads. */
export function toolResult<T>(
  details: T,
  opts?: { terminate?: boolean },
): AgentToolResult<T> {
  return {
    content: [{ type: "text", text: JSON.stringify(details) }],
    details,
    terminate: opts?.terminate,
  };
}

/** Declare an AgentTool with stricter argument typing. */
export function defineTool<S extends TSchema, D>(
  name: string,
  label: string,
  description: string,
  parameters: S,
  execute: (params: Static<S>) => Promise<AgentToolResult<D>>,
): AgentTool<S, D> {
  return {
    name,
    label,
    description,
    parameters,
    execute: async (_toolCallId, params) => execute(params),
  };
}
