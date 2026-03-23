import type { PipelineRunSummary } from "../types";

interface HistoryPanelProps {
  error: string | null;
  runs: PipelineRunSummary[];
  selectedRunId: string | null;
  onSelectRun: (requestId: string) => void;
}

export function HistoryPanel({
  error,
  runs,
  selectedRunId,
  onSelectRun,
}: HistoryPanelProps) {
  return (
    <section className="panel panel-history">
      <div className="panel-header">
        <span className="panel-kicker">History</span>
        <h3>任务历史</h3>
        <p>任务提交后会在后台继续执行，关页后重新打开也能继续查看。</p>
      </div>

      {error ? <p className="error-text">{error}</p> : null}
      <div className="history-list">
        {runs.length === 0 && !error ? (
          <div className="history-empty">还没有历史任务，先生成一次可视化草案。</div>
        ) : null}
        {runs.map((run) => (
          <button
            key={run.request_id}
            type="button"
            className={`history-item ${selectedRunId === run.request_id ? "is-active" : ""}`}
            onClick={() => onSelectRun(run.request_id)}
          >
            <div className="history-item-head">
              <strong>{run.title}</strong>
              <span>{run.status}</span>
            </div>
            <p>{run.prompt}</p>
            <div className="history-item-meta">
              <span>route:{run.router_provider ?? "-"}</span>
              <span>gen:{run.generation_provider ?? "-"}</span>
              <span>{run.domain ?? "auto"}</span>
              <span>{run.sandbox_status ?? "-"}</span>
              <span>{new Date(run.created_at).toLocaleString()}</span>
            </div>
            {run.error_message ? <p>{run.error_message}</p> : null}
          </button>
        ))}
      </div>
    </section>
  );
}
