import React from "react";

import { getParamPanel } from "../param-panels/registry";
import type { ParamPanelProps } from "../param-panels/types";

export function ParamPanelSlot({ domain, ...props }: ParamPanelProps & { domain: string }) {
  const Panel = getParamPanel(domain);
  if (!Panel) return null;
  return React.createElement(Panel, props);
}
