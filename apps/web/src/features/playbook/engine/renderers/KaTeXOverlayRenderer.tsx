import React from "react";
import "katex/dist/katex.min.css";
import type { KaTeXOverlaySnapshot } from "../types";
import type { RendererProps } from "./types";
import { sanitizeKatex } from "../../../../shared/lib/sanitizeKatex";
import { clamp01 } from "../foundation";

const ALIGN_OFFSETS: Record<string, { tx: string; ty: string }> = {
  ne: { tx: "0%", ty: "-100%" },
  nw: { tx: "-100%", ty: "-100%" },
  se: { tx: "0%", ty: "0%" },
  sw: { tx: "-100%", ty: "0%" },
  center: { tx: "-50%", ty: "-50%" },
};

/**
 * Floating KaTeX label rendered above the scene viewport.
 *
 * The (x, y) in scene coordinates is converted to a percentage of the visible
 * viewport using the same x_min/x_max/y_min/y_max that the underlying
 * MathSceneSnapshot uses. When this layer is rendered standalone (no scene
 * sibling), the wrapper falls back to a centred KaTeX block so the prompt
 * author's content is never lost.
 */
export const KaTeXOverlayRenderer: React.FC<RendererProps> = ({
  step,
  frame,
  stepStartFrame,
  theme,
}) => {
  const snap = step.snapshot as KaTeXOverlaySnapshot;
  const elapsed = Math.max(0, frame - stepStartFrame);
  const opacity = clamp01(elapsed / 10);
  const html = React.useMemo(() => {
    const rendered = sanitizeKatex(snap.latex);
    return rendered || null;
  }, [snap.latex]);
  if (!html) return null;

  const offsets = ALIGN_OFFSETS[snap.align ?? "ne"] ?? ALIGN_OFFSETS.ne;

  // Convert scene-space (x, y) into percentages of the parent scene's
  // viewport. The snapshot may carry its own bounds (set by the layer
  // builder); otherwise fall back to the default ±5 box used by SceneSpec.
  const xMin = snap.x_min ?? -5;
  const xMax = snap.x_max ?? 5;
  const yMin = snap.y_min ?? -5;
  const yMax = snap.y_max ?? 5;
  const xSpan = xMax - xMin || 1;
  const ySpan = yMax - yMin || 1;
  const leftPct = ((snap.x - xMin) / xSpan) * 100;
  const topPct = 100 - ((snap.y - yMin) / ySpan) * 100;

  return (
    <div className="katex-overlay" data-theme={theme} style={{ opacity }}>
      <div
        className="katex-overlay__anchor"
        style={{
          left: `${leftPct}%`,
          top: `${topPct}%`,
          transform: `translate(${offsets.tx}, ${offsets.ty})`,
        }}
      >
        <div dangerouslySetInnerHTML={{ __html: html }} />
      </div>
    </div>
  );
};
