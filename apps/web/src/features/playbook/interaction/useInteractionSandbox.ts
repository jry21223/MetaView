import { useCallback, useEffect, useMemo, useReducer } from "react";

import type { PlaybookScript } from "../engine/types";
import { applyInteraction, deriveInteractionManifest } from "./engine";
import type {
  InteractionCommand,
  InteractionEvent,
  InteractionManifest,
} from "./types";

interface InteractionSandboxState {
  baseScript: PlaybookScript;
  previewScript: PlaybookScript;
  commands: InteractionCommand[];
  events: InteractionEvent[];
  lastError: string | null;
}

type InteractionSandboxAction =
  | { type: "sync"; baseScript: PlaybookScript }
  | { type: "apply"; baseScript: PlaybookScript; command: InteractionCommand }
  | { type: "undo"; baseScript: PlaybookScript }
  | { type: "reset"; baseScript: PlaybookScript };

function initialState(baseScript: PlaybookScript): InteractionSandboxState {
  return {
    baseScript,
    previewScript: baseScript,
    commands: [],
    events: [],
    lastError: null,
  };
}

function replay(
  baseScript: PlaybookScript,
  commands: InteractionCommand[],
): InteractionSandboxState {
  let previewScript = baseScript;
  const events: InteractionEvent[] = [];
  try {
    commands.forEach((command, index) => {
      const result = applyInteraction(previewScript, command, index + 1);
      previewScript = result.script;
      events.push(result.event);
    });
    return {
      baseScript,
      previewScript,
      commands,
      events,
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

  try {
    const result = applyInteraction(
      current.previewScript,
      action.command,
      current.events.length + 1,
    );
    return {
      ...current,
      previewScript: result.script,
      commands: [...current.commands, action.command],
      events: [...current.events, result.event],
      lastError: null,
    };
  } catch (error) {
    return {
      ...current,
      lastError: error instanceof Error ? error.message : "Interaction failed",
    };
  }
}

export interface InteractionSandbox {
  previewScript: PlaybookScript;
  manifest: InteractionManifest;
  events: InteractionEvent[];
  dirty: boolean;
  canUndo: boolean;
  lastError: string | null;
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
    dirty: state.events.length > 0,
    canUndo: state.events.length > 0,
    lastError: state.lastError,
    apply,
    undo,
    reset,
  };
}
