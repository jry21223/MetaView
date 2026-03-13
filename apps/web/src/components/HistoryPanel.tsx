import type { PipelineRunSummary } from "../types";

interface HistoryPanelProps {
  runs: PipelineRunSummary[];
  selectedRunId: string | null;
  onSelectRun: (requestId: string) => void;
}

export function HistoryPanel({ runs, selectedRunId, onSelectRun }: HistoryPanelProps) {
  return (
    <section className="panel panel-history">
      <div className="panel-header">
        <span className="panel-kicker">History</span>
        <h3>任务历史</h3>
        <p>所有持久化任务都会写入本地 SQLite，可随时回看 CIR、脚本与运行时信息。</p>
      </div>

      <div className="history-list">
        {runs.length === 0 ? (
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
              <span>{run.sandbox_status}</span>
            </div>
            <p>{run.prompt}</p>
            <div className="history-item-meta">
              <span>route:{run.router_provider}</span>
              <span>gen:{run.generation_provider}</span>
              <span>{run.domain}</span>
              <span>{new Date(run.created_at).toLocaleString()}</span>
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}
