import type { FormEvent } from "react";
import { ControlPanel } from "../../components/ControlPanel";
import { HighlightedCode } from "../../components/HighlightedCode";
import { InteractiveExecutionExplorer } from "../../components/InteractiveExecutionExplorer";
import { VideoPreview } from "../../components/VideoPreview";
import { useVideoSync } from "../../hooks/features/useVideoSync";
import type { ModelProvider, PipelineResponse, RuntimeCatalog, SandboxMode, TopicDomain } from "../../types";

export interface StudioPageProps {
  deckMode: "smart" | "expert";
  selectedDomain: TopicDomain | null;
  prompt: string;
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
  selectedDomainLabel: string;
  selectedMetrics: Array<{ label: string; value: string; description: string }>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  selectedPresentation: any;
  shouldEmphasizeSourceLine: (line: string) => boolean;
  mergePromptScenario: (prompt: string, scenario: string) => string;
  
  onDeckModeChange: (mode: "smart" | "expert") => void;
  onSelectDomain: (domain: TopicDomain) => void;
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
  deckMode,
  selectedDomain,
  prompt,
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
  selectedDomainLabel,
  selectedMetrics,
  selectedPresentation,
  shouldEmphasizeSourceLine,
  mergePromptScenario,
  onDeckModeChange,
  onSelectDomain,
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
  setPrompt
}: StudioPageProps) {

  const {
    seekToTime,
    handleVideoTimeUpdate,
    handleSourceLineClick,
    highlightedSourceLines,
  } = useVideoSync(result);

  return (
    <div id="studio">
      <div className="page-header">
        <span className="page-kicker">Workspace</span>
        <h1 className="page-title">想问什么直接问</h1>
        <p className="page-description">AI 辅助生成引擎，统一管理题目、源码与题图输入。</p>
      </div>

      <div className="bento-grid" style={{ marginTop: "32px" }}>
        <div className="bento-card bento-card-xl">
          <div className="bento-card-header">
            <span className="bento-card-kicker">
              <span style={{ color: "var(--primary)" }}>● </span>
              等待输入
            </span>
          </div>
          <div className="bento-card-body">
            <ControlPanel
              deckMode={deckMode}
              layoutMode={hasCompletedPreview ? "split" : "hero"}
              selectedDomain={selectedDomain}
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
              onDeckModeChange={onDeckModeChange}
              onSelectDomain={onSelectDomain}
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

        <div className="bento-card bento-card-md">
          <div className="bento-card-header">
            <span className="bento-card-kicker">处理模式</span>
          </div>
          <div className="bento-card-body">
            <div className="mode-toggle">
              <div
                className={`mode-option ${deckMode === "smart" ? "is-selected" : ""}`}
                onClick={() => onDeckModeChange("smart")}
              >
                <div className="mode-option-left">
                  <span className="material-symbols-outlined mode-option-icon">psychology</span>
                  <div>
                    <div className="mode-option-label">智能模式</div>
                    <div className="mode-option-hint">优化速度与清晰度</div>
                  </div>
                </div>
              </div>
              <div
                className={`mode-option ${deckMode === "expert" ? "is-selected" : ""}`}
                onClick={() => onDeckModeChange("expert")}
              >
                <div className="mode-option-left">
                  <span className="material-symbols-outlined mode-option-icon">science</span>
                  <div>
                    <div className="mode-option-label">专家模式</div>
                    <div className="mode-option-hint">高精度输出</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="bento-card bento-card-md">
          <div className="bento-card-header">
            <span className="bento-card-kicker">当前聚焦</span>
          </div>
          <div className="bento-card-body">
            <h3 className="bento-card-title" style={{ marginBottom: "12px" }}>{selectedDomainLabel}</h3>
            <p className="page-description" style={{ fontSize: "0.95rem" }}>
              {selectedPresentation?.studioDescription ?? "系统会根据当前输入自动路由学科模块，并生成对应的讲解路径。"}
            </p>
            <div style={{ display: "grid", gap: "12px", marginTop: "20px" }}>
              {selectedMetrics.map((metric) => (
                <div key={metric.label} style={{ padding: "14px 16px", background: "var(--surface-container-low)", borderRadius: "12px" }}>
                  <div className="page-kicker" style={{ marginBottom: "6px" }}>{metric.label}</div>
                  <div style={{ fontWeight: 700, marginBottom: "4px" }}>{metric.value}</div>
                  <div style={{ color: "var(--on-surface-variant)", fontSize: "0.85rem", lineHeight: 1.5 }}>{metric.description}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {hasCompletedPreview ? (
        hasInteractiveExplorer && result?.execution_map ? (
          <div style={{ marginTop: "24px" }}>
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
          <div className="bento-grid" style={{ marginTop: "24px" }}>
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
        )
      ) : null}

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
                <div className="generation-loading-steps">
                  <div className="generation-step is-active">
                    <span className="generation-step-dot" />
                    <span>领域路由</span>
                  </div>
                  <div className="generation-step-line" />
                  <div className="generation-step">
                    <span className="generation-step-dot" />
                    <span>CIR 规划</span>
                  </div>
                  <div className="generation-step-line" />
                  <div className="generation-step">
                    <span className="generation-step-dot" />
                    <span>脚本编码</span>
                  </div>
                  <div className="generation-step-line" />
                  <div className="generation-step">
                    <span className="generation-step-dot" />
                    <span>渲染输出</span>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
