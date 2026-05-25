import React, { useEffect, useMemo, useRef, useState } from "react";
import { readStoredTTSConfig } from "../../playbook/engine/player/useTTS";
import {
  buildDownloadUrl,
  getExportStatus,
  submitExport,
  type ExportFormat,
  type ExportJobResponse,
  type ExportJobStatus,
  type ExportQuality,
} from "../api/exportApi";

interface ExportModalProps {
  runId: string | null;
  isDark: boolean;
  /** Title of the first playbook step — drives the preview-card placeholder. */
  previewTitle?: string | null;
  /** Theme accent color, used to tint the preview card and progress bar. */
  accentColor?: string;
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

const QUALITY_OPTIONS: Array<{ id: ExportQuality; label: string; hint: string }> = [
  { id: "720p", label: "流畅 720p", hint: "1280×720" },
  { id: "1080p", label: "高清 1080p", hint: "1920×1080" },
  { id: "2k", label: "超清 2K", hint: "2560×1440" },
];

const FORMAT_OPTIONS: Array<{ id: ExportFormat; label: string }> = [
  { id: "mp4", label: "MP4" },
  { id: "webm", label: "WebM" },
  { id: "gif", label: "GIF" },
];

const FPS_OPTIONS = [15, 30, 60] as const;
const POLL_INTERVAL_MS = 1500;
/** Walk-away ceiling for the poll loop. A 10-minute render is a hard upper
 *  bound for the studio use case; past that we stop polling and surface
 *  a timeout error rather than burning network forever. Issue #59. */
const POLL_TIMEOUT_MS = 10 * 60 * 1000;

/** sessionStorage key holding a {runId: jobId} map so closing & reopening the
 *  modal can rejoin the still-running render instead of starting a fresh
 *  client-side state machine. Issue #70. */
const JOB_MAP_KEY = "mv_export_jobs";

function readJobMap(): Record<string, string> {
  try {
    const raw = sessionStorage.getItem(JOB_MAP_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return {};
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof k === "string" && typeof v === "string") out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

function persistJobMapping(runId: string, jobId: string): void {
  try {
    const m = readJobMap();
    m[runId] = jobId;
    sessionStorage.setItem(JOB_MAP_KEY, JSON.stringify(m));
  } catch {
    // ignore quota / storage errors — at worst we lose resume capability
  }
}

function clearJobMapping(runId: string): void {
  try {
    const m = readJobMap();
    delete m[runId];
    sessionStorage.setItem(JOB_MAP_KEY, JSON.stringify(m));
  } catch {
    // ignore
  }
}

function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}分${s.toString().padStart(2, "0")}秒`;
}

export const ExportModal: React.FC<ExportModalProps> = ({
  runId,
  isDark,
  previewTitle,
  accentColor,
  onClose,
}) => {
  const [withAudio, setWithAudio] = useState(false);
  const [quality, setQuality] = useState<ExportQuality>("1080p");
  const [format, setFormat] = useState<ExportFormat>("mp4");
  const [fps, setFps] = useState<number>(30);
  const [job, setJob] = useState<ExportJobResponse | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const startedAtRef = useRef<number | null>(null);
  const pollTimer = useRef<number | null>(null);
  const elapsedTimer = useRef<number | null>(null);

  useEffect(() => () => {
    if (pollTimer.current !== null) window.clearTimeout(pollTimer.current);
    if (elapsedTimer.current !== null) window.clearInterval(elapsedTimer.current);
  }, []);

  const isWorking = job !== null && job.status !== "completed" && job.status !== "failed";

  // Drive the elapsed-time counter while the job is running. Issue #14.
  useEffect(() => {
    if (!isWorking) {
      if (elapsedTimer.current !== null) {
        window.clearInterval(elapsedTimer.current);
        elapsedTimer.current = null;
      }
      return;
    }
    if (startedAtRef.current === null) startedAtRef.current = Date.now();
    elapsedTimer.current = window.setInterval(() => {
      if (startedAtRef.current === null) return;
      setElapsedMs(Date.now() - startedAtRef.current);
    }, 500);
    return () => {
      if (elapsedTimer.current !== null) window.clearInterval(elapsedTimer.current);
    };
  }, [isWorking]);

  // Declared *before* the resume-on-mount effect so react-hooks' immutability
  // check can see the callback identity is stable across the effect's
  // lifetime (the effect captures pollUntilDone by reference).
  const pollUntilDone = (jobId: string): void => {
    const deadline = Date.now() + POLL_TIMEOUT_MS;
    const tick = async () => {
      // Issue #59: stop polling once the deadline passes — a server-side
      // hang would otherwise have us hitting the proxy every 1.5s forever.
      if (Date.now() > deadline) {
        setError("导出超时（10 分钟）— 请稍后到历史页查看，或重试");
        return;
      }
      try {
        const next = await getExportStatus(jobId);
        setJob(next);
        if (next.status === "completed" || next.status === "failed") return;
        pollTimer.current = window.setTimeout(tick, POLL_INTERVAL_MS);
      } catch (err) {
        setError(err instanceof Error ? err.message : "轮询失败");
        return;
      }
    };
    pollTimer.current = window.setTimeout(tick, POLL_INTERVAL_MS);
  };

  // Issue #70: on mount, rejoin any in-flight export for this run so closing
  // and reopening the modal does not strand the user in a "queueing" UI that
  // will never update.
  useEffect(() => {
    if (!runId) return;
    const stored = readJobMap()[runId];
    if (!stored) return;
    let cancelled = false;
    (async () => {
      try {
        const next = await getExportStatus(stored);
        if (cancelled) return;
        setJob(next);
        if (next.status !== "completed" && next.status !== "failed") {
          startedAtRef.current = Date.now();
          pollUntilDone(stored);
        }
      } catch {
        // 404 (server restart wiped in-memory job repo) — drop stale mapping
        clearJobMapping(runId);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [runId]);


  const handleSubmit = async () => {
    if (!runId) return;
    setError(null);
    setSubmitting(true);
    startedAtRef.current = Date.now();
    setElapsedMs(0);
    try {
      // Issue #72: only read the persisted TTS config when audio is actually
      // requested — avoids the heavier `useTTS` hook side effects for silent
      // exports.
      const ttsConfig = withAudio ? readStoredTTSConfig() : null;
      if (withAudio && ttsConfig && ttsConfig.backend !== "openai") {
        throw new Error(
          "含配音导出需要在 TTS 设置中切换到 OpenAI 后端（系统语音不支持服务端渲染）。API Key 由后端配置。",
        );
      }
      const body = {
        run_id: runId,
        with_audio: withAudio,
        options: { quality, fps, format },
        ...(withAudio && ttsConfig && {
          tts: { voice: ttsConfig.voice || "alloy" },
        }),
      };
      const created = await submitExport(body);
      setJob(created);
      // Persist so reopening the modal rejoins this job instead of starting
      // from scratch. Issue #70.
      persistJobMapping(runId, created.job_id);
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
        accent: accentColor ?? "#4de8b0",
        warn: "#ff9e8a",
      }
    : {
        bg: "#ffffff",
        border: "#d0d7de",
        text: "#24292f",
        muted: "#6e7781",
        inputBg: "#f6f8fa",
        accent: accentColor ?? "#00896e",
        warn: "#c05030",
      };

  const progressPct = Math.max(0, Math.min(1, job?.progress ?? 0)) * 100;
  const canDownload = job?.status === "completed" && job.output_url;
  const fileExtension = format.toUpperCase();

  // Cheap MVP "thumbnail": render a styled card with the playbook's first step
  // title and the active theme accent. A real first-frame capture would need
  // canvas access from PlaybookComposition — followed up in a separate issue.
  const previewCard = useMemo(
    () => (
      <div
        aria-label="导出预览"
        style={{
          background: `linear-gradient(135deg, ${c.accent}26 0%, ${c.inputBg} 80%)`,
          border: `1px solid ${c.accent}66`,
          borderRadius: 8,
          padding: "18px 16px",
          minHeight: 90,
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          gap: 8,
        }}
      >
        <div style={{ fontSize: 10, letterSpacing: 1, color: c.muted, textTransform: "uppercase" }}>
          预览 · 第一步
        </div>
        <div style={{ fontSize: 15, fontWeight: 600, color: c.text }}>
          {previewTitle?.trim() || "Playbook"}
        </div>
        <div style={{ fontSize: 11, color: c.muted }}>
          {quality.toUpperCase()} · {fps}fps · {fileExtension}
        </div>
      </div>
    ),
    [c.accent, c.inputBg, c.muted, c.text, previewTitle, quality, fps, fileExtension],
  );

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
          width: 460,
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
          <strong style={{ fontSize: 15 }}>导出视频</strong>
          <button
            onClick={onClose}
            aria-label="关闭"
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
            {previewCard}

            <OptionRow label="画质" muted={c.muted}>
              <ChipGroup
                items={QUALITY_OPTIONS}
                value={quality}
                onChange={setQuality}
                accent={c.accent}
                border={c.border}
                text={c.text}
                muted={c.muted}
              />
            </OptionRow>

            <OptionRow label="格式" muted={c.muted}>
              <ChipGroup
                items={FORMAT_OPTIONS}
                value={format}
                onChange={setFormat}
                accent={c.accent}
                border={c.border}
                text={c.text}
                muted={c.muted}
              />
            </OptionRow>

            <OptionRow label="帧率" muted={c.muted}>
              <ChipGroup
                items={FPS_OPTIONS.map((v) => ({ id: v, label: `${v} fps` }))}
                value={fps}
                onChange={setFps}
                accent={c.accent}
                border={c.border}
                text={c.text}
                muted={c.muted}
              />
            </OptionRow>

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
                配音通过后端代理使用 METAVIEW_TTS_API_KEY；前端仅选择 voice。在播放器右下角的 TTS 设置中切换到 OpenAI 后端即可。
              </div>
            )}
            {error && (
              <div role="alert" style={{ fontSize: 12, color: c.warn, lineHeight: 1.5 }}>
                {error}
              </div>
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
            {previewCard}

            <div style={{ fontSize: 12, color: c.muted, display: "flex", gap: 8, flexWrap: "wrap" }}>
              <span>{STATUS_LABEL[job.status] ?? job.status}</span>
              {job.message && <span>· {job.message}</span>}
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
            <div
              style={{ fontSize: 11, color: c.muted, display: "flex", justifyContent: "space-between" }}
            >
              <span>{progressPct.toFixed(0)}%</span>
              {isWorking && (
                <span aria-label="已用时间">用时 {formatElapsed(elapsedMs)}</span>
              )}
            </div>
            {job.status === "failed" && (
              <div style={{ fontSize: 12, color: c.warn, lineHeight: 1.5 }}>
                {job.error ?? "未知错误"}
              </div>
            )}
            {error && (
              <div role="alert" style={{ fontSize: 12, color: c.warn, lineHeight: 1.5 }}>
                {error}
              </div>
            )}
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              {!isWorking && (
                <button
                  onClick={() => {
                    if (pollTimer.current !== null) {
                      window.clearTimeout(pollTimer.current);
                      pollTimer.current = null;
                    }
                    if (runId) clearJobMapping(runId);
                    setJob(null);
                    setError(null);
                    startedAtRef.current = null;
                    setElapsedMs(0);
                  }}
                  style={{
                    border: `1px solid ${c.border}`,
                    background: "transparent",
                    color: c.text,
                    padding: "6px 14px",
                    borderRadius: 6,
                    cursor: "pointer",
                    fontSize: 12,
                  }}
                >
                  重新导出
                </button>
              )}
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
                  下载 {fileExtension} ↓
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

interface OptionRowProps {
  label: string;
  muted: string;
  children: React.ReactNode;
}

const OptionRow: React.FC<OptionRowProps> = ({ label, muted, children }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
    <div style={{ fontSize: 11, color: muted, letterSpacing: 0.5 }}>{label}</div>
    {children}
  </div>
);

interface ChipGroupItem<T extends string | number> {
  id: T;
  label: string;
  hint?: string;
}

interface ChipGroupProps<T extends string | number> {
  items: ReadonlyArray<ChipGroupItem<T>>;
  value: T;
  onChange: (next: T) => void;
  accent: string;
  border: string;
  text: string;
  muted: string;
}

function ChipGroup<T extends string | number>({
  items,
  value,
  onChange,
  accent,
  border,
  text,
  muted,
}: ChipGroupProps<T>): React.ReactElement {
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
      {items.map((item) => {
        const active = item.id === value;
        return (
          <button
            key={String(item.id)}
            type="button"
            onClick={() => onChange(item.id)}
            aria-pressed={active}
            style={{
              padding: "5px 10px",
              borderRadius: 6,
              border: `1px solid ${active ? accent : border}`,
              background: active ? `${accent}26` : "transparent",
              color: active ? accent : text,
              fontSize: 12,
              fontWeight: active ? 600 : 400,
              cursor: "pointer",
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-start",
              gap: 1,
            }}
          >
            <span>{item.label}</span>
            {item.hint && (
              <span style={{ fontSize: 9, color: muted, fontWeight: 400 }}>{item.hint}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
