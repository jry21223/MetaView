import type React from "react";
import type { PlaybookScript } from "../types";
import type { ScriptOverrides } from "../player/useResolvedScript";

export interface ParamPanelProps {
  script: PlaybookScript;
  overrides: ScriptOverrides;
  onOverridesChange: (next: ScriptOverrides) => void;
  isDark: boolean;
}

export type ParamPanelComponent = React.FC<ParamPanelProps>;
