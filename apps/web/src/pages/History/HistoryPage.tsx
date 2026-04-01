import { HistoryPanel } from "../../components/HistoryPanel";
import { VideoPreview } from "../../components/VideoPreview";
import type { PipelineResponse, PipelineRunStatus, PipelineRunSummary } from "../../types";

export interface HistoryPageProps {
  historyError: string | null;
  runs: PipelineRunSummary[];
  selectedRunId: string | null;
  result: PipelineResponse | null;
  selectedHistoryRun: PipelineRunSummary | null;
  previewVideoUrl: string | null;
  loading: boolean;

  onSelectRun: (requestId: string) => void;
  onOpenInStudio: () => void;
  isRunningStatus: (status: PipelineRunStatus) => boolean;
}

export function HistoryPage({
  historyError,
  runs,
  selectedRunId,
  result,
  selectedHistoryRun,
  previewVideoUrl,
  loading,
  onSelectRun,
  onOpenInStudio,
  isRunningStatus
}: HistoryPageProps) {
  return (
    <section className="page-shell" id="history">
      <div className="page-header">
        <span className="panel-kicker">History</span>
        <h2>任务历史</h2>
        <p>历史任务集中放在这里查看。选择记录后，右侧会显示结果摘要，并可一键切回工作台复用。</p>
      </div>

      <div className="history-page-layout">
        <HistoryPanel
          error={historyError}
          runs={runs}
          selectedRunId={selectedRunId}
          onSelectRun={onSelectRun}
        />

        <section className="panel panel-history-detail history-detail-panel">
          <div className="panel-header">
            <span className="panel-kicker">Selected Run</span>
            <h3>{result?.cir.title ?? selectedHistoryRun?.title ?? "选择一条历史任务"}</h3>
            <p>
              {selectedHistoryRun
                ? selectedHistoryRun.prompt
                : "点击左侧历史记录后，这里会显示该任务的视频、状态与诊断摘要。"}
            </p>
          </div>

          {selectedHistoryRun ? (
            <>
              <div className="history-item-meta">
                <span className="badge badge-ghost">{selectedHistoryRun.request_id.slice(0, 8)}</span>
                <span className={`badge status-${selectedHistoryRun.status}`}>{selectedHistoryRun.status}</span>
                <span className="badge badge-outline">{selectedHistoryRun.domain ?? "auto"}</span>
                <span className="badge badge-outline">{selectedHistoryRun.generation_provider ?? "-"}</span>
              </div>

              {previewVideoUrl && result?.request_id === selectedHistoryRun.request_id ? (
                <div className="preview-stage">
                  <VideoPreview
                    src={previewVideoUrl}
                    title="历史视频"
                    downloadName={`${selectedHistoryRun.request_id}.mp4`}
                    headerless
                  />
                </div>
              ) : (
                <div className={`preview-empty ${loading ? "is-loading" : ""}`}>
                  <strong>
                    {selectedHistoryRun.status === "failed"
                      ? "该任务执行失败"
                      : isRunningStatus(selectedHistoryRun.status)
                        ? "该任务仍在执行中"
                        : "该任务暂无可展示视频"}
                  </strong>
                  <span>
                    {selectedHistoryRun.error_message ??
                      (isRunningStatus(selectedHistoryRun.status)
                        ? "后台会继续执行，完成后可在这里直接查看。"
                        : "如果任务成功但未加载出视频，可切回工作台重新拉取详情。")}
                  </span>
                </div>
              )}

              <ul className="diagnostic-list">
                {(result?.request_id === selectedHistoryRun.request_id
                  ? result.diagnostics.slice(0, 4)
                  : []
                ).map((diagnostic, index) => (
                  <li key={`${diagnostic.agent}-${index}`}>
                    <strong>{diagnostic.agent}</strong>
                    <span>{diagnostic.message}</span>
                  </li>
                ))}
              </ul>

              <div className="panel-toolbar">
                <button
                  type="button"
                  className="ghost-button"
                  onClick={onOpenInStudio}
                >
                  在工作台打开
                </button>
              </div>
            </>
          ) : (
            <div className="history-empty">还没有选中任务。</div>
          )}
        </section>
      </div>
    </section>
  );
}
