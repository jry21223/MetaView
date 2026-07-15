import { useCallback, useEffect, useMemo, useReducer } from "react";

import type { PlaybookScript } from "../engine/types";
import { applyInteraction, deriveInteractionManifest } from "./engine";
import type {
  BfsInteractionReplay,
  InteractionCommand,
  InteractionEvent,
  InteractionManifest,
} from "./types";

interface InteractionSandboxState {
  baseScript: PlaybookScript;
  committedScript: PlaybookScript;
  previewScript: PlaybookScript;
  commands: InteractionCommand[];
  events: InteractionEvent[];
  replays: BfsInteractionReplay[];
  lastError: string | null;
}

type InteractionSandboxAction =
  | { type: "sync"; baseScript: PlaybookScript }
  | { type: "preview"; baseScript: PlaybookScript; command: InteractionCommand }
  | { type: "cancel-preview"; baseScript: PlaybookScript }
  | { type: "apply"; baseScript: PlaybookScript; command: InteractionCommand }
  | { type: "undo"; baseScript: PlaybookScript }
  | { type: "reset"; baseScript: PlaybookScript };

function initialState(baseScript: PlaybookScript): InteractionSandboxState {
  return {
    baseScript,
    committedScript: baseScript,
    previewScript: baseScript,
    commands: [],
    events: [],
    replays: [],
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
  commands: InteractionCommand[],
): InteractionSandboxState {
  let committedScript = baseScript;
  const events: InteractionEvent[] = [];
  const replays: BfsInteractionReplay[] = [];
  try {
    commands.forEach((command, index) => {
      const result = applyInteraction(committedScript, command, index + 1);
      assertSameTimeline(baseScript, result.script);
      committedScript = result.script;
      events.push(result.event);
      if (result.replay) replays.push(result.replay);
    });
    return {
      baseScript,
      committedScript,
      previewScript: committedScript,
      commands,
      events,
      replays,
      lastError: null,
    };
  } catch (error) {
    return {
      ...initialState(baseScript),
      lastError: error instanceof Error ? error.message : "Interaction replay failed",
    };
  }
}

function reducer(
  state: InteractionSandboxState,
  action: InteractionSandboxAction,
): InteractionSandboxState {
  const current = state.baseScript === action.baseScript
    ? state
    : initialState(action.baseScript);

  if (action.type === "sync" || action.type === "reset") {
    return initialState(action.baseScript);
  }
  if (action.type === "undo") {
    return replay(action.baseScript, current.commands.slice(0, -1));
  }
  if (action.type === "cancel-preview") {
    return {
      ...current,
      previewScript: current.committedScript,
      lastError: null,
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
        previewScript: result.script,
        lastError: null,
      };
    }
    return {
      ...current,
      committedScript: result.script,
      previewScript: result.script,
      commands: [...current.commands, action.command],
      events: [...current.events, result.event],
      replays: result.replay ? [...current.replays, result.replay] : current.replays,
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
  apply: (command: InteractionCommand) => void;
  undo: () => void;
  reset: () => void;
}

export function useInteractionSandbox(baseScript: PlaybookScript): InteractionSandbox {
  const [storedState, dispatch] = useReducer(reducer, baseScript, initialState);
  const state = storedState.baseScript === baseScript
    ? storedState
    : initialState(baseScript);

  useEffect(() => {
    if (storedState.baseScript !== baseScript) {
      dispatch({ type: "sync", baseScript });
    }
  }, [baseScript, storedState.baseScript]);

  const manifest = useMemo(
    () => deriveInteractionManifest(state.previewScript),
    [state.previewScript],
  );
  const preview = useCallback((command: InteractionCommand) => {
    dispatch({ type: "preview", baseScript, command });
  }, [baseScript]);
  const cancelPreview = useCallback(() => {
    dispatch({ type: "cancel-preview", baseScript });
  }, [baseScript]);
  const apply = useCallback((command: InteractionCommand) => {
    dispatch({ type: "apply", baseScript, command });
  }, [baseScript]);
  const undo = useCallback(() => {
    dispatch({ type: "undo", baseScript });
  }, [baseScript]);
  const reset = useCallback(() => {
    dispatch({ type: "reset", baseScript });
  }, [baseScript]);

  return {
    previewScript: state.previewScript,
    manifest,
    events: state.events,
    latestReplay: state.replays.at(-1) ?? null,
    dirty: state.events.length > 0,
    canUndo: state.events.length > 0,
    lastError: state.lastError,
    preview,
    cancelPreview,
    apply,
    undo,
    reset,
  };
}
