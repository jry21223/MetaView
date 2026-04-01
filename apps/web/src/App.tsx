import { startTransition, useEffect, useEffectEvent, useState } from "react";
import { useTheme } from "./hooks/core/useTheme";
import { useRuntimeCatalog, resolveConfiguredProvider, activeProviderSupportsVision } from "./hooks/core/useRuntimeCatalog";
import { useMouseGlow } from "./hooks/core/useMouseGlow";
import { useHistoryRuns } from "./hooks/features/useHistoryRuns";

import type { FormEvent } from "react";

import {
  deleteCustomProvider,
  getPipelineRun,
  submitPipeline,
  updateRuntimeSettings,
  upsertCustomProvider,
} from "./api/client";
import {
  domainLabels,
  domainPresets,
  getDomainPresentation,
} from "./domainPresentation";

import { StudioPage } from "./pages/Studio/StudioPage";
import { HistoryPage } from "./pages/History/HistoryPage";
import { ToolsPage } from "./pages/Tools/ToolsPage";

import type {
  CustomProviderUpsertRequest,
  ModelProvider,
  PipelineResponse,
  PipelineRunDetail,
  SandboxMode,
  TopicDomain,
} from "./types";

const defaultPrompt = "输入一个题目、源码或题图，生成对应的 Manim 讲解动画视频。";

type DeckMode = "smart" | "expert";
type AppPage = "studio" | "history" | "tools";

const activeRunStorageKey = "metaview-active-run-id";
const selectedRunStorageKey = "metaview-selected-run-id";

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

function getInitialActiveRunId(): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  const storedRunId = window.localStorage.getItem(activeRunStorageKey)?.trim();
  return storedRunId ? storedRunId : null;
}

function getInitialSelectedRunId(): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  const activeRunId = getInitialActiveRunId();
  if (activeRunId) {
    return activeRunId;
  }
  const storedRunId = window.localStorage.getItem(selectedRunStorageKey)?.trim();
  return storedRunId ? storedRunId : null;
}

function getInitialPage(): AppPage {
  if (typeof window === "undefined") {
    return "studio";
  }

  if (getInitialActiveRunId()) {
    return "studio";
  }

  const hash = window.location.hash.replace(/^#/, "").trim().toLowerCase();
  if (hash === "history" || hash === "tools" || hash === "studio") {
    return hash as AppPage;
  }
  return "studio";
}

function isRunningStatus(status: string): boolean {
  return status === "queued" || status === "running";
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

function mergePromptScenario(prompt: string, scenario: string): string {
  const scenarioPrefix = "请用这组输入重新解释算法边界条件：";
  const lines = prompt
    .split("\n")
    .filter((line) => !line.trim().startsWith(scenarioPrefix));
  const trimmed = lines.join("\n").trim();
  if (!trimmed) {
    return scenario;
  }
  return `${trimmed}\n\n${scenario}`.trim();
}

function resolveFreshPrompt(
  deckMode: DeckMode,
  selectedDomain: TopicDomain | null,
): string {
  if (deckMode === "expert" && selectedDomain) {
    return domainPresets[selectedDomain] ?? defaultPrompt;
  }
  return defaultPrompt;
}

export default function App() {
  const [prompt, setPrompt] = useState(defaultPrompt);
  const [deckMode, setDeckMode] = useState<DeckMode>("smart");
  const [selectedDomain, setSelectedDomain] = useState<TopicDomain | null>(null);
  const [sourceCode, setSourceCode] = useState("");
  const [sourceCodeLanguage, setSourceCodeLanguage] = useState("");
  const [sandboxMode, setSandboxMode] = useState<SandboxMode>("dry_run");
  const [enableNarration, setEnableNarration] = useState(true);
  const [sourceImage, setSourceImage] = useState<string | null>(null);
  const [sourceImageName, setSourceImageName] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PipelineResponse | null>(null);
  const { runtimeCatalog, routerProvider, setRouterProvider, generationProvider, setGenerationProvider, refreshRuntimeCatalog } = useRuntimeCatalog();
  const { runs, setRuns, historyError, setHistoryError, loadRuns } = useHistoryRuns();
  const [selectedRunId, setSelectedRunId] = useState<string | null>(getInitialSelectedRunId);
  const { theme, setTheme } = useTheme();
  const glowRef = useMouseGlow();
  const [activeRunId, setActiveRunId] = useState<string | null>(getInitialActiveRunId);
  const [debugToolsOpen, setDebugToolsOpen] = useState(false);
  const [activePage, setActivePage] = useState<AppPage>(getInitialPage);
  const [editorDirty, setEditorDirty] = useState(false);

  const activeSkill = result?.runtime.skill ?? null;
  const previewVideoUrl = resolvePreviewVideoUrl(result?.preview_video_url);
  const routerProviderSupportsVision = activeProviderSupportsVision(
    runtimeCatalog,
    routerProvider,
  );
  const generationProviderSupportsVision = activeProviderSupportsVision(
    runtimeCatalog,
    generationProvider,
  );
  const editorName = resolveSourceEditorName(sourceCode, sourceCodeLanguage);
  const sourcePreviewLanguage =
    sourceCodeLanguage === "cpp"
      ? "cpp"
      : sourceCodeLanguage === "python"
        ? "python"
        : undefined;
  const hasCompletedPreview = Boolean(previewVideoUrl);
  const showSourcePanel = sourceCode.trim().length > 0;
  const hasInteractiveExplorer = Boolean(
    previewVideoUrl
      && result?.execution_map
      && result.execution_map.checkpoints.length > 0
      && showSourcePanel,
  );
  const selectedHistoryRun =
    runs.find((run) => run.request_id === selectedRunId) ?? null;
  const selectedDomainLabel = selectedDomain ? domainLabels[selectedDomain] : "自动路由";
  const selectedPresentation = getDomainPresentation(selectedDomain);
  const selectedMetrics = selectedPresentation?.metrics ?? [
    {
      label: "输入方式",
      value: "题目 / 源码 / 题图",
      description: "一个主入口统一组织问题、源码与题图。",
    },
    {
      label: "输出目标",
      value: "教学视频",
      description: "生成讲解结构、脚本和可直接预览的动画结果。",
    },
  ];


  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    if (activeRunId) {
      window.localStorage.setItem(activeRunStorageKey, activeRunId);
      return;
    }
    window.localStorage.removeItem(activeRunStorageKey);
  }, [activeRunId]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    if (selectedRunId) {
      window.localStorage.setItem(selectedRunStorageKey, selectedRunId);
      return;
    }
    window.localStorage.removeItem(selectedRunStorageKey);
  }, [selectedRunId]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const targetHash = `#${activePage}`;
    if (window.location.hash !== targetHash) {
      window.history.replaceState(null, "", targetHash);
    }
  }, [activePage]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    function handleHashChange() {
      const nextPage = getInitialPage();
      setActivePage(nextPage);
    }

    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  useEffect(() => {
    if (deckMode === "expert" || runtimeCatalog.skills.length === 0 || selectedDomain) {
      return;
    }
    startTransition(() => {
      setSelectedDomain(runtimeCatalog.skills[0]?.domain ?? null);
    });
  }, [deckMode, runtimeCatalog.skills, selectedDomain]);

  function syncRunIntoEditor(run: PipelineRunDetail) {
    setPrompt(run.request.prompt);
    setSourceCode(run.request.source_code ?? "");
    setSourceCodeLanguage(run.request.source_code_language ?? "");
    setRouterProvider(
      resolveConfiguredProvider(
        runtimeCatalog,
        run.request.router_provider ?? run.response?.runtime.router_provider?.name,
        runtimeCatalog.default_router_provider,
      ),
    );
    setGenerationProvider(
      resolveConfiguredProvider(
        runtimeCatalog,
        run.request.generation_provider ??
          run.request.provider ??
          run.response?.runtime.generation_provider?.name ??
          run.response?.runtime.provider?.name,
        runtimeCatalog.default_generation_provider,
      ),
    );
    setSandboxMode(run.request.sandbox_mode);
    setSourceImage(run.request.source_image ?? null);
    setSourceImageName(run.request.source_image_name ?? null);
    setEnableNarration(run.request.enable_narration ?? true);
    setDeckMode(run.request.domain ? "expert" : "smart");
    setSelectedDomain(run.response?.runtime.skill.domain ?? run.request.domain ?? null);
    setEditorDirty(false);
  }

  function syncRunSummary(run: PipelineRunDetail, requestId: string) {
    startTransition(() => {
      setRuns((current) =>
        current.map((item) =>
          item.request_id === requestId
            ? {
                ...item,
                status: run.status,
                updated_at: run.updated_at,
                title: run.response?.cir.title ?? item.title,
                domain: run.response?.runtime.skill.domain ?? run.request.domain ?? item.domain,
                sandbox_status:
                  run.response?.runtime.sandbox.status ??
                  (run.status === "failed" ? null : item.sandbox_status),
                error_message: run.error_message ?? null,
              }
            : item,
        ),
      );
    });
  }

  const syncPolledRun = useEffectEvent(async (requestId: string) => {
    const run = await getPipelineRun(requestId, {
      includeRawOutput: debugToolsOpen,
    });
    if (selectedRunId !== requestId) {
      startTransition(() => {
        setSelectedRunId(requestId);
      });
    }
    const shouldSyncViewedRun =
      selectedRunId === requestId ||
      activeRunId === requestId ||
      (selectedRunId === null && activePage === "studio");

    if (shouldSyncViewedRun && !editorDirty && !result) {
      startTransition(() => {
        syncRunIntoEditor(run);
      });
    }
    syncRunSummary(run, requestId);

    if (run.status === "succeeded" && run.response) {
      const response = run.response;
      if (shouldSyncViewedRun) {
        startTransition(() => {
          setResult(response);
        });
        setLoading(false);
        setError(null);
      }
      setActiveRunId((current) => (current === requestId ? null : current));
      await loadRuns();
      return true;
    }

    if (run.status === "failed") {
      if (shouldSyncViewedRun) {
        setResult(null);
        setLoading(false);
        setError(run.error_message ?? "请求失败");
      }
      setActiveRunId((current) => (current === requestId ? null : current));
      await loadRuns();
      return true;
    }

    if (shouldSyncViewedRun) {
      setResult(null);
      setLoading(true);
      setError(null);
    }
    return false;
  });

  useEffect(() => {
    if (!activeRunId) {
      return;
    }

    let cancelled = false;
    let timer: number | undefined;
    let consecutiveErrors = 0;

    const poll = async () => {
      try {
        const finished = await syncPolledRun(activeRunId);
        consecutiveErrors = 0;
        if (cancelled || finished) {
          return;
        }
      } catch (pollError) {
        if (cancelled) {
          return;
        }
        const message =
          pollError instanceof Error ? pollError.message : "任务状态刷新失败";
        consecutiveErrors += 1;
        setHistoryError(message);

        if (
          message.includes("Pipeline run not found") ||
          consecutiveErrors >= 3
        ) {
          setLoading(false);
          setError(message);
          setActiveRunId((current) => (current === activeRunId ? null : current));
          return;
        }
      }

      if (cancelled) {
        return;
      }
      timer = window.setTimeout(() => {
        void poll();
      }, 2000);
    };

    void poll();

    return () => {
      cancelled = true;
      if (timer) {
        window.clearTimeout(timer);
      }
    };
  }, [activeRunId]);

  function handleSourceImageChange(value: string | null, name: string | null) {
    setEditorDirty(true);
    setSourceImage(value);
    setSourceImageName(name);
  }

  function handlePromptChange(value: string) {
    setEditorDirty(true);
    setPrompt(value);
  }

  function handleSourceCodeChange(value: string) {
    setEditorDirty(true);
    setSourceCode(value);
  }

  function handleSourceCodeLanguageChange(value: string) {
    setEditorDirty(true);
    setSourceCodeLanguage(value);
  }

  function handleRouterProviderChange(value: ModelProvider) {
    setEditorDirty(true);
    setRouterProvider(value);
  }

  function handleGenerationProviderChange(value: ModelProvider) {
    setEditorDirty(true);
    setGenerationProvider(value);
  }

  function handleSandboxModeChange(value: SandboxMode) {
    setEditorDirty(true);
    setSandboxMode(value);
  }

  function handleEnableNarrationChange(value: boolean) {
    setEditorDirty(true);
    setEnableNarration(value);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);
    setEditorDirty(false);
        
    try {
      const submittedRun = await submitPipeline(
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
        setSelectedRunId(submittedRun.request_id);
      });
      setActivePage("studio");
      setActiveRunId(submittedRun.request_id);
      await loadRuns();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "请求失败");
      setLoading(false);
    }
  }

  async function handleSelectRun(requestId: string) {
    try {
      startTransition(() => {
        setHistoryError(null);
        setSelectedRunId(requestId);
      });
      // Reset video-code sync state when switching runs
            
      const run = await getPipelineRun(requestId, {
        includeRawOutput: debugToolsOpen,
      });
      startTransition(() => {
        syncRunIntoEditor(run);
        setResult(run.status === "succeeded" ? (run.response ?? null) : null);
      });
      syncRunSummary(run, requestId);
      if (isRunningStatus(run.status)) {
        setLoading(true);
        setError(null);
        setActivePage("studio");
        setSelectedRunId(requestId);
        setActiveRunId(requestId);
      } else {
        setLoading(false);
        setActiveRunId((current) => (current === requestId ? null : current));
        setError(run.status === "failed" ? (run.error_message ?? "任务详情加载失败") : null);
      }
    } catch (loadError) {
      setHistoryError(loadError instanceof Error ? loadError.message : "任务详情加载失败");
    }
  }

  useEffect(() => {
    if (!debugToolsOpen || !selectedRunId || !result) {
      return;
    }
    if (result.runtime.agent_traces.some((trace) => Boolean(trace.raw_output))) {
      return;
    }

    let active = true;
    void getPipelineRun(selectedRunId, { includeRawOutput: true })
      .then((run) => {
        if (!active || run.status !== "succeeded" || !run.response) {
          return;
        }
        startTransition(() => {
          setResult(run.response ?? null);
        });
      })
      .catch(() => {
        // Keep the lightweight result if debug hydration fails.
      });

    return () => {
      active = false;
    };
  }, [debugToolsOpen, result, selectedRunId]);

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
    setEditorDirty(true);
    setSelectedDomain(domain);
    setPrompt(domainPresets[domain] ?? defaultPrompt);
    if (domain === "code" && !sourceCodeLanguage) {
      setSourceCodeLanguage("python");
    }
  }

  function handleSetDeckMode(mode: DeckMode) {
    setEditorDirty(true);
    setDeckMode(mode);
    if (mode === "expert" && !selectedDomain) {
      setSelectedDomain(runtimeCatalog.skills[0]?.domain ?? null);
    }
  }

  function handleStartNewConversation() {
    startTransition(() => {
      setActivePage("studio");
      setSelectedRunId(null);
    });
    setPrompt(resolveFreshPrompt(deckMode, selectedDomain));
    setSourceCode("");
    setSourceImage(null);
    setSourceImageName(null);
    setResult(null);
    setError(null);
    setLoading(false);
    setHistoryError(null);
    setActiveRunId(null);
    setEditorDirty(false);
            setDebugToolsOpen(false);
  }

  return (
    <div className="app-shell">
      {/* Top Navigation Bar - Full Width */}
      <header className="topbar">
        <div className="topbar-brand" style={{ width: '256px' }}></div>
        <div className="topbar-actions">
          <button
            type="button"
            className="topbar-icon-btn"
            onClick={() => setTheme((current) => (current === "dark" ? "light" : "dark"))}
            title={theme === "dark" ? "切换到浅色模式" : "切换到深色模式"}
          >
            <span className="material-symbols-outlined">
              {theme === "dark" ? "light_mode" : "dark_mode"}
            </span>
          </button>
          <div className="topbar-avatar">MV</div>
        </div>
      </header>

      {/* Side Navigation Bar - Below Topbar */}
      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="topbar-brand" style={{ padding: 0 }}>
            <span className="topbar-neon-strip" />
            <div className="brand-text-group">
              <span className="topbar-brand-text">MetaView</span>
              <span className="topbar-brand-subtitle">THEORETICAL CANVAS</span>
            </div>
          </div>
        </div>

        <nav className="sidebar-nav">
          <button
            type="button"
            className={`sidebar-nav-item ${activePage === "studio" ? "is-active" : ""}`}
            onClick={() => setActivePage("studio")}
          >
            <span className="material-symbols-outlined">dashboard</span>
            工作台
          </button>
          <button
            type="button"
            className={`sidebar-nav-item ${activePage === "history" ? "is-active" : ""}`}
            onClick={() => setActivePage("history")}
          >
            <span className="material-symbols-outlined">inventory_2</span>
            任务历史
          </button>
          <button
            type="button"
            className={`sidebar-nav-item ${activePage === "tools" ? "is-active" : ""}`}
            onClick={() => setActivePage("tools")}
          >
            <span className="material-symbols-outlined">analytics</span>
            工具
          </button>
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-status">
            <span className="sidebar-status-dot" />
            <span className="sidebar-status-text">Core Nodes Online</span>
          </div>
          <div className="sidebar-progress">
            <div className="sidebar-progress-bar" style={{ width: "88%" }} />
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="main-content" ref={glowRef}>
        <div className="page-container">
          {/* Studio Page */}
          {activePage === "studio" ? (
            <StudioPage
              deckMode={deckMode}
              selectedDomain={selectedDomain}
              prompt={prompt}
              sourceImage={sourceImage}
              sourceCode={sourceCode}
              sourceCodeLanguage={sourceCodeLanguage}
              routerProvider={routerProvider}
              generationProvider={generationProvider}
              sandboxMode={sandboxMode}
              enableNarration={enableNarration}
              runtimeCatalog={runtimeCatalog}
              loading={loading}
              error={error}
              sourceImageName={sourceImageName}
              routerProviderSupportsVision={routerProviderSupportsVision}
              generationProviderSupportsVision={generationProviderSupportsVision}
              hasCompletedPreview={hasCompletedPreview}
              showSourcePanel={showSourcePanel}
              hasInteractiveExplorer={hasInteractiveExplorer}
              previewVideoUrl={previewVideoUrl}
              editorName={editorName}
              sourcePreviewLanguage={sourcePreviewLanguage}
              result={result}
              selectedDomainLabel={selectedDomainLabel}
              selectedMetrics={selectedMetrics}
              selectedPresentation={selectedPresentation}
              shouldEmphasizeSourceLine={shouldEmphasizeSourceLine}
              mergePromptScenario={mergePromptScenario}
              
              onDeckModeChange={handleSetDeckMode}
              onSelectDomain={handleSelectDomain}
              onPromptChange={handlePromptChange}
              onSourceCodeChange={handleSourceCodeChange}
              onSourceCodeLanguageChange={handleSourceCodeLanguageChange}
              onRouterProviderChange={handleRouterProviderChange}
              onGenerationProviderChange={handleGenerationProviderChange}
              onSandboxModeChange={handleSandboxModeChange}
              onEnableNarrationChange={handleEnableNarrationChange}
              onSourceImageChange={handleSourceImageChange}
              onStartNewQuestion={handleStartNewConversation}
              onSubmit={handleSubmit}
              setEditorDirty={setEditorDirty}
              setPrompt={setPrompt}
            />
          ) : null}

          {/* History Page */}
          {activePage === "history" ? (
            <HistoryPage
              historyError={historyError}
              runs={runs}
              selectedRunId={selectedRunId}
              result={result}
              selectedHistoryRun={selectedHistoryRun}
              previewVideoUrl={previewVideoUrl}
              loading={loading}
              
              onSelectRun={handleSelectRun}
              onOpenInStudio={() => setActivePage("studio")}
              isRunningStatus={isRunningStatus}
            />
          ) : null}

          {/* Tools Page */}
          {activePage === "tools" ? (
            <ToolsPage
              debugToolsOpen={debugToolsOpen}
              setDebugToolsOpen={setDebugToolsOpen}
              result={result}
              runtimeCatalog={runtimeCatalog}
              activeSkill={activeSkill}
              
              handleExportCurrent={handleExportCurrent}
              handleCreateProvider={handleCreateProvider}
              handleDeleteProvider={handleDeleteProvider}
              handleUpdateRuntimeSettings={handleUpdateRuntimeSettings}
            />
          ) : null}

      </div>
      </main>

      {/* Mobile Bottom Navigation */}
      <nav className="mobile-nav">
          <button
            type="button"
            className={`mobile-nav-item ${activePage === "studio" ? "is-active" : ""}`}
            onClick={() => setActivePage("studio")}
          >
            <span className="material-symbols-outlined">workspaces</span>
            工作台
          </button>
          <button
            type="button"
            className={`mobile-nav-item ${activePage === "history" ? "is-active" : ""}`}
            onClick={() => setActivePage("history")}
          >
            <span className="material-symbols-outlined">history</span>
            历史
          </button>
          <button
            type="button"
            className={`mobile-nav-item ${activePage === "tools" ? "is-active" : ""}`}
            onClick={() => setActivePage("tools")}
          >
            <span className="material-symbols-outlined">extension</span>
            工具
          </button>
        </nav>
    </div>
  );
}
