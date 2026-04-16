import { memo } from "react";

import type { PipelineRunSummary } from "../types";

interface HistoryPanelProps {
  error: string | null;
  runs: PipelineRunSummary[];
  selectedRunId: string | null;
  onSelectRun: (requestId: string) => void;
  onDeleteRun?: (requestId: string) => void;
}

function truncatePrompt(prompt: string, maxLength = 120): string {
  const normalized = prompt.trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength).trimEnd()}...`;
}

function formatRunTime(timestamp: string): string {
  return new Date(timestamp).toLocaleString();
}

function formatRunDomain(domain: PipelineRunSummary["domain"]): string {
  return domain ?? "auto";
}

function formatAnimationType(outputMode: PipelineRunSummary["output_mode"]): string {
  return outputMode === "html" ? "html" : "video";
}

export const HistoryPanel = memo(function HistoryPanel({
  error,
  runs,
  selectedRunId,
  onSelectRun,
  onDeleteRun,
}: HistoryPanelProps) {
  return (
    <section className="panel panel-history history-list-panel">
      {error ? <p className="error-text history-panel-error">{error}</p> : null}
      <div className="history-list history-list-content">
        {runs.length === 0 && !error ? (
          <div className="history-empty">还没有历史任务，先生成一次可视化草案。</div>
        ) : null}
        {runs.map((run) => (
          <button
            key={run.request_id}
            type="button"
            className={`history-item ${selectedRunId === run.request_id ? "is-active" : ""} ${
              run.status === "failed" ? "is-error" : ""
            }`.trim()}
            onClick={() => onSelectRun(run.request_id)}
          >
            <div className="history-item-header">
              <strong className="history-item-title">{run.title}</strong>
              <span className={`badge status-${run.status}`}>{run.status}</span>
            </div>
            <p className="history-item-summary">{truncatePrompt(run.prompt)}</p>
            <div className="history-item-meta">
              <span>{formatRunDomain(run.domain)}</span>
              <span>{formatAnimationType(run.output_mode)}</span>
              <span>{formatRunTime(run.created_at)}</span>
            </div>
            {run.error_message ? <p className="history-item-error">{run.error_message}</p> : null}
            {onDeleteRun && (
              <button
                type="button"
                className="history-item-delete"
                onClick={(event) => {
                  event.stopPropagation();
                  if (window.confirm("确定要删除此任务吗？")) {
                    onDeleteRun(run.request_id);
                  }
                }}
                title="删除此任务"
                aria-label="删除此任务"
              >
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>delete</span>
                <span className="history-item-delete-label">删除</span>
              </button>
            )}
          </button>
        ))}
      </div>
    </section>
  );
});
