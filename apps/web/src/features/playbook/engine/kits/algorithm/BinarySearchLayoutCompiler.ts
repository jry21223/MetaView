import binarySearchPreset from "../../../../../../public/assets/metaview-kits/algorithm-code-basic/code/binary-search-trace-preset.json";

import { resolveAssetForRenderer } from "../../assets/assetResolver";
import type { CodeHighlightOverlay, CodeTraceSceneSnapshot } from "../../types";

interface BinarySearchPreset {
  arrayValues: string[];
  target: string;
}

export interface BinarySearchLayoutInput {
  packId: string;
  arrayValues?: Array<string | number> | null;
  target?: string | number | null;
  caption?: string | null;
  visualIntent?: string[];
}

export interface BinarySearchLayoutResult {
  snapshot: CodeTraceSceneSnapshot;
  codeHighlight: CodeHighlightOverlay;
}

const PRESET = binarySearchPreset as BinarySearchPreset;

export function binarySearchLines(): string[] {
  return [
    "function binarySearch(nums, target) {",
    "  let low = 0, high = nums.length - 1;",
    "  const mid = Math.floor((low + high) / 2);",
    "  if (nums[mid] === target) return mid;",
    "  return nums[mid] < target ? searchRight() : searchLeft();",
    "}",
  ];
}

function normalizedArrayValues(values: BinarySearchLayoutInput["arrayValues"]): string[] {
  if (Array.isArray(values) && values.length > 0) {
    return values.map((value) => String(value));
  }
  return PRESET.arrayValues.map((value) => String(value));
}

function normalizedTarget(target: BinarySearchLayoutInput["target"], values: string[]): string {
  if (target !== null && target !== undefined && String(target).trim()) return String(target);
  return PRESET.target ?? values[Math.floor((values.length - 1) / 2)] ?? "";
}

function resolveAssetId(packId: string, semanticRole: string, fallbacks: string[] = []): string | undefined {
  for (const role of [semanticRole, ...fallbacks]) {
    const asset = resolveAssetForRenderer("code_trace_scene", role, packId) ?? resolveAssetForRenderer("code_trace_scene", role);
    if (asset) return asset.id;
  }
  return undefined;
}

export function compileBinarySearchCodeTraceLayout(input: BinarySearchLayoutInput): BinarySearchLayoutResult {
  const values = normalizedArrayValues(input.arrayValues);
  const target = normalizedTarget(input.target, values);
  const low = 0;
  const high = Math.max(0, values.length - 1);
  const mid = Math.floor((low + high) / 2);
  const traceAssetId = resolveAssetId(input.packId, "binary_search", ["code_trace_scene", "code_trace"]);
  const activeLineAssetId = resolveAssetId(input.packId, "active_line", ["code_trace"]);
  const pointerAssetId = resolveAssetId(input.packId, "pointer", ["active_pointer", "index_pointer"]);
  const activeLines = values[mid] === target ? [2, 3] : [2, 4];
  const lines = binarySearchLines();
  const variables = {
    target,
    low: String(low),
    mid: String(mid),
    high: String(high),
  };

  return {
    snapshot: {
      kind: "code_trace_scene",
      pack_id: input.packId,
      asset_id: traceAssetId,
      language: "typescript",
      lines,
      active_lines: activeLines,
      active_line: 2,
      active_line_asset_id: activeLineAssetId,
      array_values: values,
      active_indices: [mid],
      search_range: [low, high],
      pointers: [
        { id: "low", label: "low", index: low, asset_id: pointerAssetId },
        { id: "mid", label: "mid", index: mid, asset_id: pointerAssetId },
        { id: "high", label: "high", index: high, asset_id: pointerAssetId },
      ],
      variables,
      caption: input.caption ?? "Binary search checks the middle element before discarding half the range.",
    },
    codeHighlight: {
      language: "typescript",
      lines,
      active_lines: activeLines,
      active_line: 2,
      variables: {
        intent: input.visualIntent?.join(", ") ?? "",
        ...variables,
      },
      operation_label: "compare midpoint",
    },
  };
}
