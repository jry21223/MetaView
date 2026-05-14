import React, { useState } from "react";
import type { ReviewReport } from "../../entities/pipeline/types";
import { humanizeIssue } from "./issueMessages";

interface AutoRefinedBadgeProps {
  report: ReviewReport | null | undefined;
}

export function AutoRefinedBadge({ report }: AutoRefinedBadgeProps) {
  const [open, setOpen] = useState(false);
  if (!report || report.attempts === 0) return null;

  const fixedIssues = report.issues.filter((issue) => issue.severity === "error");
  return (
    <span
      className="mv-auto-refined"
      data-open={open}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onClick={() => setOpen((prev) => !prev)}
      role="button"
      tabIndex={0}
      aria-haspopup="true"
      aria-expanded={open}
    >
      <span className="mv-auto-refined__icon" aria-hidden="true">✨</span>
      <span className="mv-auto-refined__text">
        已自动修正 ({report.attempts})
      </span>
      {open && (
        <div className="mv-auto-refined__tooltip" role="dialog">
          <div className="mv-auto-refined__tooltip-title">
            审核修复了 {fixedIssues.length || report.issues.length} 处问题
          </div>
          <ul className="mv-auto-refined__tooltip-list">
            {(fixedIssues.length > 0 ? fixedIssues : report.issues).map(
              (issue, index) => (
                <li key={`${issue.code}-${index}`}>
                  <code className="mv-auto-refined__tooltip-code">{issue.code}</code>
                  <span className="mv-auto-refined__tooltip-text">
                    {humanizeIssue(issue)}
                  </span>
                </li>
              ),
            )}
          </ul>
        </div>
      )}
    </span>
  );
}
