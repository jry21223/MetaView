import { resolveAssetForRenderer } from "../../assets/assetResolver";
import type { CallStackCodeTrace, CallStackFrame, CallStackSceneSnapshot, CodeHighlightOverlay } from "../../types";

export interface CallStackFrameInput {
  id: string;
  label?: string | null;
  depth?: number | null;
  state?: string | null;
  assetId?: string | null;
  variables?: Record<string, string | number | boolean | null | undefined> | null;
}

export interface CallStackCodeTraceInput {
  language?: string | null;
  lines?: string[] | null;
  activeLines?: number[] | null;
  activeLine?: number | null;
  assetId?: string | null;
}

export interface CallStackLayoutInput {
  packId: string;
  frames?: CallStackFrameInput[] | null;
  currentFrameId?: string | null;
  codeTrace?: CallStackCodeTraceInput | null;
  caption?: string | null;
  visualIntent?: string[];
}

export interface CallStackLayoutResult {
  snapshot: CallStackSceneSnapshot;
  codeHighlight: CodeHighlightOverlay;
}

const DEFAULT_FRAMES: CallStackFrameInput[] = [
  {
    id: "factorial-4",
    label: "factorial(4)",
    depth: 0,
    state: "active",
    variables: { n: "4" },
  },
  {
    id: "factorial-3",
    label: "factorial(3)",
    depth: 1,
    state: "waiting",
    variables: { n: "3" },
  },
  {
    id: "factorial-2",
    label: "factorial(2)",
    depth: 2,
    state: "waiting",
    variables: { n: "2" },
  },
];

const DEFAULT_CODE_TRACE: Required<Pick<CallStackCodeTrace, "language" | "lines" | "active_lines" | "active_line">> = {
  language: "python",
  lines: [
    "def factorial(n):",
    "    if n == 1:",
    "        return 1",
    "    return n * factorial(n - 1)",
  ],
  active_lines: [3],
  active_line: 3,
};

function resolveAssetId(packId: string, semanticRole: string, fallbacks: string[] = []): string | undefined {
  for (const role of [semanticRole, ...fallbacks]) {
    const asset =
      resolveAssetForRenderer("call_stack_scene", role, packId) ??
      resolveAssetForRenderer("call_stack_scene", role);
    if (asset) return asset.id;
  }
  return undefined;
}

function normalizeVariables(
  variables: CallStackFrameInput["variables"],
): Record<string, string> | undefined {
  if (!variables) return undefined;
  return Object.fromEntries(
    Object.entries(variables)
      .filter((entry): entry is [string, string | number | boolean] => entry[1] !== null && entry[1] !== undefined)
      .map(([key, value]) => [key, String(value)]),
  );
}

function normalizeFrames(
  input: CallStackLayoutInput,
  callFrameAssetId: string | undefined,
  stackFrameAssetId: string | undefined,
): CallStackFrame[] {
  const frames = input.frames?.length ? input.frames : DEFAULT_FRAMES;
  const currentFrameId = input.currentFrameId ?? frames.find((frame) => frame.state === "active")?.id ?? frames[0]?.id;
  return frames.map((frame, index) => {
    const state = frame.state ?? (frame.id === currentFrameId ? "active" : "waiting");
    const active = state === "active" || frame.id === currentFrameId;
    return {
      id: frame.id,
      label: frame.label ?? frame.id,
      depth: Math.max(0, Math.round(frame.depth ?? index)),
      state,
      asset_id: frame.assetId ?? (active ? callFrameAssetId : stackFrameAssetId),
      variables: normalizeVariables(frame.variables),
    };
  });
}

function normalizeCodeTrace(
  codeTrace: CallStackLayoutInput["codeTrace"],
  activeLineAssetId: string | undefined,
): CallStackCodeTrace {
  const lines = codeTrace?.lines?.length ? codeTrace.lines : DEFAULT_CODE_TRACE.lines;
  const activeLine = Math.max(
    0,
    Math.min(lines.length - 1, Math.round(codeTrace?.activeLine ?? DEFAULT_CODE_TRACE.active_line)),
  );
  return {
    language: codeTrace?.language ?? DEFAULT_CODE_TRACE.language,
    lines,
    active_lines: codeTrace?.activeLines?.length ? codeTrace.activeLines : [activeLine],
    active_line: activeLine,
    asset_id: codeTrace?.assetId ?? activeLineAssetId,
  };
}

export function compileCallStackLayout(input: CallStackLayoutInput): CallStackLayoutResult {
  const stackAssetId = resolveAssetId(input.packId, "recursion_stack", ["call_stack_scene", "call_stack"]);
  const callFrameAssetId = resolveAssetId(input.packId, "call_frame", ["active_frame"]);
  const stackFrameAssetId = resolveAssetId(input.packId, "stack_frame", ["waiting_frame"]);
  const activeLineAssetId = resolveAssetId(input.packId, "active_line", ["code_trace"]);
  const frames = normalizeFrames(input, callFrameAssetId, stackFrameAssetId);
  const currentFrameId = input.currentFrameId ?? frames.find((frame) => frame.state === "active")?.id ?? frames[0]?.id;
  const codeTrace = normalizeCodeTrace(input.codeTrace, activeLineAssetId);

  return {
    snapshot: {
      kind: "call_stack_scene",
      pack_id: input.packId,
      asset_id: stackAssetId,
      frames,
      code_trace: codeTrace,
      current_frame_id: currentFrameId,
      caption: input.caption ?? "Recursive calls form a stack frame for each pending operation.",
    },
    codeHighlight: {
      language: codeTrace.language,
      lines: codeTrace.lines,
      active_lines: codeTrace.active_lines,
      active_line: codeTrace.active_line,
      variables: {
        intent: input.visualIntent?.join(", ") ?? "",
        current_frame: currentFrameId ?? "",
      },
      operation_label: "recursive call",
    },
  };
}
