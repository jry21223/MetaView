import type { FormEvent } from "react";
import { ControlPanel } from "../../components/ControlPanel";
import { TaskProgressCard } from "../../components/TaskProgressCard";
import { HtmlPreviewPanel } from "../../components/HtmlPreviewPanel";
import { HighlightedCode } from "../../components/HighlightedCode";
import { InteractiveExecutionExplorer } from "../../components/InteractiveExecutionExplorer";
import { VideoPreview } from "../../components/VideoPreview";
import { useVideoSync } from "../../hooks/features/useVideoSync";
import { useTaskProgress } from "../../hooks/features/useTaskProgress";
import type { ModelProvider, OutputMode, PipelineResponse, RuntimeCatalog, SandboxMode } from "../../types";

export interface StudioPageProps {
  prompt: string;
  outputMode: OutputMode;
  sourceImage: string | null;
  sourceCode: string;
  sourceCodeLanguage: string;
  routerProvider: ModelProvider;
  generationProvider: ModelProvider;
  sandboxMode: SandboxMode;
  enableNarration: boolean;
  runtimeCatalog: RuntimeCatalog;
  loading: boolean;
  error: string | null;
  sourceImageName: string | null;
  routerProviderSupportsVision: boolean;
  generationProviderSupportsVision: boolean;
  hasCompletedPreview: boolean;
  showSourcePanel: boolean;
  hasInteractiveExplorer: boolean;
  previewVideoUrl: string | null;
  editorName: string;
  sourcePreviewLanguage?: "cpp" | "python";
  result: PipelineResponse | null;
  shouldEmphasizeSourceLine: (line: string) => boolean;
  mergePromptScenario: (prompt: string, scenario: string) => string;

  onOutputModeChange: (mode: OutputMode) => void;
  onPromptChange: (val: string) => void;
  onSourceCodeChange: (val: string) => void;
  onSourceCodeLanguageChange: (val: string) => void;
  onRouterProviderChange: (val: ModelProvider) => void;
  onGenerationProviderChange: (val: ModelProvider) => void;
  onSandboxModeChange: (val: SandboxMode) => void;
  onEnableNarrationChange: (val: boolean) => void;
  onSourceImageChange: (val: string | null, name: string | null) => void;
  onStartNewQuestion: () => void;
  onSubmit: (e: FormEvent<HTMLFormElement>) => void;
  setEditorDirty: (dirty: boolean) => void;
  setPrompt: (updater: (prev: string) => string) => void;
}

export function StudioPage({
  prompt,
  outputMode,
  sourceImage,
  sourceCode,
  sourceCodeLanguage,
  routerProvider,
  generationProvider,
  sandboxMode,
  enableNarration,
  runtimeCatalog,
  loading,
  error,
  sourceImageName,
  routerProviderSupportsVision,
  generationProviderSupportsVision,
  hasCompletedPreview,
  showSourcePanel,
  hasInteractiveExplorer,
  previewVideoUrl,
  editorName,
  sourcePreviewLanguage,
  result,
  shouldEmphasizeSourceLine,
  mergePromptScenario,
  onOutputModeChange,
  onPromptChange,
  onSourceCodeChange,
  onSourceCodeLanguageChange,
  onRouterProviderChange,
  onGenerationProviderChange,
  onSandboxModeChange,
  onEnableNarrationChange,
  onSourceImageChange,
  onStartNewQuestion,
  onSubmit,
  setEditorDirty,
  setPrompt,
}: StudioPageProps) {

  const {
    seekToTime,
    handleVideoTimeUpdate,
    handleSourceLineClick,
    highlightedSourceLines,
  } = useVideoSync(result);

  const taskProgress = useTaskProgress(loading, hasCompletedPreview);

  return (
    <div id="studio">
      {/* Page Header */}
      <div className="page-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <span className="page-kicker">Workspace</span>
          <h1 className="page-title">
            {hasCompletedPreview ? "预览结果" : "想问什么直接问"}
          </h1>
          <p className="page-description">
            {hasCompletedPreview
              ? result?.cir.title ?? "视频渲染完成"
              : "AI 辅助生成引擎，统一管理题目、源码与题图输入。"}
          </p>
        </div>
        {hasCompletedPreview && (
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onStartNewQuestion}
            style={{ flexShrink: 0 }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>add</span>
            新建任务
          </button>
        )}
      </div>

      {/* === INPUT SECTION (collapses when preview is ready) === */}
      <div className={`studio-input-section ${hasCompletedPreview ? "is-collapsed" : ""}`}>
        <div className="bento-grid" style={{ marginTop: "24px" }}>
          {/* Main input card */}
          <div className="bento-card bento-card-xl studio-input-card">
            <div className="bento-card-header">
              <span className="bento-card-kicker">
                <span style={{ color: "var(--primary)" }}>● </span>
                等待输入
              </span>
            </div>
            <div className="bento-card-body">
              <ControlPanel
                outputMode={outputMode}
                layoutMode={hasCompletedPreview ? "split" : "hero"}
                prompt={prompt}
                sourceImage={sourceImage}
                sourceCode={sourceCode}
                sourceCodeLanguage={sourceCodeLanguage}
                routerProvider={routerProvider}
                generationProvider={generationProvider}
                sandboxMode={sandboxMode}
                enableNarration={enableNarration}
                skills={runtimeCatalog.skills}
                providers={runtimeCatalog.providers}
                sandboxModes={runtimeCatalog.sandbox_modes}
                loading={loading}
                sourceImageName={sourceImageName}
                routerProviderSupportsVision={routerProviderSupportsVision}
                generationProviderSupportsVision={generationProviderSupportsVision}
                onOutputModeChange={onOutputModeChange}
                onPromptChange={onPromptChange}
                onSourceCodeChange={onSourceCodeChange}
                onSourceCodeLanguageChange={onSourceCodeLanguageChange}
                onRouterProviderChange={onRouterProviderChange}
                onGenerationProviderChange={onGenerationProviderChange}
                onSandboxModeChange={onSandboxModeChange}
                onEnableNarrationChange={onEnableNarrationChange}
                onSourceImageChange={onSourceImageChange}
                onStartNewQuestion={onStartNewQuestion}
                onSubmit={onSubmit}
              />
            </div>
          </div>

          {/* Task Progress Card (replaces "处理模式") */}
          <div className="bento-card bento-card-md">
            <div className="bento-card-header">
              <span className="bento-card-kicker">任务进度</span>
            </div>
            <div className="bento-card-body">
              <TaskProgressCard
                currentStageIndex={taskProgress.currentStageIndex}
                stages={taskProgress.stages}
                isIdle={taskProgress.isIdle}
                isComplete={taskProgress.isComplete}
              />
            </div>
          </div>

          {/* Info card */}
          <div className="bento-card bento-card-md">
            <div className="bento-card-header">
              <span className="bento-card-kicker">当前聚焦</span>
            </div>
            <div className="bento-card-body">
              <h3 className="bento-card-title" style={{ marginBottom: "12px" }}>自动路由</h3>
              <p className="page-description" style={{ fontSize: "0.95rem" }}>
                系统会根据当前输入自动路由学科模块，并生成对应的讲解路径。
              </p>
              <div style={{ display: "grid", gap: "12px", marginTop: "20px" }}>
                <div style={{ padding: "14px 16px", background: "var(--surface-container-low)", borderRadius: "var(--radius-md)" }}>
                  <div className="page-kicker" style={{ marginBottom: "6px" }}>输入方式</div>
                  <div style={{ fontWeight: 700, marginBottom: "4px" }}>题目 / 源码 / 题图</div>
                  <div style={{ color: "var(--on-surface-variant)", fontSize: "0.85rem", lineHeight: 1.5 }}>一个主入口统一组织问题、源码与题图。</div>
                </div>
                <div style={{ padding: "14px 16px", background: "var(--surface-container-low)", borderRadius: "var(--radius-md)" }}>
                  <div className="page-kicker" style={{ marginBottom: "6px" }}>输出目标</div>
                  <div style={{ fontWeight: 700, marginBottom: "4px" }}>教学视频</div>
                  <div style={{ color: "var(--on-surface-variant)", fontSize: "0.85rem", lineHeight: 1.5 }}>生成讲解结构、脚本和可直接预览的动画结果。</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Loading/Error state */}
        {(loading || error) && !hasCompletedPreview ? (
          <div className="bento-card bento-card-full" style={{ marginTop: "24px" }}>
            <div className="bento-card-body">
              {error ? (
                <div className="generation-error">
                  <span className="material-symbols-outlined generation-error-icon">error</span>
                  <strong>生成失败</strong>
                  <p>{error}</p>
                </div>
              ) : loading ? (
                <div className="generation-loading">
                  <div className="generation-loading-visual">
                    <div className="generation-spinner">
                      <div className="generation-spinner-ring" />
                      <div className="generation-spinner-ring generation-spinner-ring-inner" />
                      <span className="material-symbols-outlined generation-spinner-icon">movie</span>
                    </div>
                  </div>
                  <div className="generation-loading-text">
                    <strong>正在生成视频</strong>
                    <p>AI 正在规划教学结构、编写动画脚本并渲染画面...</p>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>

      {/* === PREVIEW SECTION (slides up when video is ready) === */}
      <div className={`studio-preview-section ${hasCompletedPreview ? "is-active" : ""}`}>
        {hasCompletedPreview ? (
          <>
            {/* Compact prompt summary */}
            <div className="studio-compact-summary">
              <span className="material-symbols-outlined" style={{ fontSize: 18, color: "var(--primary)", flexShrink: 0 }}>description</span>
              <span className="studio-compact-summary-text">{prompt}</span>
              {result?.runtime.skill && (
                <span className="chip chip-outline" style={{ flexShrink: 0 }}>
                  {result.runtime.skill.label}
                </span>
              )}
            </div>

            {/* Preview content — HTML or Video */}
            {result?.preview_html_url ? (
              <div style={{ marginTop: "20px" }}>
                <HtmlPreviewPanel
                  src={result.preview_html_url}
                  cir={result.cir}
                  meta={
                    result
                      ? `${result.request_id.slice(0, 8)} · ${result.runtime.generation_provider?.label ?? generationProvider}`
                      : undefined
                  }
                />
              </div>
            ) : hasInteractiveExplorer && result?.execution_map ? (
              <div style={{ marginTop: "20px" }}>
                <InteractiveExecutionExplorer
                  key={result.request_id}
                  videoSrc={previewVideoUrl!}
                  videoTitle="当前渲染视频"
                  videoMeta={
                    result
                      ? `${result.request_id.slice(0, 8)} · ${result.runtime.generation_provider?.label ?? generationProvider}`
                      : undefined
                  }
                  downloadName={
                    result ? `${result.request_id}.mp4` : "metaview-preview.mp4"
                  }
                  sourceCode={sourceCode}
                  sourceLanguage={sourcePreviewLanguage}
                  editorName={editorName}
                  executionMap={result.execution_map}
                  onApplyParameterScenario={(scenario) => {
                    setEditorDirty(true);
                    setPrompt((current) => mergePromptScenario(current, scenario));
                  }}
                />
              </div>
            ) : (
              <div className="bento-grid" style={{ marginTop: "20px" }}>
                <div className="bento-card bento-card-xl">
                  <div className="video-preview">
                    <div className="video-preview-header">
                      <div>
                        <div className="video-preview-title">当前渲染视频</div>
                        <div className="video-preview-meta">
                          {result
                            ? `${result.request_id.slice(0, 8)} · ${result.runtime.generation_provider?.label ?? generationProvider}`
                            : "等待渲染"}
                        </div>
                      </div>
                    </div>
                    <div className="video-container">
                      <VideoPreview
                        src={previewVideoUrl!}
                        title="当前渲染视频"
                        downloadName={
                          result ? `${result.request_id}.mp4` : "metaview-preview.mp4"
                        }
                        headerless
                        onTimeUpdate={handleVideoTimeUpdate}
                        seekTo={seekToTime}
                      />
                    </div>
                  </div>
                </div>
                {showSourcePanel ? (
                  <div className="bento-card bento-card-md">
                    <div className="code-block">
                      <div className="code-header">
                        <div className="code-dots">
                          <span className="code-dot" />
                          <span className="code-dot" />
                          <span className="code-dot" />
                        </div>
                        <span className="code-title">{editorName}</span>
                      </div>
                      <div className="code-content">
                        <HighlightedCode
                          code={sourceCode}
                          language={sourcePreviewLanguage}
                          maxLines={24}
                          emphasizeLine={shouldEmphasizeSourceLine}
                          highlightedLines={highlightedSourceLines}
                          onLineClick={handleSourceLineClick}
                        />
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            )}
          </>
        ) : null}
      </div>
    </div>
  );
}
