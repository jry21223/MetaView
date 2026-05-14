import React from "react";
import type { NarrationCardSnapshot } from "../types";
import type { RendererProps } from "./types";
import { clamp01 } from "../foundation";

/**
 * A floating narration card overlayed on the scene. Used by the LLM to drop
 * teacher-style hints ("注意：导数 = 切线斜率") atop the visual without
 * pushing it into the always-on subtitle bar.
 */
export const NarrationCardRenderer: React.FC<RendererProps> = ({
  step,
  frame,
  stepStartFrame,
  theme,
}) => {
  const snap = step.snapshot as NarrationCardSnapshot;
  const elapsed = Math.max(0, frame - stepStartFrame);
  const opacity = clamp01((elapsed - 4) / 14);

  if (!snap.text || !snap.text.trim()) return null;

  return (
    <div
      className="narration-card"
      data-theme={theme}
      data-position={snap.position ?? "bottom"}
      data-emphasis={snap.emphasis ?? "primary"}
      style={{ opacity }}
    >
      <div className="narration-card__inner">{snap.text}</div>
    </div>
  );
};
