import { lazy, Suspense, type FormEvent } from "react";
import { ControlPanel } from "../../components/ControlPanel";
import { TaskProgressCard } from "../../components/TaskProgressCard";
import { HighlightedCode } from "../../components/HighlightedCode";
import { useVideoSync } from "../../hooks/features/useVideoSync";
import { useTaskProgress } from "../../hooks/features/useTaskProgress";
import type { ModelProvider, OutputMode, PipelineResponse, RuntimeCatalog, SandboxMode, UITheme } from "../../types";

const HtmlPreviewPanel = lazy(() => import("../../components/HtmlPreviewPanel").then(m => ({ default: m.HtmlPreviewPanel })));
const InteractiveExecutionExplorer = lazy(() => import("../../components/InteractiveExecutionExplorer").then(m => ({ default: m.InteractiveExecutionExplorer })));
const VideoPreview = lazy(() => import("../../components/VideoPreview").then(m => ({ default: m.VideoPreview })));

function PreviewLoadingFallback() {
  return (
    <div className="bento-card" style={{ padding: "40px", textAlign: "center" }}>
      <div className="generation-spinner" style={{ margin: "0 auto 16px" }}>
        <div className="generation-spinner-ring" />
        <span className="material-symbols-outlined generation-spinner-icon" style={{ fontSize: 24 }}>loading</span>
      </div>
      <span style={{ color: "var(--on-surface-variant)" }}>加载预览组件...</span>
    </div>
  );
}

function PreviewCardAction({ onStartNewQuestion }: { onStartNewQuestion: () => void }) {
  return (
    <button
      type="button"
      className="btn btn-secondary"
      onClick={onStartNewQuestion}
      style={{ flexShrink: 0 }}
    >
      <span className="material-symbols-outlined" style={{ fontSize: 18 }}>add</span>
      新建任务
    </button>
  );
}

export interface StudioPageProps {
  activeRunId: string | null;
  prompt: string;
  outputMode: OutputMode;
  sourceImage: string | null;
  sourceCode: string;
  detectedSourceLanguage: string;
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
  previewHtmlUrl: string | null;
  editorName: string;
  sourcePreviewLanguage?: "cpp" | "python";
  result: PipelineResponse | null;
  theme: UITheme;
  shouldEmphasizeSourceLine: (line: string) => boolean;
  mergePromptScenario: (prompt: string, scenario: string) => string;

  onOutputModeChange: (mode: OutputMode) => void;
  onPromptChange: (val: string) => void;
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
  activeRunId,
  prompt,
  outputMode,
  sourceImage,
  sourceCode,
  detectedSourceLanguage,
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
  previewHtmlUrl,
  editorName,
  sourcePreviewLanguage,
  result,
  theme,
  shouldEmphasizeSourceLine,
  mergePromptScenario,
  onOutputModeChange,
  onPromptChange,
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

  const taskProgress = useTaskProgress(activeRunId, loading && activeRunId != null, hasCompletedPreview);
  const isRendering = loading && !hasCompletedPreview && taskProgress.currentStageIndex >= 3;

  return (
    <div id="studio">
      <div className="page-header studio-page-header">
        <div>
          <span className="page-kicker">Workspace</span>
          <h1 className="page-title">
            {hasCompletedPreview ? "预览结果" : "工作台"}
          </h1>
          <p className="page-description">
            {hasCompletedPreview
              ? result?.cir.title ?? (outputMode === "html" ? "交互动画已生成" : "视频渲染完成")
              : "题目、源码、题图一处汇总，统一生成 HTML 交互或视频结果。"}
          </p>
        </div>
      </div>

      <div className={`studio-input-section ${hasCompletedPreview || isRendering ? "is-collapsed" : ""}`}>
        <div className="studio-dashboard-grid">
          <div className="studio-main-column">
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
                  detectedSourceLanguage={detectedSourceLanguage}
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
          </div>

          <div className="studio-side-column">
            <div className="bento-card bento-card-md studio-side-card">
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

            <div className="bento-card bento-card-md studio-side-card studio-side-card-focus">
              <div className="bento-card-header">
                <span className="bento-card-kicker">当前聚焦</span>
              </div>
              <div className="bento-card-body">
                <h3 className="bento-card-title studio-side-title">自动路由</h3>
                <p className="page-description studio-side-description">
                  系统会自动路由学科模块，统一组织讲解结构、预览与回放入口。
                </p>
                <div className="studio-side-stack">
                  <div className="studio-side-mini-card">
                    <div className="page-kicker studio-side-mini-kicker">输入方式</div>
                    <div className="studio-side-mini-title">题目 / 源码 / 题图</div>
                    <div className="studio-side-mini-description">一个入口统一承接问题、源码与题图素材。</div>
                  </div>
                  <div className="studio-side-mini-card">
                    <div className="page-kicker studio-side-mini-kicker">输出目标</div>
                    <div className="studio-side-mini-title">{outputMode === "html" ? "HTML 交互" : "视频预览"}</div>
                    <div className="studio-side-mini-description">
                      {outputMode === "html"
                        ? "生成可直接交互的 HTML 动画结果。"
                        : "生成讲解脚本、渲染结果与可回放视频。"}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {(loading || error) && !hasCompletedPreview ? (
          <div className="bento-card bento-card-full studio-feedback-card">
            <div className="bento-card-body">
              {error ? (
                <div className="generation-error">
                  <span className="material-symbols-outlined generation-error-icon">error</span>
                  <strong>生成失败</strong>
                  <p>{error}</p>
                  <PreviewCardAction onStartNewQuestion={onStartNewQuestion} />
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
                    <strong>{outputMode === "html" ? "正在生成交互动画" : "正在生成视频"}</strong>
                    <p>{outputMode === "html" ? "AI 正在构建 GSAP + p5.js 交互运行时..." : "AI 正在规划教学结构、编写动画脚本并渲染画面..."}</p>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>

      {isRendering && (
        <div className="studio-rendering-section">
          <div className="studio-rendering-center">
            <div className="studio-prompt-tag">
              <span className="material-symbols-outlined" style={{ fontSize: 14 }}>description</span>
              <span className="studio-prompt-tag-text">{prompt}</span>
            </div>
            <div className="studio-rendering-visual">
              <div className="generation-spinner" style={{ width: 64, height: 64 }}>
                <div className="generation-spinner-ring" style={{ width: 64, height: 64 }} />
                <div className="generation-spinner-ring generation-spinner-ring-inner" style={{ width: 48, height: 48 }} />
                <span className="material-symbols-outlined generation-spinner-icon" style={{ fontSize: 22 }}>
                  {outputMode === "html" ? "code" : "movie"}
                </span>
              </div>
            </div>
            <div className="studio-rendering-status">
              <strong>{outputMode === "html" ? "生成交互动画中" : "渲染视频中"}</strong>
              <p>{outputMode === "html" ? "正在生成 HTML 交互动画..." : "动画脚本已完成，正在渲染画面..."}</p>
            </div>
            <div className="studio-rendering-stages">
              {taskProgress.stages.map((stage, i) => (
                <span
                  key={stage}
                  className={`studio-rendering-stage-dot ${i < taskProgress.currentStageIndex ? "is-done" : i === taskProgress.currentStageIndex ? "is-active" : ""}`}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      <div className={`studio-preview-section ${hasCompletedPreview ? "is-active" : ""}`}>
        {hasCompletedPreview ? (
          <div className="studio-preview-wrapper">
            {previewHtmlUrl ? (
              <div className="studio-preview-card-shell studio-preview-card-shell-html">
                <div className="studio-prompt-tag studio-prompt-tag-inline">
                  <span className="material-symbols-outlined" style={{ fontSize: 14 }}>description</span>
                  <span className="studio-prompt-tag-text">{prompt}</span>
                  {result?.runtime.skill ? (
                    <span className="studio-prompt-tag-skill">{result.runtime.skill.label}</span>
                  ) : null}
                </div>
                <div style={{ marginTop: "20px" }}>
                  <Suspense fallback={<PreviewLoadingFallback />}>
                    <HtmlPreviewPanel
                      src={previewHtmlUrl}
                      theme={theme}
                      meta={
                        result
                          ? `${result.request_id.slice(0, 8)} · ${result.runtime.generation_provider?.label ?? generationProvider}`
                          : undefined
                      }
                      headerAction={<PreviewCardAction onStartNewQuestion={onStartNewQuestion} />}
                    />
                  </Suspense>
                </div>
              </div>
            ) : hasInteractiveExplorer && result?.execution_map ? (
              <div style={{ marginTop: "20px" }}>
                <Suspense fallback={<PreviewLoadingFallback />}>
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
                </Suspense>
                <div style={{ marginTop: "12px", display: "flex", justifyContent: "flex-end" }}>
                  <PreviewCardAction onStartNewQuestion={onStartNewQuestion} />
                </div>
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
                      <PreviewCardAction onStartNewQuestion={onStartNewQuestion} />
                    </div>
                    <Suspense fallback={<PreviewLoadingFallback />}>
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
                    </Suspense>
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
          </div>
        ) : null}
      </div>
    </div>
  );
}
