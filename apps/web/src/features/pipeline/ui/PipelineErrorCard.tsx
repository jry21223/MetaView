import type { PipelineErrorKind } from "../hooks/usePipelinePoller";

interface PipelineErrorCardProps {
  errorKind: PipelineErrorKind;
  message: string;
  /** Restart polling the same run (network failures). */
  onRetryPolling: () => void;
  /** Resubmit the original prompt as a new run (backend failures). */
  onResubmit?: (() => void) | null;
  /** Go back to intake, optionally prefilled with the original prompt. */
  onBackToIntake: () => void;
}

const TITLE: Record<PipelineErrorKind, string> = {
  network: "连接中断",
  run_failed: "生成失败",
};

export function PipelineErrorCard({
  errorKind,
  message,
  onRetryPolling,
  onResubmit = null,
  onBackToIntake,
}: PipelineErrorCardProps) {
  return (
    <div className="mv-pipeline-error" role="alert">
      <div className="mv-pipeline-error__head">
        <span className="mv-pipeline-error__mark" aria-hidden="true" />
        <strong>{TITLE[errorKind]}</strong>
      </div>
      <p className="mv-pipeline-error__message">{message}</p>
      <div className="mv-pipeline-error__actions">
        {errorKind === "network" && (
          <button type="button" className="mv-chip mv-chip-primary" onClick={onRetryPolling}>
            重试
          </button>
        )}
        {errorKind === "run_failed" && onResubmit && (
          <button type="button" className="mv-chip mv-chip-primary" onClick={onResubmit}>
            重新生成
          </button>
        )}
        <button type="button" className="mv-chip" onClick={onBackToIntake}>
          返回修改题目
        </button>
      </div>
      {errorKind === "run_failed" && onResubmit && (
        <p className="mv-pipeline-error__hint">
          重新生成会以原题目重新提交；上传过的代码文件需要重新添加。
        </p>
      )}
    </div>
  );
}
