import React from "react";
import "katex/dist/katex.min.css";
import { clamp01 } from "../foundation";
import { sanitizeKatex } from "../../../../shared/lib/sanitizeKatex";
import type { MathFormulaSnapshot } from "../types";
import type { RendererProps } from "./types";

/**
 * Renders a static math formula for non-graphable content (vector fields, 2-D
 * region integrals, abstract algebra, etc.). This is the math domain's
 * fallback renderer — *never* the algorithm array boxes — when the LLM does
 * not (or cannot) supply a 1-D curve plot.
 *
 * Layout:
 *   ┌─ step.title (small caps) ──────────────────┐
 *   │                                            │
 *   │         BIG KATEX FORMULA (center)         │
 *   │                                            │
 *   │           caption (one sentence)           │
 *   │                                            │
 *   │  • annotation 1                            │
 *   │  • annotation 2                            │
 *   └────────────────────────────────────────────┘
 */
export const MathFormulaRenderer: React.FC<RendererProps> = ({
  step,
  frame,
  stepStartFrame,
  theme,
}) => {
  const snap = step.snapshot as MathFormulaSnapshot;
  const elapsed = Math.max(0, frame - stepStartFrame);
  const titleOpacity = clamp01(elapsed / 8);
  const formulaOpacity = clamp01((elapsed - 4) / 14);
  const captionOpacity = clamp01((elapsed - 14) / 14);
  const annotationOpacity = clamp01((elapsed - 22) / 16);

  const formulaHtml = React.useMemo(() => {
    const src = snap.formula_latex ?? "";
    if (!src.trim()) return null;
    const html = sanitizeKatex(src, { displayMode: true });
    return html || null;
  }, [snap.formula_latex]);

  const annotations = (snap.annotations ?? []).filter((a) => a && a.trim().length > 0);

  return (
    <div className="math-formula-renderer" data-theme={theme}>
      <div className="math-formula-renderer__title" style={{ opacity: titleOpacity }}>
        {step.title}
      </div>

      {formulaHtml ? (
        <div
          className="math-formula-renderer__formula"
          style={{ opacity: formulaOpacity }}
          dangerouslySetInnerHTML={{ __html: formulaHtml }}
        />
      ) : (
        <div
          className="math-formula-renderer__placeholder"
          style={{ opacity: formulaOpacity }}
        >
          公式缺失
        </div>
      )}

      {snap.caption && snap.caption.trim() && (
        <div
          className="math-formula-renderer__caption"
          style={{ opacity: captionOpacity }}
        >
          {snap.caption}
        </div>
      )}

      {annotations.length > 0 && (
        <div
          className="math-formula-renderer__annotations"
          style={{ opacity: annotationOpacity }}
        >
          {annotations.map((a, i) => (
            <div key={i} className="math-formula-renderer__annotation">
              {a}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
