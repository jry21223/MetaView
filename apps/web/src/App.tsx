import { startTransition, useEffect, useState } from "react";
import type { FormEvent } from "react";

import {
  deleteCustomProvider,
  getPipelineRun,
  getPipelineRuns,
  getRuntimeCatalog,
  runPipeline,
  updateRuntimeSettings,
  upsertCustomProvider,
} from "./api/client";
import { CodeAdapterPanel } from "./components/CodeAdapterPanel";
import { ControlPanel } from "./components/ControlPanel";
import { HighlightedCode } from "./components/HighlightedCode";
import { PromptReferenceTool } from "./components/PromptReferenceTool";
import { TTSSettingsPanel } from "./components/TTSSettingsPanel";
import {
  domainPresets,
  getDomainPresentation,
} from "./domainPresentation";
import { HistoryPanel } from "./components/HistoryPanel";
import { ProviderManager } from "./components/ProviderManager";
import { VideoPreview } from "./components/VideoPreview";
import type {
  CustomProviderUpsertRequest,
  ModelProvider,
  PipelineResponse,
  PipelineRunSummary,
  RuntimeCatalog,
  SandboxMode,
  SkillDescriptor,
  TopicDomain,
} from "./types";

const defaultPrompt = "输入一个题目、源码或题图，生成对应的 Manim 讲解动画视频。";
const themeStorageKey = "metaview-theme";

type ThemeMode = "dark" | "light";
type DeckMode = "smart" | "expert";

const fallbackRuntimeCatalog: RuntimeCatalog = {
  default_provider: "openai",
  default_router_provider: "openai",
  default_generation_provider: "openai",
  sandbox_engine: "python-manim-static",
  providers: [
    {
      name: "openai",
      label: "OpenAI Compatible",
      kind: "openai_compatible",
      model: "not-configured",
      stage_models: {},
      description: "OpenAI 兼容 Provider，需配置环境变量后启用。",
      configured: false,
      is_custom: false,
      supports_vision: false,
      base_url: null,
    },
  ],
  skills: [],
  sandbox_modes: ["dry_run", "off"],
  settings: {
    mock_provider_enabled: false,
    tts: {
      enabled: true,
      backend: "openai_compatible",
      model: "mimotts-v2",
      base_url: null,
      api_key_configured: false,
      voice: "default",
      rate_wpm: 150,
      speed: 0.88,
      max_chars: 1500,
      timeout_s: 120,
    },
  },
};

function resolvePreviewVideoUrl(url: string | null | undefined): string | null {
  if (!url) {
    return null;
  }
  if (/^https?:\/\//.test(url)) {
    return url;
  }

  const apiBaseUrl = String(import.meta.env.VITE_API_BASE_URL ?? "").trim();
  if (!apiBaseUrl) {
    return url;
  }
  return new URL(url, `${apiBaseUrl.replace(/\/$/, "")}/`).toString();
}

function activeProviderSupportsVision(catalog: RuntimeCatalog, providerName: ModelProvider): boolean {
  return catalog.providers.find((candidate) => candidate.name === providerName)?.supports_vision ?? false;
}

function resolveConfiguredProvider(
  catalog: RuntimeCatalog,
  requestedProvider: ModelProvider | null | undefined,
  fallbackProvider: ModelProvider,
): ModelProvider {
  const availableProviders = catalog.providers;
  const configuredProviders = catalog.providers.filter((candidate) => candidate.configured);
  if (configuredProviders.some((candidate) => candidate.name === requestedProvider)) {
    return requestedProvider as ModelProvider;
  }
  if (configuredProviders.some((candidate) => candidate.name === fallbackProvider)) {
    return fallbackProvider;
  }
  if (configuredProviders[0]?.name) {
    return configuredProviders[0].name;
  }
  if (availableProviders.some((candidate) => candidate.name === requestedProvider)) {
    return requestedProvider as ModelProvider;
  }
  if (availableProviders.some((candidate) => candidate.name === fallbackProvider)) {
    return fallbackProvider;
  }
  return availableProviders[0]?.name ?? fallbackProvider;
}

function getInitialTheme(): ThemeMode {
  if (typeof window === "undefined") {
    return "dark";
  }
  const storedTheme = window.localStorage.getItem(themeStorageKey);
  if (storedTheme === "dark" || storedTheme === "light") {
    return storedTheme;
  }
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

function resolveSourceEditorName(sourceCode: string, sourceCodeLanguage: string): string {
  if (!sourceCode.trim()) {
    return "source input";
  }
  if (sourceCodeLanguage === "cpp") {
    return "source.cpp";
  }
  if (sourceCodeLanguage === "python") {
    return "source.py";
  }
  return "source.txt";
}

function shouldEmphasizeSourceLine(line: string): boolean {
  const normalized = line.trim();
  return (
    normalized.startsWith("def ") ||
    normalized.startsWith("class ") ||
    normalized.startsWith("if ") ||
    normalized.startsWith("elif ") ||
    normalized.startsWith("else") ||
    normalized.includes("while ") ||
    normalized.includes("for ") ||
    normalized.startsWith("return ") ||
    normalized.startsWith("int ") ||
    normalized.startsWith("auto ") ||
    normalized.startsWith("vector<") ||
    normalized.includes("mid") ||
    normalized.includes("left") ||
    normalized.includes("right") ||
    normalized.includes("swap") ||
    normalized.includes("target")
  );
}

function resolveSubjectSkill(
  catalog: RuntimeCatalog,
  selectedDomain: TopicDomain | null,
  activeSkill: SkillDescriptor | null,
): SkillDescriptor | null {
  if (activeSkill) {
    return activeSkill;
  }
  if (!selectedDomain) {
    return null;
  }
  return catalog.skills.find((skill) => skill.domain === selectedDomain) ?? null;
}

export default function App() {
  const [prompt, setPrompt] = useState(defaultPrompt);
  const [deckMode, setDeckMode] = useState<DeckMode>("smart");
  const [selectedDomain, setSelectedDomain] = useState<TopicDomain | null>(null);
  const [sourceCode, setSourceCode] = useState("");
  const [sourceCodeLanguage, setSourceCodeLanguage] = useState("");
  const [routerProvider, setRouterProvider] = useState<ModelProvider>(
    fallbackRuntimeCatalog.default_router_provider,
  );
  const [generationProvider, setGenerationProvider] = useState<ModelProvider>(
    fallbackRuntimeCatalog.default_generation_provider,
  );
  const [sandboxMode, setSandboxMode] = useState<SandboxMode>("dry_run");
  const [enableNarration, setEnableNarration] = useState(true);
  const [sourceImage, setSourceImage] = useState<string | null>(null);
  const [sourceImageName, setSourceImageName] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PipelineResponse | null>(null);
  const [runtimeCatalog, setRuntimeCatalog] = useState<RuntimeCatalog>(fallbackRuntimeCatalog);
  const [runs, setRuns] = useState<PipelineRunSummary[]>([]);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [theme, setTheme] = useState<ThemeMode>(getInitialTheme);

  const activeSkill = result?.runtime.skill ?? null;
  const previewVideoUrl = resolvePreviewVideoUrl(result?.preview_video_url);
  const hasRawProviderOutput = Boolean(
    result?.runtime.agent_traces.some((trace) => Boolean(trace.raw_output)),
  );
  const routerProviderSupportsVision = activeProviderSupportsVision(
    runtimeCatalog,
    routerProvider,
  );
  const generationProviderSupportsVision = activeProviderSupportsVision(
    runtimeCatalog,
    generationProvider,
  );
  const effectiveSelectedDomain =
    deckMode === "expert" ? selectedDomain : (activeSkill?.domain ?? null);
  const subjectSkill = resolveSubjectSkill(runtimeCatalog, effectiveSelectedDomain, activeSkill);
  const presentation = getDomainPresentation(subjectSkill?.domain ?? effectiveSelectedDomain);
  const editorName = resolveSourceEditorName(sourceCode, sourceCodeLanguage);
  const sourcePreviewLanguage =
    sourceCodeLanguage === "cpp"
      ? "cpp"
      : sourceCodeLanguage === "python"
        ? "python"
        : undefined;
  const hasCompletedPreview = Boolean(previewVideoUrl);
  const showPreviewPanel = loading || Boolean(result) || Boolean(error);
  const showSourcePanel = sourceCode.trim().length > 0;
  const showDualResults = showPreviewPanel && showSourcePanel;
  const showHistoryPanel = runs.length > 0 || Boolean(historyError);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.classList.toggle("dark", theme === "dark");
    window.localStorage.setItem(themeStorageKey, theme);
  }, [theme]);

  async function refreshRuntimeCatalog(): Promise<RuntimeCatalog> {
    try {
      const catalog = await getRuntimeCatalog();
      setRuntimeCatalog(catalog);
      setRouterProvider((current) =>
        resolveConfiguredProvider(catalog, current, catalog.default_router_provider),
      );
      setGenerationProvider((current) =>
        resolveConfiguredProvider(catalog, current, catalog.default_generation_provider),
      );
      return catalog;
    } catch {
      setRuntimeCatalog(fallbackRuntimeCatalog);
      return fallbackRuntimeCatalog;
    }
  }

  async function loadRuns() {
    try {
      const historyRuns = await getPipelineRuns();
      setRuns(historyRuns);
      setHistoryError(null);
    } catch (loadError) {
      setHistoryError(loadError instanceof Error ? loadError.message : "历史记录加载失败");
    }
  }

  useEffect(() => {
    let active = true;

    void getRuntimeCatalog()
      .then((catalog) => {
        if (!active) {
          return;
        }

        setRuntimeCatalog(catalog);
        setRouterProvider(
          resolveConfiguredProvider(
            catalog,
            catalog.default_router_provider,
            catalog.default_router_provider,
          ),
        );
        setGenerationProvider(
          resolveConfiguredProvider(
            catalog,
            catalog.default_generation_provider,
            catalog.default_generation_provider,
          ),
        );
      })
      .catch(() => {
        if (active) {
          setRuntimeCatalog(fallbackRuntimeCatalog);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    void loadRuns();
  }, []);

  useEffect(() => {
    if (deckMode === "expert" || runtimeCatalog.skills.length === 0 || selectedDomain) {
      return;
    }
    setSelectedDomain(runtimeCatalog.skills[0]?.domain ?? null);
  }, [deckMode, runtimeCatalog.skills, selectedDomain]);

  function handleSourceImageChange(value: string | null, name: string | null) {
    setSourceImage(value);
    setSourceImageName(name);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const response = await runPipeline(
        prompt,
        routerProvider,
        generationProvider,
        sandboxMode,
        deckMode === "expert" ? selectedDomain : null,
        sourceCode,
        sourceCodeLanguage || null,
        sourceImage,
        sourceImageName,
        theme,
        enableNarration,
      );
      startTransition(() => {
        setResult(response);
        setSelectedRunId(response.request_id);
      });
      if (deckMode === "smart") {
        setSelectedDomain(response.runtime.skill.domain);
      }
      await loadRuns();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "请求失败");
    } finally {
      setLoading(false);
    }
  }

  async function handleSelectRun(requestId: string) {
    try {
      const run = await getPipelineRun(requestId);
      startTransition(() => {
        setResult(run.response);
        setSelectedRunId(requestId);
      });
      setPrompt(run.request.prompt);
      setSourceCode(run.request.source_code ?? "");
      setSourceCodeLanguage(run.request.source_code_language ?? "");
      setRouterProvider(
        resolveConfiguredProvider(
          runtimeCatalog,
          run.request.router_provider ?? run.response.runtime.router_provider?.name,
          runtimeCatalog.default_router_provider,
        ),
      );
      setGenerationProvider(
        resolveConfiguredProvider(
          runtimeCatalog,
          run.request.generation_provider ??
            run.request.provider ??
            run.response.runtime.generation_provider?.name ??
            run.response.runtime.provider?.name,
          runtimeCatalog.default_generation_provider,
        ),
      );
      setSandboxMode(run.request.sandbox_mode);
      setSourceImage(run.request.source_image ?? null);
      setSourceImageName(run.request.source_image_name ?? null);
      setEnableNarration(run.request.enable_narration ?? true);
      setDeckMode(run.request.domain ? "expert" : "smart");
      setSelectedDomain(run.response.runtime.skill.domain);
      setError(null);
    } catch (loadError) {
      setHistoryError(loadError instanceof Error ? loadError.message : "任务详情加载失败");
    }
  }

  function handleExportCurrent() {
    if (!result) {
      return;
    }

    const exportedPayload = {
      exported_at: new Date().toISOString(),
      request: {
        prompt,
        source_code: sourceCode || null,
        source_code_language: sourceCodeLanguage || null,
        provider: generationProvider,
        router_provider: routerProvider,
        generation_provider: generationProvider,
        source_image_name: sourceImageName,
        enable_narration: enableNarration,
        sandbox_mode: sandboxMode,
      },
      response: result,
    };

    const blob = new Blob([JSON.stringify(exportedPayload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${result.request_id}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function handleCreateProvider(payload: CustomProviderUpsertRequest) {
    await upsertCustomProvider(payload);
    const catalog = await refreshRuntimeCatalog();
    const providerExistsAndIsConfigured = catalog.providers.some(
      (candidate) => candidate.name === payload.name && candidate.configured,
    );
    setGenerationProvider(
      providerExistsAndIsConfigured ? payload.name : catalog.default_generation_provider,
    );
  }

  async function handleDeleteProvider(name: string) {
    await deleteCustomProvider(name);
    const catalog = await refreshRuntimeCatalog();
    if (routerProvider === name) {
      setRouterProvider(catalog.default_router_provider);
    }
    if (generationProvider === name) {
      setGenerationProvider(catalog.default_generation_provider);
    }
  }

  async function handleUpdateRuntimeSettings(payload: {
    mock_provider_enabled: boolean;
    tts: {
      enabled: boolean;
      backend: "auto" | "system" | "openai_compatible";
      model: string;
      base_url?: string | null;
      api_key?: string | null;
      voice: string;
      rate_wpm: number;
      speed: number;
      max_chars: number;
      timeout_s?: number | null;
    };
  }) {
    await updateRuntimeSettings(payload);
    await refreshRuntimeCatalog();
  }

  function handleSelectDomain(domain: TopicDomain) {
    setSelectedDomain(domain);
    setPrompt(domainPresets[domain] ?? defaultPrompt);
    if (domain === "code" && !sourceCodeLanguage) {
      setSourceCodeLanguage("python");
    }
  }

  function handleSetDeckMode(mode: DeckMode) {
    setDeckMode(mode);
    if (mode === "expert" && !selectedDomain) {
      setSelectedDomain(runtimeCatalog.skills[0]?.domain ?? null);
    }
  }

  return (
    <div className="theory-shell">
      <header className="topbar">
        <div className="brand-block">
          <span className="brand-mark" />
          <div>
            <strong>MetaView</strong>
            <small>Theoretical Canvas</small>
          </div>
        </div>

        <nav className="topbar-nav">
          <a href="#studio">Studio</a>
          <a href="#history">History</a>
          <a href="#tools">Tools</a>
        </nav>

        <div className="topbar-actions">
          <button
            type="button"
            className="theme-toggle"
            onClick={() => setTheme((current) => (current === "dark" ? "light" : "dark"))}
          >
            {theme === "dark" ? "Light Mode" : "Dark Mode"}
          </button>
        </div>
      </header>

      <div className="workspace">
        <main className="canvas">
          <section
            className={`studio-layout ${hasCompletedPreview ? "is-resolved" : "hero-shell"}`}
            id="studio"
          >
            <div className="hero-glow" />
            <div className="studio-column">
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
                onDeckModeChange={handleSetDeckMode}
                onSelectDomain={handleSelectDomain}
                onPromptChange={setPrompt}
                onSourceCodeChange={setSourceCode}
                onSourceCodeLanguageChange={setSourceCodeLanguage}
                onRouterProviderChange={setRouterProvider}
                onGenerationProviderChange={setGenerationProvider}
                onSandboxModeChange={setSandboxMode}
                onEnableNarrationChange={setEnableNarration}
                onSourceImageChange={handleSourceImageChange}
                onSubmit={handleSubmit}
              />

              {hasCompletedPreview && showSourcePanel ? (
                <section className="panel source-panel studio-source-panel">
                  <div className="panel-header">
                    <span className="panel-kicker">Source</span>
                    <h3>算法源码</h3>
                    <p>这里只高亮你输入的 Python / C++ 源码，不展示生成的 Manim 脚本。</p>
                  </div>

                  <div className="console-toolbar">
                    <div className="console-dots">
                      <span />
                      <span />
                      <span />
                    </div>
                    <strong>{editorName}</strong>
                  </div>
                  <div className="console-content source-console">
                    <HighlightedCode
                      code={sourceCode}
                      language={sourcePreviewLanguage}
                      maxLines={24}
                      emphasizeLine={shouldEmphasizeSourceLine}
                    />
                  </div>
                </section>
              ) : null}
            </div>

            {hasCompletedPreview ? (
              <section className="panel stage-panel stage-panel-sticky stage-panel-compact">
                <div className="split-stage-meta">
                  <span className="panel-kicker">Video</span>
                  <div className="preview-runtime-badges">
                    <span>{subjectSkill?.domain ?? effectiveSelectedDomain ?? "auto"}</span>
                    <span>video ready</span>
                    <span>{result?.runtime.sandbox.status ?? sandboxMode}</span>
                  </div>
                </div>

                <div className="preview-stage">
                  <VideoPreview
                    src={previewVideoUrl!}
                    title="当前渲染视频"
                    meta={
                      result
                        ? `${result.request_id.slice(0, 8)} · ${result.runtime.generation_provider?.label ?? generationProvider}`
                        : undefined
                    }
                    downloadName={
                      result ? `${result.request_id}.mp4` : "metaview-preview.mp4"
                    }
                  />
                </div>
              </section>
            ) : null}
          </section>

          {!hasCompletedPreview && (showPreviewPanel || showSourcePanel) ? (
            <section
              className={`results-layout ${showDualResults ? "has-source" : ""}`}
              id="results"
            >
              {showPreviewPanel ? (
                <section className="panel stage-panel">
                  <div className="panel-header panel-header-row">
                    <div>
                      <span className="panel-kicker">Result</span>
                      <h3>{result?.cir.title ?? "正在生成预览"}</h3>
                      <p>
                        {result?.cir.summary ??
                          "后端正在渲染视频，完成后会自动显示在这里。"}
                      </p>
                    </div>
                    <div className="preview-runtime-badges">
                      <span>{subjectSkill?.domain ?? effectiveSelectedDomain ?? "auto"}</span>
                      <span>{previewVideoUrl ? "video ready" : loading ? "rendering" : "idle"}</span>
                      <span>{result?.runtime.sandbox.status ?? sandboxMode}</span>
                    </div>
                  </div>

                  {error ? <p className="error-text">{error}</p> : null}
                  {result ? (
                    <p className="panel-note">
                      当前任务已路由到 <strong>{result.runtime.skill.label}</strong>。
                    </p>
                  ) : null}

                  {previewVideoUrl ? (
                    <div className="preview-stage">
                      <VideoPreview
                        src={previewVideoUrl}
                        title="当前渲染视频"
                        meta={
                          result
                            ? `${result.request_id.slice(0, 8)} · ${result.runtime.generation_provider?.label ?? generationProvider}`
                            : undefined
                        }
                        downloadName={
                          result ? `${result.request_id}.mp4` : "metaview-preview.mp4"
                        }
                      />
                    </div>
                  ) : (
                    <div className="preview-stage">
                      <div className={`preview-empty ${loading ? "is-loading" : ""}`}>
                        <strong>
                          {error
                            ? "本次生成失败"
                            : loading
                              ? "正在渲染视频"
                              : presentation?.emptyTitle ?? "等待下一次渲染"}
                        </strong>
                        <span>
                          {error
                            ? error
                            : loading
                              ? "后端正在进行镜头规划、脚本生成和视频输出。"
                              : presentation?.emptyDescription ??
                                "提交题目后，这里会直接显示最终 MP4 预览。"}
                        </span>
                        <ul className="preview-checklist">
                          {(error
                            ? ["检查 provider 连通性", "确认提示词与源码输入", "重新提交生成任务"]
                            : result?.cir.steps.length
                              ? result.cir.steps.slice(0, 4).map((step) => step.title)
                              : presentation?.sceneNodes ?? ["Input", "Plan", "Render", "Result"]
                          ).map((item) => (
                            <li key={item}>{item}</li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  )}
                </section>
              ) : null}

              {showSourcePanel ? (
                <section className="panel source-panel">
                  <div className="panel-header">
                    <span className="panel-kicker">Source</span>
                    <h3>算法源码</h3>
                    <p>这里只高亮你输入的 Python / C++ 源码，不展示生成的 Manim 脚本。</p>
                  </div>

                  <div className="console-toolbar">
                    <div className="console-dots">
                      <span />
                      <span />
                      <span />
                    </div>
                    <strong>{editorName}</strong>
                  </div>
                  <div className="console-content source-console">
                    <HighlightedCode
                      code={sourceCode}
                      language={sourcePreviewLanguage}
                      maxLines={24}
                      emphasizeLine={shouldEmphasizeSourceLine}
                    />
                  </div>
                </section>
              ) : null}
            </section>
          ) : null}

          {showHistoryPanel ? (
            <section className="history-layout" id="history">
              <HistoryPanel
                error={historyError}
                runs={runs}
                selectedRunId={selectedRunId}
                onSelectRun={handleSelectRun}
              />
            </section>
          ) : null}

          <details className="panel panel-advanced" id="tools">
            <summary className="advanced-summary">调试与生成脚本</summary>
            <div className="advanced-grid">
              <section className="panel panel-history-detail panel-nested">
                <div className="panel-header">
                  <span className="panel-kicker">Diagnostics</span>
                  <h3>运行诊断</h3>
                </div>
                {result ? (
                  <ul className="trace-list">
                    {result.runtime.agent_traces.map((trace) => (
                      <li key={`${trace.agent}-${trace.summary}`}>
                        <strong>{trace.agent}</strong>
                        <span>{trace.summary}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
                <ul className="diagnostic-list">
                  {(result?.diagnostics ?? []).map((diagnostic, index) => (
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
                    onClick={handleExportCurrent}
                    disabled={!result}
                  >
                    导出当前任务 JSON
                  </button>
                </div>
              </section>

              <section className="panel panel-code panel-nested">
                <div className="panel-header">
                  <span className="panel-kicker">Generated Script</span>
                  <h3>生成的 Manim 脚本</h3>
                  <p>这里仅用于排查，不参与主页中的源码高亮。</p>
                </div>
                {result?.renderer_script ? (
                  <div className="console-content generated-console">
                    <HighlightedCode
                      code={result.renderer_script}
                      language="python"
                      className="highlighted-code-surface"
                    />
                  </div>
                ) : (
                  <div className="history-empty">生成任务后，这里会显示最终 Python Manim 脚本。</div>
                )}
              </section>

              <section className="panel panel-code panel-nested">
                <div className="panel-header">
                  <span className="panel-kicker">LLM Raw Output</span>
                  <h3>模型原始返回</h3>
                  <p>只在需要排查 provider 返回或提示词遵循时查看。</p>
                </div>
                {hasRawProviderOutput ? (
                  <div className="raw-output-list">
                    {result?.runtime.agent_traces
                      .filter((trace) => Boolean(trace.raw_output))
                      .map((trace) => (
                        <article className="raw-output-card" key={`${trace.agent}-${trace.model}`}>
                          <div className="raw-output-head">
                            <strong>{trace.agent}</strong>
                            <span>
                              {trace.provider} / {trace.model}
                            </span>
                          </div>
                          <p>{trace.summary}</p>
                          <pre>{trace.raw_output}</pre>
                        </article>
                      ))}
                  </div>
                ) : (
                  <div className="history-empty">当前结果没有记录可展示的原始返回。</div>
                )}
              </section>

              <section className="panel panel-history-detail panel-nested">
                <div className="panel-header">
                  <span className="panel-kicker">Repair Loop</span>
                  <h3>验证与修复</h3>
                </div>
                {historyError ? <p className="error-text">{historyError}</p> : null}
                {result ? (
                  <ul className="diagnostic-list">
                    {result.runtime.validation.issues.map((issue, index) => (
                      <li key={`${issue.code}-${index}`}>
                        <strong>{issue.severity}</strong>
                        <span>{issue.message}</span>
                      </li>
                    ))}
                    {result.runtime.repair_actions.map((action, index) => (
                      <li key={`repair-${index}`}>
                        <strong>repair</strong>
                        <span>{action}</span>
                      </li>
                    ))}
                    {result.runtime.validation.issues.length === 0 &&
                    result.runtime.repair_actions.length === 0 ? (
                      <li className="empty-state">当前任务未触发额外修复动作。</li>
                    ) : null}
                  </ul>
                ) : (
                  <div className="history-empty">生成任务后，这里会展示验证与修复细节。</div>
                )}
              </section>
            </div>
          </details>

          <details className="panel panel-advanced">
            <summary className="advanced-summary">代码转换测试</summary>
            <div className="advanced-grid advanced-grid-single">
              <CodeAdapterPanel />
            </div>
          </details>

          <details className="panel panel-advanced">
            <summary className="advanced-summary">Provider 管理</summary>
            <div className="advanced-grid">
              <ProviderManager
                providers={runtimeCatalog.providers}
                onCreateProvider={handleCreateProvider}
                onDeleteProvider={handleDeleteProvider}
              />

              <TTSSettingsPanel
                settings={runtimeCatalog.settings}
                onSave={handleUpdateRuntimeSettings}
              />

              <section className="panel panel-history-detail panel-nested">
                <div className="panel-header">
                  <span className="panel-kicker">Skill Routing</span>
                  <h3>当前路由状态</h3>
                  <p>主界面简化后，这里作为学科模块和版本的检查面板保留。</p>
                </div>
                <div className="skill-card">
                  <strong>{activeSkill?.label ?? "等待模型判断"}</strong>
                  <p>{activeSkill?.description ?? "提交题目后，这里会显示当前 skill。"}</p>
                  <div className="history-item-meta">
                    <span>{activeSkill?.id ?? "auto-routing"}</span>
                    <span>{activeSkill?.domain ?? "unknown"}</span>
                    <span>{activeSkill?.supports_image_input ? "image-aware" : "text-first"}</span>
                  </div>
                </div>
                <ul className="diagnostic-list">
                  {runtimeCatalog.skills.map((skill) => (
                    <li key={skill.id}>
                      <strong>{skill.label}</strong>
                      <span>
                        {skill.domain} / {skill.version} / {skill.supports_image_input ? "image" : "text"}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            </div>
          </details>

          <details className="panel panel-advanced">
            <summary className="advanced-summary">Prompt 工具</summary>
            <div className="advanced-grid advanced-grid-single">
              <PromptReferenceTool
                providers={runtimeCatalog.providers}
                defaultProvider={runtimeCatalog.default_generation_provider}
              />
            </div>
          </details>
        </main>
      </div>
    </div>
  );
}
