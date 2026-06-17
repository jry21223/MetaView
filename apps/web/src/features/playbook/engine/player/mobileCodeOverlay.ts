import type { CodeHighlightOverlay } from "../types";

const CODE_CONTEXT_LINES = 2;

export interface ClippedCodeOverlay {
  overlay: CodeHighlightOverlay;
  lineNumberOffset: number;
  fromLine: number;
  toLine: number;
  totalLines: number;
}

export function clipCodeOverlay(
  overlay: CodeHighlightOverlay | null,
  contextLines = CODE_CONTEXT_LINES,
): ClippedCodeOverlay | null {
  if (!overlay || overlay.lines.length === 0) return null;
  const anchor = Math.max(
    0,
    Math.min(
      overlay.lines.length - 1,
      overlay.active_line >= 0 ? overlay.active_line : overlay.active_lines[0] ?? 0,
    ),
  );
  const from = Math.max(0, anchor - contextLines);
  const to = Math.min(overlay.lines.length - 1, anchor + contextLines);
  const activeLines = overlay.active_lines
    .filter((line) => line >= from && line <= to)
    .map((line) => line - from);

  return {
    overlay: {
      ...overlay,
      lines: overlay.lines.slice(from, to + 1),
      active_line: anchor - from,
      active_lines: activeLines.length ? activeLines : [anchor - from],
    },
    lineNumberOffset: from,
    fromLine: from + 1,
    toLine: to + 1,
    totalLines: overlay.lines.length,
  };
}
