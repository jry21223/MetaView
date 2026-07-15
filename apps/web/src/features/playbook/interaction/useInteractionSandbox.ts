import { useCallback, useEffect, useMemo, useReducer } from "react";

import type { PlaybookScript } from "../engine/types";
import {
  applyInteraction,
  deriveInteractionManifest,
  formatBfsCodeVariables,
} from "./engine";
import type {
  BfsInteractionReplay,
  InteractionCommand,
  InteractionEvent,
  InteractionManifest,
} from "./types";

export const MAX_INTERACTION_EVENTS = 100;

interface InteractionSandboxState {
  baseKey: string;
  baseScript: PlaybookScript;
  committedScript: PlaybookScript;
  previewScript: PlaybookScript;
  commands: InteractionCommand[];
  events: InteractionEvent[];
  latestReplay: BfsInteractionReplay | null;
  lastError: string | null;
}

interface InteractionSandboxBase {
  baseKey: string;
  baseScript: PlaybookScript;
}

type InteractionSandboxAction =
  | ({ type: "sync" } & InteractionSandboxBase)
  | ({ type: "preview"; command: InteractionCommand } & InteractionSandboxBase)
  | ({ type: "cancel-preview" } & InteractionSandboxBase)
  | ({
      type: "show-replay-frame";
      replay: BfsInteractionReplay;
      frameIndex: number;
    } & InteractionSandboxBase)
  | ({ type: "apply"; command: InteractionCommand } & InteractionSandboxBase)
  | ({ type: "undo" } & InteractionSandboxBase)
  | ({ type: "reset" } & InteractionSandboxBase);

function scriptContentKey(script: PlaybookScript): string {
  return JSON.stringify(script, (_key: string, value: unknown) => {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      return value;
    }
    const record = value as Record<string, unknown>;
    return Object.keys(record)
      .sort()
      .reduce<Record<string, unknown>>((sorted, key) => {
        sorted[key] = record[key];
        return sorted;
      }, {});
  });
}

function initialState(
  baseScript: PlaybookScript,
  baseKey: string,
): InteractionSandboxState {
  return {
    baseKey,
    baseScript,
    committedScript: baseScript,
    previewScript: baseScript,
    commands: [],
    events: [],
    latestReplay: null,
    lastError: null,
  };
}

function assertSameTimeline(
  baseScript: PlaybookScript,
  previewScript: PlaybookScript,
): void {
  const sameTimeline =
    previewScript.fps === baseScript.fps &&
    previewScript.total_frames === baseScript.total_frames &&
    previewScript.steps.length === baseScript.steps.length &&
    previewScript.steps.every((step, index) =>
      step.step_id === baseScript.steps[index]?.step_id &&
      step.end_frame === baseScript.steps[index]?.end_frame
    );
  if (!sameTimeline) {
    throw new Error("Interaction adapters cannot change the player timeline");
  }
}

function replay(
  baseScript: PlaybookScript,
  baseKey: string,
  commands: InteractionCommand[],
): InteractionSandboxState {
  let committedScript = baseScript;
  const appliedCommands: InteractionCommand[] = [];
  const events: InteractionEvent[] = [];
  let latestReplay: BfsInteractionReplay | null = null;

  for (const command of commands) {
    try {
      const result = applyInteraction(committedScript, command, events.length + 1);
      assertSameTimeline(baseScript, result.script);
      committedScript = result.script;
      appliedCommands.push(command);
      events.push(result.event);
      latestReplay = result.replay ?? null;
    } catch (error) {
      return {
        baseKey,
        baseScript,
        committedScript,
        previewScript: committedScript,
        commands: appliedCommands,
        events,
        latestReplay,
        lastError: error instanceof Error ? error.message : "Interaction replay failed",
      };
    }
  }

  return {
    baseKey,
    baseScript,
    committedScript,
    previewScript: committedScript,
    commands: appliedCommands,
    events,
    latestReplay,
    lastError: null,
  };
}

function showReplayFrame(
  committedScript: PlaybookScript,
  replay: BfsInteractionReplay,
  frameIndex: number,
): PlaybookScript {
  const frame = replay.frames[Math.max(0, Math.min(frameIndex, replay.frames.length - 1))];
  if (!frame) return committedScript;
  const steps = committedScript.steps.map((step) => {
    if (step.step_id !== replay.step_id || step.snapshot.kind !== "graph_scene") return step;
    const matchingLayerIndexes = step.layers
      ?.map((layer, index) => layer.body.kind === "graph_scene" ? index : -1)
      .filter((index) => index >= 0) ?? [];
    if (step.layers?.length && matchingLayerIndexes.length !== 1) {
      throw new Error("BFS replay requires exactly one graph_scene layer");
    }
    const targetLayerIndex = matchingLayerIndexes[0];
    const layers = step.layers?.map((layer, index) =>
      index === targetLayerIndex ? { ...layer, body: frame.snapshot } : layer
    );
    const codeHighlight = step.code_highlight
      ? {
          ...step.code_highlight,
          variables: {
            ...step.code_highlight.variables,
            ...formatBfsCodeVariables(
              frame.current_node_id,
              frame.queue_node_ids,
              frame.visited_node_ids,
            ),
          },
        }
      : step.code_highlight;
    return {
      ...step,
      snapshot: frame.snapshot,
      ...(layers ? { layers } : {}),
      ...(codeHighlight ? { code_highlight: codeHighlight } : {}),
    };
  });
  return { ...committedScript, steps };
}

function reducer(
  state: InteractionSandboxState,
  action: InteractionSandboxAction,
): InteractionSandboxState {
  const current = state.baseKey === action.baseKey
    ? state
    : initialState(action.baseScript, action.baseKey);

  if (action.type === "sync" || action.type === "reset") {
    return initialState(action.baseScript, action.baseKey);
  }
  if (action.type === "undo") {
    return replay(
      action.baseScript,
      action.baseKey,
      current.commands.slice(0, -1),
    );
  }
  if (action.type === "cancel-preview") {
    return {
      ...current,
      previewScript: current.committedScript,
      lastError: null,
    };
  }
  if (action.type === "show-replay-frame") {
    try {
      const previewScript = showReplayFrame(
        current.committedScript,
        action.replay,
        action.frameIndex,
      );
      assertSameTimeline(action.baseScript, previewScript);
      return { ...current, previewScript, lastError: null };
    } catch (error) {
      return {
        ...current,
        previewScript: current.committedScript,
        lastError: error instanceof Error ? error.message : "BFS replay failed",
      };
    }
  }

  if (action.type === "apply" && current.events.length >= MAX_INTERACTION_EVENTS) {
    return {
      ...current,
      previewScript: current.committedScript,
      lastError: `沙盒最多记录 ${MAX_INTERACTION_EVENTS} 个操作；请先应用到新版本或重置。`,
    };
  }

  try {
    const result = applyInteraction(
      current.committedScript,
      action.command,
      current.events.length + 1,
    );
    assertSameTimeline(action.baseScript, result.script);
    if (action.type === "preview") {
      return {
        ...current,
        baseKey: action.baseKey,
        baseScript: action.baseScript,
        previewScript: result.script,
        lastError: null,
      };
    }
    return {
      ...current,
      baseKey: action.baseKey,
      baseScript: action.baseScript,
      committedScript: result.script,
      previewScript: result.script,
      commands: [...current.commands, action.command],
      events: [...current.events, result.event],
      latestReplay: result.replay ?? null,
      lastError: null,
    };
  } catch (error) {
    return {
      ...current,
      previewScript: current.committedScript,
      lastError: error instanceof Error ? error.message : "Interaction failed",
    };
  }
}

export interface InteractionSandbox {
  previewScript: PlaybookScript;
  manifest: InteractionManifest;
  events: InteractionEvent[];
  latestReplay: BfsInteractionReplay | null;
  dirty: boolean;
  canUndo: boolean;
  lastError: string | null;
  preview: (command: InteractionCommand) => void;
  cancelPreview: () => void;
  showReplayFrame: (replay: BfsInteractionReplay, frameIndex: number) => void;
  apply: (command: InteractionCommand) => void;
  undo: () => void;
  reset: () => void;
}

export function useInteractionSandbox(
  baseScript: PlaybookScript,
  sessionKey = "",
): InteractionSandbox {
  const baseKey = useMemo(
    () => `${sessionKey}\u0000${scriptContentKey(baseScript)}`,
    [baseScript, sessionKey],
  );
  const [storedState, dispatch] = useReducer(
    reducer,
    { baseScript, baseKey },
    (base) => initialState(base.baseScript, base.baseKey),
  );
  const state = storedState.baseKey === baseKey
    ? storedState
    : initialState(baseScript, baseKey);

  useEffect(() => {
    if (storedState.baseKey !== baseKey) {
      dispatch({ type: "sync", baseScript, baseKey });
    }
  }, [baseKey, baseScript, storedState.baseKey]);

  const manifest = useMemo(
    () => deriveInteractionManifest(state.previewScript),
    [state.previewScript],
  );
  const preview = useCallback((command: InteractionCommand) => {
    dispatch({ type: "preview", baseScript, baseKey, command });
  }, [baseKey, baseScript]);
  const cancelPreview = useCallback(() => {
    dispatch({ type: "cancel-preview", baseScript, baseKey });
  }, [baseKey, baseScript]);
  const showReplayFrameAt = useCallback((
    replay: BfsInteractionReplay,
    frameIndex: number,
  ) => {
    dispatch({ type: "show-replay-frame", baseScript, baseKey, replay, frameIndex });
  }, [baseKey, baseScript]);
  const apply = useCallback((command: InteractionCommand) => {
    dispatch({ type: "apply", baseScript, baseKey, command });
  }, [baseKey, baseScript]);
  const undo = useCallback(() => {
    dispatch({ type: "undo", baseScript, baseKey });
  }, [baseKey, baseScript]);
  const reset = useCallback(() => {
    dispatch({ type: "reset", baseScript, baseKey });
  }, [baseKey, baseScript]);

  return {
    previewScript: state.previewScript,
    manifest,
    events: state.events,
    latestReplay: state.latestReplay,
    dirty: state.events.length > 0,
    canUndo: state.events.length > 0,
    lastError: state.lastError,
    preview,
    cancelPreview,
    showReplayFrame: showReplayFrameAt,
    apply,
    undo,
    reset,
  };
}
