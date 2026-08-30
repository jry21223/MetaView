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
  "sliding-window": (
    <svg viewBox="0 0 160 56" fill="none" data-preview-geometry="sliding-window-max">
      {[18, 36, 54, 72, 90, 108, 126, 144].map((x, index) => (
        <rect
          key={x}
          className={index >= 2 && index <= 4 ? "is-accent" : undefined}
          x={x - 6}
          y={index % 2 === 0 ? 18 : 24}
          width="12"
          height={index % 2 === 0 ? 22 : 16}
          rx="2"
        />
      ))}
      <path className="is-accent" d="M42 10h48M42 10v4m48-4v4" />
      <path className="is-guide" d="M16 48h128" />
    </svg>
  ),
  "merge-sort": (
    <svg viewBox="0 0 160 56" fill="none" data-preview-geometry="merge-sort-divide">
      <path className="is-guide" d="M80 8v12M48 28 80 20m32 8L80 20M32 44 48 28m16 16L48 28m48 16L112 28m16 16-16-16" />
      <rect x="20" y="40" width="10" height="10" rx="1.5" />
      <rect className="is-accent" x="34" y="36" width="10" height="14" rx="1.5" />
      <rect x="48" y="42" width="10" height="8" rx="1.5" />
      <rect className="is-accent" x="62" y="34" width="10" height="16" rx="1.5" />
      <rect x="88" y="38" width="10" height="12" rx="1.5" />
      <rect className="is-accent" x="102" y="32" width="10" height="18" rx="1.5" />
      <rect x="116" y="40" width="10" height="10" rx="1.5" />
      <rect x="130" y="36" width="10" height="14" rx="1.5" />
    </svg>
  ),
  "quick-sort": (
    <svg viewBox="0 0 160 56" fill="none" data-preview-geometry="quick-sort-partition">
      {[22, 38, 54, 70, 86, 102, 118, 134].map((x, index) => (
        <rect
          key={x}
          className={index === 6 ? "is-accent" : undefined}
          x={x - 6}
          y={14 + (index % 4) * 3}
          width="12"
          height={18 + (7 - index) * 2}
          rx="2"
        />
      ))}
      <path className="is-accent" d="M118 8v6m-3-3 3 3 3-3" />
      <path className="is-guide" d="M16 50h50m20 0h58" />
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
  "integral-area": (
    <svg viewBox="0 0 160 56" fill="none" data-preview-geometry="integral-riemann-area">
      <path className="is-guide" d="M18 48h124M26 53V6" data-object="axes" />
      <rect x="42" y="43" width="15" height="5" rx="1" data-object="riemann-rect" />
      <rect x="59" y="38" width="15" height="10" rx="1" data-object="riemann-rect" />
      <rect className="is-accent" x="76" y="30" width="15" height="18" rx="1" data-object="riemann-rect" />
      <rect x="93" y="21" width="15" height="27" rx="1" data-object="riemann-rect" />
      <rect x="110" y="10" width="15" height="38" rx="1" data-object="riemann-rect" />
      <path d="M34 47c28-2 62-14 94-40" data-object="area-curve" />
    </svg>
  ),
  projectile: (
    <svg viewBox="0 0 160 56" fill="none" data-preview-geometry="projectile-trajectory">
      <path className="is-guide" d="M14 48h132" data-object="ground" />
      <path d="M24 48C48 10 112 10 136 48" data-object="trajectory" />
      <path className="is-accent" d="m24 48 20-22m-8 1 8-1 1 8" data-object="launch-velocity" />
      <path className="is-guide is-dashed" d="M80 20v28" data-object="max-height" />
      <circle className="is-accent" cx="80" cy="19" r="3.2" data-object="apex" />
    </svg>
  ),
  "spring-shm": (
    <svg viewBox="0 0 160 56" fill="none" data-preview-geometry="spring-shm-cosine">
      <path className="is-guide" d="M14 28h132" data-object="axis" />
      <path className="is-guide is-dashed" d="M14 9h132M14 47h132" data-object="amplitude-bound" />
      <path d="M14 9c9 0 15 38 26 38s17-38 28-38 17 38 28 38 17-38 28-38 12 19 22 28" data-object="displacement-wave" />
      <circle className="is-accent" cx="14" cy="9" r="3" data-object="release-point" />
      <circle className="is-accent" cx="68" cy="9" r="3" data-object="period-mark" />
    </svg>
  ),
  "logistic-growth": (
    <svg viewBox="0 0 160 56" fill="none" data-preview-geometry="logistic-growth">
      <path className="is-guide" d="M14 46h132M14 46V8" />
      <path className="is-guide is-dashed" d="M14 14h132" data-object="carrying-capacity" />
      <path className="is-accent" d="M14 44c28 0 30-26 62-28 26-1.6 40-1.9 70-2" data-object="population-curve" />
      <circle className="is-accent" cx="76" cy="29" r="3" data-object="inflection" />
    </svg>
  ),
  "rabbit-chaos": (
    <svg viewBox="0 0 160 56" fill="none" data-preview-geometry="rabbit-chaos">
      <path className="is-guide" d="M14 46h132M14 46V8" />
      <path d="M14 28h44" data-object="stable-branch" />
      <path d="M58 28c10-6 14-9 22-10M58 28c10 6 14 9 22 10" data-object="first-fork" />
      <path className="is-accent" d="M80 18c7-3 10-4 16-5M80 18c7 3 10 3 16 4M80 38c7 3 10 4 16 5M80 38c7-3 10-3 16-4" data-object="second-fork" />
      <g className="is-accent" data-object="chaos-band">
        <circle cx="104" cy="13" r="1.4" /><circle cx="109" cy="30" r="1.4" /><circle cx="113" cy="20" r="1.4" />
        <circle cx="118" cy="41" r="1.4" /><circle cx="122" cy="15" r="1.4" /><circle cx="126" cy="33" r="1.4" />
        <circle cx="131" cy="24" r="1.4" /><circle cx="135" cy="43" r="1.4" /><circle cx="139" cy="12" r="1.4" />
        <circle cx="143" cy="28" r="1.4" />
      </g>
    </svg>
  ),
  "predator-prey": (
    <svg viewBox="0 0 160 56" fill="none" data-preview-geometry="predator-prey-cycles">
      <path className="is-guide" d="M14 46h132M14 46V8" />
      <path d="M14 40c6-18 10-26 17-26s11 26 18 26 11-26 18-26 11 26 18 26 11-26 18-26 11 26 18 26 8-14 13-20" data-object="hare-wave" />
      <path className="is-accent" d="M14 44c8-2 12-20 19-20s11 20 18 20 11-20 18-20 11 20 18 20 11-20 18-20 11 20 18 20" data-object="lynx-wave" />
      <circle className="is-accent" cx="49" cy="24" r="2.6" data-object="lag-mark" />
    </svg>
  ),
  "competition-exclusion": (
    <svg viewBox="0 0 160 56" fill="none" data-preview-geometry="competition-isoclines">
      <path className="is-guide" d="M14 46h132M14 46V8" />
      <path d="M20 10 90 46" data-object="isocline-1" />
      <path d="M14 28 134 46" data-object="isocline-2" />
      <path className="is-accent is-dashed" d="M24 40c18-2 32-2 46-4" data-object="trajectory" />
      <circle className="is-accent" cx="72" cy="36" r="3.2" data-object="equilibrium" />
    </svg>
  ),
  "island-biogeography": (
    <svg viewBox="0 0 160 56" fill="none" data-preview-geometry="island-crossing-rates">
      <path className="is-guide" d="M14 46h132M14 46V8" />
      <path d="M14 12c34 8 70 20 118 30" data-object="immigration-curve" />
      <path className="is-accent" d="M14 45c40-4 78-16 116-30" data-object="extinction-curve" />
      <path className="is-guide is-dashed" d="M74 29v17" data-object="equilibrium-drop" />
      <circle className="is-accent" cx="74" cy="29" r="3.2" data-object="equilibrium" />
    </svg>
  ),
  "ellipse-string-construction": (
    <svg viewBox="0 0 160 56" fill="none" data-preview-geometry="ellipse-string-construction">
      <ellipse className="is-guide" cx="80" cy="30" rx="52" ry="18" data-object="conic" />
      <circle cx="31" cy="30" r="3" data-object="focus" />
      <circle cx="129" cy="30" r="3" data-object="focus" />
      <path className="is-accent" d="M31 30 106 14l23 16" data-object="rope" />
      <circle className="is-accent" cx="106" cy="14" r="3" data-object="moving-point" />
    </svg>
  ),
  "ellipse-standard-equation": (
    <svg viewBox="0 0 160 56" fill="none" data-preview-geometry="ellipse-standard-equation">
      <ellipse className="is-guide" cx="80" cy="30" rx="52" ry="18" data-object="conic" />
      <circle cx="31" cy="30" r="3" data-object="focus" />
      <circle cx="129" cy="30" r="3" data-object="focus" />
      <path className="is-accent" d="M80 30h49M80 30V12M129 30 80 12" data-object="characteristic-triangle" />
      <circle className="is-accent" cx="106" cy="14" r="3" data-object="moving-point" />
    </svg>
  ),
  "ellipse-parameters-eccentricity": (
    <svg viewBox="0 0 160 56" fill="none" data-preview-geometry="ellipse-parameters-eccentricity">
      <ellipse className="is-guide" cx="80" cy="28" rx="52" ry="20" data-object="conic" />
      <ellipse className="is-accent is-dashed" cx="80" cy="28" rx="52" ry="7" data-object="flat-variant" />
      <circle cx="38" cy="28" r="3" data-object="focus" />
      <circle cx="122" cy="28" r="3" data-object="focus" />
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
  "two-sum": (
    <svg viewBox="0 0 160 56" fill="none" data-preview-geometry="two-sum-hash-table">
      <path className="is-guide" d="M16 13h75M16 23h56M16 33h68M16 43h48" />
      <rect x="101" y="10" width="42" height="36" rx="3" />
      <path className="is-guide" d="M101 22h42M122 10v36" />
      <path className="is-accent" d="M75 31h23m-5-5 5 5-5 5" />
      <circle className="is-accent" cx="23" cy="33" r="3" />
    </svg>
  ),
  "redox-electron": (
    <svg viewBox="0 0 160 56" fill="none" data-preview-geometry="redox-electron-transfer">
      <circle cx="31" cy="28" r="13" />
      <circle cx="129" cy="28" r="13" />
      <path className="is-guide" d="M48 28h64" />
      <path className="is-accent" d="M48 20c18-15 46-15 64 0m-6-6 6 6-8 1" />
      <circle className="is-accent" cx="70" cy="12" r="2.4" />
      <circle className="is-accent" cx="89" cy="12" r="2.4" />
      <path className="is-guide" d="m25 28 5 5 8-11m84 6 5 5 8-11" />
    </svg>
  ),
  "dna-replication": (
    <svg viewBox="0 0 160 56" fill="none" data-preview-geometry="dna-replication-fork">
      <path d="M18 14c18 0 24 28 42 28s24-28 42-28" />
      <path d="M18 42c18 0 24-28 42-28s24 28 42 28" />
      <path className="is-guide" d="m101 14 18 14-18 14m18-14h23" />
      <path className="is-accent" d="M119 28c8-10 14-12 23-12m-23 12c8 10 14 12 23 12" />
      <circle className="is-accent" cx="119" cy="28" r="3" />
    </svg>
  ),
  monsoon: (
    <svg viewBox="0 0 160 56" fill="none" data-preview-geometry="east-asia-monsoon">
      <path className="is-guide" d="M21 12c14 3 19 12 16 21-2 8 4 12 13 11 12-1 17-9 26-8 8 1 11 7 19 8" />
      <path d="M103 9c9 4 14 10 13 17-1 8 7 10 20 12" />
      <circle cx="48" cy="20" r="7" />
      <circle cx="124" cy="37" r="7" />
      <path className="is-accent" d="M118 35C94 30 76 24 57 20m7-4-7 4 6 5" />
      <path className="is-guide is-dashed" d="M116 42C91 47 70 43 52 27" />
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
