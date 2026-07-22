import type { TemplatePreviewCaseId } from "./templatePreviewCases";

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
      {caseId === "binary-search" && (
        <svg viewBox="0 0 160 56" fill="none">
          <path className="is-guide" d="M20 13v-5h116v5M20 43v5h116v-5" />
          {[24, 42, 60, 78, 96, 114, 132].map((x, index) => (
            <rect key={x} className={index === 3 ? "is-accent" : undefined} x={x} y="19" width="14" height="18" rx="2" />
          ))}
          <path className="is-accent" d="M85 8v8m-4-4 4 4 4-4" />
        </svg>
      )}
      {caseId === "bfs-tree" && (
        <svg viewBox="0 0 160 56" fill="none">
          <path className="is-guide" d="M80 12 48 27m32-15 32 15M48 27 32 42m16-15 16 15m48-15-16 15m16-15 16 15" />
          <circle className="is-accent" cx="80" cy="10" r="5" />
          <circle cx="48" cy="27" r="4" /><circle cx="112" cy="27" r="4" />
          <circle cx="32" cy="44" r="3.5" /><circle cx="64" cy="44" r="3.5" />
          <circle cx="96" cy="44" r="3.5" /><circle cx="128" cy="44" r="3.5" />
          <path className="is-accent" d="M20 52h40" />
        </svg>
      )}
      {caseId === "derivative-tangent" && (
        <svg viewBox="0 0 160 56" fill="none">
          <path className="is-guide" d="M18 45h124M40 50V7" />
          <path d="M28 43c18-1 26-4 34-11 10-9 18-22 34-22 13 0 23 10 36 31" />
          <path className="is-accent" d="m55 42 64-31" />
          <circle className="is-accent" cx="83" cy="28" r="3.5" />
        </svg>
      )}
      {caseId === "ellipse-focus-definition" && (
        <svg viewBox="0 0 160 56" fill="none">
          <ellipse cx="80" cy="28" rx="52" ry="20" />
          <circle cx="60" cy="28" r="2.5" /><circle cx="100" cy="28" r="2.5" />
          <circle className="is-accent" cx="102" cy="12" r="3.5" />
          <path className="is-guide" d="m60 28 42-16m0 0-2 16" />
        </svg>
      )}
      {caseId === "parabola-focus-directrix" && (
        <svg viewBox="0 0 160 56" fill="none">
          <path d="M48 6c38 8 38 36 0 44" />
          <path className="is-guide" d="M35 5v46m32-23H35" />
          <circle cx="62" cy="28" r="2.5" />
          <circle className="is-accent" cx="76" cy="15" r="3.5" />
          <path className="is-accent" d="m76 15-14 13m14-13H35" />
        </svg>
      )}
      {caseId === "hyperbola-asymptotes" && (
        <svg viewBox="0 0 160 56" fill="none">
          <path className="is-guide" d="m28 49 104-42M28 7l104 42" />
          <path d="M63 6c-20 10-20 34 0 44M97 6c20 10 20 34 0 44" />
          <circle className="is-accent" cx="108" cy="17" r="3.5" />
        </svg>
      )}
      {caseId === "line-ellipse-position" && (
        <svg viewBox="0 0 160 56" fill="none">
          <ellipse cx="80" cy="28" rx="48" ry="19" />
          <path className="is-accent" d="m24 45 112-34" />
          <circle className="is-accent" cx="48" cy="38" r="3" />
          <circle className="is-accent" cx="113" cy="18" r="3" />
        </svg>
      )}
      {caseId === "ellipse-chord-midpoint-locus" && (
        <svg viewBox="0 0 160 56" fill="none">
          <ellipse cx="80" cy="28" rx="52" ry="20" />
          <path className="is-guide" d="m34 45 92-31" />
          <ellipse className="is-accent" cx="72" cy="28" rx="18" ry="7" />
          <circle className="is-accent" cx="72" cy="28" r="3.5" />
        </svg>
      )}
      {caseId === "pole-polar" && (
        <svg viewBox="0 0 160 56" fill="none">
          <path className="is-guide" d="M18 48h126M42 53V5" />
          <circle cx="76" cy="29" r="19" />
          <path d="m94 13 34 4M94 45l34-28" />
          <path className="is-accent" d="m94 13 0 32" />
          <circle className="is-accent" cx="128" cy="17" r="3.5" />
          <circle cx="94" cy="13" r="2.5" /><circle cx="94" cy="45" r="2.5" />
        </svg>
      )}
      {caseId === "projectile" && (
        <svg viewBox="0 0 160 56" fill="none">
          <path className="is-guide" d="M16 47h130" />
          <path d="M25 45c26-36 61-39 108 0" />
          <path className="is-accent" d="m27 44 18-20m0 0-1 7m1-7-7 2" />
          <circle className="is-accent" cx="80" cy="17" r="3.5" />
        </svg>
      )}
    </span>
  );
}
