import type { ReactNode } from "react";
import type { TemplatePreviewCaseId } from "./templatePreviewCases";

const LINE_PREVIEWS: Record<TemplatePreviewCaseId, ReactNode> = {
  "binary-search": (
    <svg viewBox="0 0 160 56" fill="none">
      <path className="is-guide" d="M20 13v-5h116v5M20 43v5h116v-5" />
      {[24, 42, 60, 78, 96, 114, 132].map((x, index) => (
        <rect key={x} className={index === 3 ? "is-accent" : undefined} x={x} y="19" width="14" height="18" rx="2" />
      ))}
      <path className="is-accent" d="M85 8v8m-4-4 4 4 4-4" />
    </svg>
  ),
  "bfs-tree": (
    <svg viewBox="0 0 160 56" fill="none">
      <path className="is-guide" d="M80 12 48 27m32-15 32 15M48 27 32 42m16-15 16 15m48-15-16 15m16-15 16 15" />
      <circle className="is-accent" cx="80" cy="10" r="5" />
      <circle cx="48" cy="27" r="4" /><circle cx="112" cy="27" r="4" />
      <circle cx="32" cy="44" r="3.5" /><circle cx="64" cy="44" r="3.5" />
      <circle cx="96" cy="44" r="3.5" /><circle cx="128" cy="44" r="3.5" />
      <path className="is-accent" d="M20 52h40" />
    </svg>
  ),
  "derivative-tangent": (
    <svg viewBox="0 0 160 56" fill="none">
      <path className="is-guide" d="M18 45h124M40 50V7" />
      <path d="M28 43c18-1 26-4 34-11 10-9 18-22 34-22 13 0 23 10 36 31" />
      <path className="is-accent" d="m55 42 64-31" />
      <circle className="is-accent" cx="83" cy="28" r="3.5" />
    </svg>
  ),
  "ellipse-focus-definition": (
    <svg viewBox="0 0 160 56" fill="none" data-preview-geometry="ellipse-focal-sum">
      <path className="is-guide is-dashed" d="M22 28h116" data-object="focal-axis" />
      <ellipse cx="80" cy="28" rx="52" ry="20" data-object="conic" />
      <path className="is-guide" d="M58 28 106 13" data-object="focal-distance" />
      <path className="is-accent" d="M106 13 102 28" data-object="focal-distance" />
      <circle cx="58" cy="28" r="2.7" data-object="focus" />
      <circle cx="102" cy="28" r="2.7" data-object="focus" />
      <circle className="is-accent" cx="106" cy="13" r="3.4" data-object="moving-point" />
    </svg>
  ),
  "parabola-focus-directrix": (
    <svg viewBox="0 0 160 56" fill="none" data-preview-geometry="parabola-focus-directrix">
      <path className="is-guide" d="M43 28h91" data-object="axis" />
      <path className="is-guide is-dashed" d="M59 4v48" data-object="directrix" />
      <path d="M112 4C80 8 64 16 64 28s16 20 48 24" data-object="conic" />
      <path className="is-guide" d="M80 10H59" data-object="directrix-distance" />
      <path className="is-accent" d="M80 10 69 28" data-object="focal-distance" />
      <circle cx="69" cy="28" r="2.8" data-object="focus" />
      <circle cx="59" cy="10" r="2.1" data-object="projection-foot" />
      <circle className="is-accent" cx="80" cy="10" r="3.4" data-object="moving-point" />
    </svg>
  ),
  "hyperbola-asymptotes": (
    <svg viewBox="0 0 160 56" fill="none" data-preview-geometry="hyperbola-asymptotes">
      <path className="is-guide" d="M18 28h124M80 4v48" data-object="axes" />
      <path className="is-guide is-dashed" d="m28 51 104-46M28 5l104 46" data-object="asymptotes" />
      <path d="M34 5c18 7 29 16 31 23-2 7-13 16-31 23" data-object="conic-branch" />
      <path d="M126 5c-18 7-29 16-31 23 2 7 13 16 31 23" data-object="conic-branch" />
      <circle className="is-accent" cx="111" cy="11" r="3.4" data-object="moving-point" />
    </svg>
  ),
  "line-ellipse-position": (
    <svg viewBox="0 0 160 56" fill="none" data-preview-geometry="line-ellipse-position">
      <path className="is-guide is-dotted" d="M31 4h98" data-object="disjoint-reference" />
      <path className="is-guide is-dashed" d="M31 9h98" data-object="tangent-reference" />
      <ellipse cx="80" cy="28" rx="48" ry="19" data-object="conic" />
      <path className="is-accent" d="m24 45 112-34" data-object="secant" />
      <circle className="is-accent" cx="48" cy="38" r="3" data-object="intersection" />
      <circle className="is-accent" cx="113" cy="18" r="3" data-object="intersection" />
    </svg>
  ),
  "ellipse-chord-midpoint-locus": (
    <svg viewBox="0 0 160 56" fill="none" data-preview-geometry="ellipse-chord-midpoint-locus">
      <ellipse cx="80" cy="28" rx="52" ry="20" data-object="conic" />
      <ellipse className="is-accent is-dashed" cx="88" cy="28" rx="13" ry="7" data-object="theoretical-locus" />
      <path className="is-guide" d="m36 43 86-28" data-object="chord" />
      <circle cx="38" cy="42.3" r="2.5" data-object="chord-endpoint" />
      <circle cx="120" cy="15.7" r="2.5" data-object="chord-endpoint" />
      <circle cx="95" cy="23.8" r="2.6" data-object="fixed-point" />
      <circle className="is-accent" cx="80" cy="24" r="1.7" data-object="locus-trail" />
      <circle className="is-accent" cx="88" cy="21" r="1.7" data-object="locus-trail" />
      <circle className="is-accent" cx="97" cy="24" r="1.7" data-object="locus-trail" />
      <circle className="is-accent" cx="79" cy="29" r="3.4" data-object="chord-midpoint" />
    </svg>
  ),
  "pole-polar": (
    <svg viewBox="0 0 160 56" fill="none">
      <path className="is-guide" d="M18 48h126M42 53V5" />
      <circle cx="76" cy="29" r="19" />
      <path d="m94 13 34 4M94 45l34-28" />
      <path className="is-accent" d="m94 13 0 32" />
      <circle className="is-accent" cx="128" cy="17" r="3.5" />
      <circle cx="94" cy="13" r="2.5" /><circle cx="94" cy="45" r="2.5" />
    </svg>
  ),
  projectile: (
    <svg viewBox="0 0 160 56" fill="none">
      <path className="is-guide" d="M16 47h130" />
      <path d="M25 45c26-36 61-39 108 0" />
      <path className="is-accent" d="m27 44 18-20m0 0-1 7m1-7-7 2" />
      <circle className="is-accent" cx="80" cy="17" r="3.5" />
    </svg>
  ),
};

export function TemplateLinePreview({ caseId }: { caseId?: TemplatePreviewCaseId }) {
  if (!caseId) {
    return (
      <span className="mv-template-entry__placeholder" aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
    );
  }

  return (
    <span className="mv-template-entry__line-preview" data-preview={caseId} aria-hidden="true">
      {LINE_PREVIEWS[caseId]}
    </span>
  );
}
