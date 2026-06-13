import { useMemo } from "react";
import type { ReviewReport } from "../../entities/pipeline/types";
import { humanizeIssue, suggestionForIssue } from "./issueMessages";

interface PromptDoctorProps {
  report: ReviewReport | null | undefined;
  error: string | null | undefined;
  onRetryWithSuggestion?: (suggestion: string) => void;
}

interface SuggestionPill {
  key: string;
  code: string;
  label: string;
  message: string;
}

export function PromptDoctor({
  report,
  error,
  onRetryWithSuggestion,
}: PromptDoctorProps) {
  const attempts = report?.attempts ?? 0;

  const suggestions = useMemo<SuggestionPill[]>(() => {
    // Inline ``issues ?? []`` so the deps array tracks ``report?.issues``
    // directly — the previous shape created a fresh array on every render
    // and tripped exhaustive-deps (issue #67).
    const issues = report?.issues ?? [];
    const seen = new Set<string>();
    const out: SuggestionPill[] = [];
    for (const issue of issues) {
      const text = suggestionForIssue(issue);
      if (!text || seen.has(text)) continue;
      seen.add(text);
      out.push({
        key: `${issue.code}-${out.length}`,
        code: issue.code,
        label: text,
        message: humanizeIssue(issue),
      });
    }
    return out;
  }, [report?.issues]);

  return (
    <div className="mv-prompt-doctor" role="alert">
      <div className="mv-prompt-doctor__header">
        {attempts > 0
          ? `生成失败（已尝试 ${attempts} 次自动修复）`
          : "生成失败"}
      </div>

      {suggestions.length > 0 && (
        <>
          <div className="mv-prompt-doctor__hint">
            💡 试试以下建议来重新生成：
          </div>
          <ul className="mv-prompt-doctor__pills">
            {suggestions.map((pill) => (
              <li key={pill.key}>
                <button
                  type="button"
                  className="mv-prompt-doctor__pill"
                  onClick={() => onRetryWithSuggestion?.(pill.label)}
                  title={pill.message}
                >
                  <span className="mv-prompt-doctor__pill-code">{pill.code}</span>
                  <span className="mv-prompt-doctor__pill-text">{pill.label}</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      <details className="mv-prompt-doctor__details">
        <summary>查看技术细节</summary>
        <pre className="mv-prompt-doctor__raw">
          {error ?? "(no error message captured)"}
        </pre>
      </details>
    </div>
  );
}
