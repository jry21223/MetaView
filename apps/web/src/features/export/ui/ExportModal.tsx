import React, { useEffect, useRef, useState } from "react";
import { useTTS } from "../../playbook/engine/player/useTTS";
import {
  buildDownloadUrl,
  getExportStatus,
  submitExport,
  type ExportJobResponse,
  type ExportJobStatus,
} from "../api/exportApi";

interface ExportModalProps {
  runId: string | null;
  isDark: boolean;
  onClose: () => void;
}

const STATUS_LABEL: Record<ExportJobStatus, string> = {
  queued: "排队中…",
  bundling: "打包中…",
  generating_audio: "生成配音中…",
  rendering: "渲染中…",
  completed: "完成",
  failed: "失败",
};

const POLL_INTERVAL_MS = 1500;

export const ExportModal: React.FC<ExportModalProps> = ({ runId, isDark, onClose }) => {
  const tts = useTTS();
  const [withAudio, setWithAudio] = useState(false);
  const [job, setJob] = useState<ExportJobResponse | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollTimer = useRef<number | null>(null);

  useEffect(() => () => {
    if (pollTimer.current !== null) window.clearTimeout(pollTimer.current);
  }, []);

  const pollUntilDone = (jobId: string): void => {
    const tick = async () => {
      try {
        const next = await getExportStatus(jobId);
        setJob(next);
        if (next.status === "completed" || next.status === "failed") return;
        pollTimer.current = window.setTimeout(tick, POLL_INTERVAL_MS);
      } catch (err) {
        setError(err instanceof Error ? err.message : "轮询失败");
      }
    };
    pollTimer.current = window.setTimeout(tick, POLL_INTERVAL_MS);
  };

  const handleSubmit = async () => {
    if (!runId) return;
    setError(null);
    setSubmitting(true);
    try {
      if (withAudio && (tts.config.backend !== "openai" || !tts.config.apiKey)) {
        throw new Error(
          "含配音导出需要在 TTS 设置中切换到 OpenAI 后端并填写 API Key（系统语音不支持服务端渲染）",
        );
      }
      const body = {
        run_id: runId,
        with_audio: withAudio,
        ...(withAudio && {
          tts: {
            api_key: tts.config.apiKey,
            base_url: tts.config.baseUrl,
            model: tts.config.model || "tts-1",
            voice: tts.config.voice || "alloy",
          },
        }),
      };
      const created = await submitExport(body);
      setJob(created);
      pollUntilDone(created.job_id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "提交失败");
    } finally {
      setSubmitting(false);
    }
  };

  const c = isDark
    ? {
        bg: "#161b22",
        border: "#30363d",
        text: "#c9d1d9",
        muted: "#8b949e",
        inputBg: "#0d1117",
        accent: "#4de8b0",
        warn: "#ff9e8a",
      }
    : {
        bg: "#ffffff",
        border: "#d0d7de",
        text: "#24292f",
        muted: "#6e7781",
        inputBg: "#f6f8fa",
        accent: "#00896e",
        warn: "#c05030",
      };

  const progressPct = Math.max(0, Math.min(1, job?.progress ?? 0)) * 100;
  const isWorking = job !== null && job.status !== "completed" && job.status !== "failed";
  const canDownload = job?.status === "completed" && job.output_url;

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.55)",
        zIndex: 200,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 420,
          background: c.bg,
          border: `1px solid ${c.border}`,
          borderRadius: 10,
          padding: "20px 22px",
          color: c.text,
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <strong style={{ fontSize: 15 }}>导出 MP4</strong>
          <button
            onClick={onClose}
            style={{
              border: "none",
              background: "transparent",
              color: c.muted,
              cursor: "pointer",
              fontSize: 18,
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>

        {!job && (
          <>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
              <input
                type="checkbox"
                checked={withAudio}
                onChange={(e) => setWithAudio(e.target.checked)}
              />
              <span>包含配音（OpenAI TTS）</span>
            </label>
            {withAudio && (
              <div style={{ fontSize: 11, color: c.muted, lineHeight: 1.5 }}>
                配音使用 TTS 设置中的 OpenAI 配置：base_url / api_key / model / voice。该 Key 与
                LLM Provider 的 Key 是分开的，请在播放器右下角的 TTS 设置中先配置好。
              </div>
            )}
            {error && (
              <div style={{ fontSize: 12, color: c.warn, lineHeight: 1.5 }}>{error}</div>
            )}
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button
                onClick={onClose}
                style={{
                  border: `1px solid ${c.border}`,
                  background: "transparent",
                  color: c.muted,
                  padding: "6px 14px",
                  borderRadius: 6,
                  cursor: "pointer",
                  fontSize: 12,
                }}
              >
                取消
              </button>
              <button
                onClick={handleSubmit}
                disabled={submitting || !runId}
                style={{
                  border: `1px solid ${c.accent}`,
                  background: `${c.accent}1a`,
                  color: c.accent,
                  padding: "6px 14px",
                  borderRadius: 6,
                  cursor: submitting ? "wait" : "pointer",
                  fontSize: 12,
                  fontWeight: 600,
                }}
              >
                {submitting ? "提交中…" : "开始导出"}
              </button>
            </div>
          </>
        )}

        {job && (
          <>
            <div style={{ fontSize: 12, color: c.muted }}>
              {STATUS_LABEL[job.status] ?? job.status}
              {job.message ? ` · ${job.message}` : ""}
            </div>
            <div
              style={{
                height: 6,
                background: c.inputBg,
                borderRadius: 3,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  height: "100%",
                  width: `${progressPct}%`,
                  background: job.status === "failed" ? c.warn : c.accent,
                  transition: "width 0.3s",
                }}
              />
            </div>
            <div style={{ fontSize: 11, color: c.muted }}>
              {progressPct.toFixed(0)}%
            </div>
            {job.status === "failed" && (
              <div style={{ fontSize: 12, color: c.warn, lineHeight: 1.5 }}>
                {job.error ?? "未知错误"}
              </div>
            )}
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              {canDownload && job.output_url && (
                <a
                  href={buildDownloadUrl(job.output_url)}
                  download
                  style={{
                    textDecoration: "none",
                    border: `1px solid ${c.accent}`,
                    background: `${c.accent}1a`,
                    color: c.accent,
                    padding: "6px 14px",
                    borderRadius: 6,
                    fontSize: 12,
                    fontWeight: 600,
                  }}
                >
                  下载 MP4 ↓
                </a>
              )}
              <button
                onClick={onClose}
                style={{
                  border: `1px solid ${c.border}`,
                  background: "transparent",
                  color: c.muted,
                  padding: "6px 14px",
                  borderRadius: 6,
                  cursor: isWorking ? "default" : "pointer",
                  fontSize: 12,
                }}
              >
                {isWorking ? "后台继续…" : "关闭"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
