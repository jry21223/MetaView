import { HistoryPanel } from "../../components/HistoryPanel";
import { HtmlPreviewPanel } from "../../components/HtmlPreviewPanel";
import { VideoPreview } from "../../components/VideoPreview";
import type { PipelineResponse, PipelineRunStatus, PipelineRunSummary } from "../../types";

function formatHistoryOutputMode(outputMode?: PipelineRunSummary["output_mode"]): string {
  return outputMode === "html" ? "HTML 交互" : "视频预览";
}

function formatHistoryDomain(domain?: PipelineRunSummary["domain"] | null): string {
  return domain ?? "auto";
}

export interface HistoryPageProps {
  historyError: string | null;
  runs: PipelineRunSummary[];
  selectedRunId: string | null;
  result: PipelineResponse | null;
  selectedHistoryRun: PipelineRunSummary | null;
  previewVideoUrl: string | null;
  previewHtmlUrl: string | null;
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
  previewHtmlUrl,
  loading,
  onSelectRun,
  onOpenInStudio,
  isRunningStatus
}: HistoryPageProps) {
  const selectedResultMatches =
    selectedHistoryRun != null && result?.request_id === selectedHistoryRun.request_id;

  return (
    <section className="page-shell history-page-shell" id="history">
      <div className="page-header history-page-header">
        <span className="page-kicker">History</span>
        <h1 className="page-title">任务历史</h1>
        <p className="page-description">历史任务集中放在这里查看。选择记录后，右侧会显示结果摘要，并可一键切回工作台复用。</p>
      </div>

      <div className="history-page-layout">
        <HistoryPanel
          error={historyError}
          runs={runs}
          selectedRunId={selectedRunId}
          onSelectRun={onSelectRun}
        />

        <section className="panel panel-history-detail history-detail-panel">
          {selectedHistoryRun ? (
            <>
              <div className="history-detail-header">
                <div>
                  <span className="panel-kicker">Selected Run</span>
                  <h2 className="history-detail-title">
                    {selectedResultMatches ? result.cir.title : selectedHistoryRun.title}
                  </h2>
                  <p className="history-detail-description">{selectedHistoryRun.prompt}</p>
                </div>
                <div className="history-detail-actions">
                  <button
                    type="button"
                    className="ghost-button"
                    onClick={onOpenInStudio}
                  >
                    在工作台打开
                  </button>
                </div>
              </div>

              <div className="history-detail-meta">
                <span className="meta-item history-detail-meta-item">
                  <span className="material-symbols-outlined" style={{ fontSize: 16 }}>fingerprint</span>
                  ID: {selectedHistoryRun.request_id.slice(0, 8)}
                </span>
                <span className={`badge status-${selectedHistoryRun.status}`}>{selectedHistoryRun.status}</span>
                <span className="badge badge-outline">{formatHistoryDomain(selectedHistoryRun.domain)}</span>
                <span className="badge badge-outline">{formatHistoryOutputMode(selectedHistoryRun.output_mode)}</span>
                <span className="badge badge-outline">{selectedHistoryRun.generation_provider ?? "-"}</span>
              </div>

              {previewHtmlUrl && selectedResultMatches ? (
                <div className="preview-stage history-preview-stage">
                  <HtmlPreviewPanel src={previewHtmlUrl} />
                </div>
              ) : previewVideoUrl && selectedResultMatches ? (
                <div className="preview-stage history-preview-stage">
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
                        : previewHtmlUrl
                          ? "该任务暂无可展示交互动画"
                          : "该任务暂无可展示视频"}
                  </strong>
                  <span>
                    {selectedHistoryRun.error_message ??
                      (isRunningStatus(selectedHistoryRun.status)
                        ? "后台会继续执行，完成后可在这里直接查看。"
                        : "如果任务成功但未加载出预览，可切回工作台重新拉取详情。")}
                  </span>
                </div>
              )}

              <ul className="diagnostic-list">
                {(selectedResultMatches
                  ? result.diagnostics.slice(0, 4)
                  : []
                ).map((diagnostic, index) => (
                  <li key={`${diagnostic.agent}-${index}`}>
                    <strong>{diagnostic.agent}</strong>
                    <span>{diagnostic.message}</span>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <div className="history-empty history-detail-empty">还没有选中任务。</div>
          )}
        </section>
      </div>
    </section>
  );
}
