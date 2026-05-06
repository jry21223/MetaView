import type { CodeHighlightOverlay, PlaybookScript } from "../types";

function findFirstSourceOverlay(script: PlaybookScript): CodeHighlightOverlay | null {
  for (const step of script.steps) {
    if (step.code_highlight && step.code_highlight.lines.length > 0) {
      return step.code_highlight;
    }
  }
  return null;
}

export function resolveCodePanelOverlay(
  script: PlaybookScript,
  stepIndex: number,
): CodeHighlightOverlay | null {
  const step = script.steps[stepIndex];
  if (step?.code_highlight && step.code_highlight.lines.length > 0) {
    return step.code_highlight;
  }
  // Fallback: borrow first available source, distribute active line proportionally.
  const template = findFirstSourceOverlay(script);
  if (!template) return null;
  const total = Math.max(1, script.steps.length);
  const lineCount = template.lines.length;
  const activeLine = Math.min(
    lineCount - 1,
    Math.floor((stepIndex * lineCount) / total),
  );
  return {
    language: template.language,
    lines: template.lines,
    active_lines: [activeLine],
    active_line: activeLine,
    variables: {},
  };
}
