import type { PipelineResponse } from "../types";

interface ToolsDebugOverviewProps {
  result: PipelineResponse | null;
  prompt: string;
  sourceCode: string;
  sourceCodeLanguage: string;
  selectedRunId: string | null;
  resolvedPreviewHtmlUrl: string | null;
  resolvedPreviewVideoUrl: string | null;
}

export function ToolsDebugOverview({
  result,
  prompt,
  sourceCode,
  sourceCodeLanguage,
  selectedRunId,
  resolvedPreviewHtmlUrl,
  resolvedPreviewVideoUrl,
}: ToolsDebugOverviewProps) {
  const htmlPreviewUrl = resolvedPreviewHtmlUrl;
  const videoPreviewUrl = resolvedPreviewVideoUrl;
  const executionMapSummary = result?.execution_map
    ? `${result.execution_map.checkpoints.length} 个 checkpoints`
    : "未生成";
  const sourceSummary = sourceCode.trim().length > 0
    ? `${sourceCodeLanguage || "text"} · ${sourceCode.split(/\r?\n/).length} 行`
    : "未加载";
  const promptSummary = prompt.trim().length > 0 ? "已加载共享编辑器 prompt" : "未加载";
  const htmlTrace = result?.runtime.agent_traces.find((trace) => trace.agent === "html_coder") ?? null;

  return (
    <div className="tools-dual-panel-grid" style={{ marginTop: "16px" }}>
      <section className="bento-card tools-card-section">
        <div style={{ fontSize: "0.625rem", fontWeight: 700, letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: "16px" }}>
          实际加载来源
        </div>
        <div className="tools-debug-list">
          <div className="tools-debug-item">
            <span className="tools-debug-label">Tools 本地调试 iframe</span>
            <code className="tools-debug-code">about:blank + srcDoc</code>
          </div>
          <div className="tools-debug-item">
            <span className="tools-debug-label">Studio / History HTML 预览 src</span>
            <code className="tools-debug-code">{htmlPreviewUrl ?? "当前无 preview_html_url"}</code>
          </div>
          <div className="tools-debug-item">
            <span className="tools-debug-label">视频预览 src</span>
            <code className="tools-debug-code">{videoPreviewUrl ?? "当前无 preview_video_url"}</code>
          </div>
          <div className="tools-debug-item">
            <span className="tools-debug-label">代码联动 source</span>
            <span>{sourceSummary}</span>
          </div>
          <div className="tools-debug-item">
            <span className="tools-debug-label">execution_map</span>
            <span>{executionMapSummary}</span>
          </div>
        </div>
      </section>

      <section className="bento-card tools-card-section">
        <div style={{ fontSize: "0.625rem", fontWeight: 700, letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: "16px" }}>
          Prompt / Source 语义
        </div>
        <div className="tools-debug-list">
          <div className="tools-debug-item">
            <span className="tools-debug-label">当前选中任务</span>
            <code className="tools-debug-code">{selectedRunId ?? "未选中"}</code>
          </div>
          <div className="tools-debug-item">
            <span className="tools-debug-label">共享编辑器 prompt</span>
            <span>{promptSummary}</span>
          </div>
          <div className="tools-debug-item">
            <span className="tools-debug-label">Tools 本地 HTML 调试</span>
            <span>不读取 prompt，只读取左侧 textarea 的 HTML。</span>
          </div>
          <div className="tools-debug-item">
            <span className="tools-debug-label">后端 HTML 生成链路</span>
            <span>{htmlTrace?.summary ?? "当前没有 html_coder trace。"}</span>
          </div>
        </div>
        <div className="tools-debug-callout">
          <strong>排查口径</strong>
          <span>
            `renderer_script` 是后端产物，`preview_html_url` 是实际 iframe 加载地址，`source_code` / `execution_map` 是代码联动来源；它们不是同一个 source。
          </span>
        </div>
      </section>
    </div>
  );
}
