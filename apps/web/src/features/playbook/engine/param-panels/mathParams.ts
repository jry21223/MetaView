import type { PlaybookScript } from "../types";

const PARAM_ID_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

type ParameterControl = PlaybookScript["parameter_controls"][number];

export interface EditableMathControl {
  control: ParameterControl;
  initial: number;
}

function parseNumber(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

export function resolveEditableMathControls(
  parameterControls: PlaybookScript["parameter_controls"] | undefined,
): EditableMathControl[] {
  const controls: EditableMathControl[] = [];
  for (const control of parameterControls ?? []) {
    const initial = parseNumber(control.value);
    if (initial == null || !PARAM_ID_RE.test(control.id)) continue;
    controls.push({ control, initial });
  }
  return controls;
}

export function hasEditableMathParams(
  parameterControls: PlaybookScript["parameter_controls"] | undefined,
): boolean {
  return resolveEditableMathControls(parameterControls).length > 0;
}
