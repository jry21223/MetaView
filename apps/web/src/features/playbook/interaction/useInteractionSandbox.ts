import { useEffect, useMemo, useReducer } from "react";

import type { PlaybookScript } from "../engine/types";
import { applyInteraction, deriveInteractionManifest } from "./engine";
import type {
  BfsInteractionReplay,
  InteractionCommand,
  InteractionEvent,
  InteractionManifest,
} from "./types";

interface InteractionSandboxState {
  baseKey: string;
  baseScript: PlaybookScript;
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
  let previewScript = baseScript;
  const appliedCommands: InteractionCommand[] = [];
  const events: InteractionEvent[] = [];
  let latestReplay: BfsInteractionReplay | null = null;

  for (const command of commands) {
    try {
      const result = applyInteraction(previewScript, command, events.length + 1);
      assertSameTimeline(baseScript, result.script);
      previewScript = result.script;
      appliedCommands.push(command);
      events.push(result.event);
      latestReplay = result.replay ?? null;
    } catch (error) {
      return {
        baseKey,
        baseScript,
        previewScript,
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
    previewScript,
    commands: appliedCommands,
    events,
    latestReplay,
    lastError: null,
  };
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

  try {
    const result = applyInteraction(
      current.previewScript,
      action.command,
      current.events.length + 1,
    );
    assertSameTimeline(action.baseScript, result.script);
    return {
      ...current,
      baseKey: action.baseKey,
      baseScript: action.baseScript,
      previewScript: result.script,
      commands: [...current.commands, action.command],
      events: [...current.events, result.event],
      latestReplay: result.replay ?? null,
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
  latestReplay: BfsInteractionReplay | null;
  dirty: boolean;
  canUndo: boolean;
  lastError: string | null;
  apply: (command: InteractionCommand) => void;
  undo: () => void;
  reset: () => void;
}

export function useInteractionSandbox(baseScript: PlaybookScript): InteractionSandbox {
  const baseKey = useMemo(() => scriptContentKey(baseScript), [baseScript]);
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
  const apply = (command: InteractionCommand) => {
    dispatch({ type: "apply", baseScript, baseKey, command });
  };
  const undo = () => {
    dispatch({ type: "undo", baseScript, baseKey });
  };
  const reset = () => {
    dispatch({ type: "reset", baseScript, baseKey });
  };

  return {
    previewScript: state.previewScript,
    manifest,
    events: state.events,
    latestReplay: state.latestReplay,
    dirty: state.events.length > 0,
    canUndo: state.events.length > 0,
    lastError: state.lastError,
    apply,
    undo,
    reset,
  };
}
