import { startTransition, useEffect, useEffectEvent, useRef, useState } from "react";
import type { FormEvent } from "react";
// 1. 导入魔法光标组件
import { MagicCursor } from './components/MagicCursor';
import {
  deleteCustomProvider,
  getPipelineRun,
  getPipelineRuns,
  getRuntimeCatalog,
  submitPipeline,
  updateRuntimeSettings,
  upsertCustomProvider,
} from "./api/client";
import { CodeAdapterPanel } from "./components/CodeAdapterPanel";
import { ControlPanel } from "./components/ControlPanel";
import { HighlightedCode } from "./components/HighlightedCode";
import { PromptReferenceTool } from "./components/PromptReferenceTool";
import { TTSSettingsPanel } from "./components/TTSSettingsPanel";
import { InteractiveExecutionExplorer } from "./components/InteractiveExecutionExplorer";
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
  PipelineRunDetail,
  PipelineRunSummary,
  PipelineRunStatus,
  RuntimeCatalog,
  SandboxMode,
  SkillDescriptor,
  TopicDomain,
} from "./types";

const defaultPrompt = "输入一个题目、源码或题图，生成对应的 Manim 讲解动画视频。";
const themeStorageKey = "metaview-theme";
const activeRunStorageKey = "metaview-active-run-id";
const selectedRunStorageKey = "metaview-selected-run-id";

type ThemeMode = "dark" | "light";
type DeckMode = "smart" | "expert";
type AppPage = "studio" | "history" | "tools";

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
      api_key_configured: false,
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
    return hash;
  }
  return "studio";
}

function isRunningStatus(status: PipelineRunStatus): boolean {
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
  const [selectedRunId, setSelectedRunId] = useState<string | null>(getInitialSelectedRunId);
  const [theme, setTheme] = useState<ThemeMode>(getInitialTheme);
  const [activeRunId, setActiveRunId] = useState<string | null>(getInitialActiveRunId);
  const [debugToolsOpen, setDebugToolsOpen] = useState(false);
  const [activePage, setActivePage] = useState<AppPage>(getInitialPage);
  const [editorDirty, setEditorDirty] = useState(false);
  const [activeStepIndex, setActiveStepIndex] = useState<number | null>(null);
  const [seekToTime, setSeekToTime] = useState<number | null>(null);

  const lastVideoUpdateTimeRef = useRef<number>(0);

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
  const hasInteractiveExplorer = Boolean(
    previewVideoUrl
    && result?.execution_map
    && result.execution_map.checkpoints.length > 0
    && showSourcePanel,
  );
  const selectedHistoryRun =
    runs.find((run) => run.request_id === selectedRunId) ?? null;

  const stepTiming = result?.step_timing ?? [];
  const handleVideoTimeUpdate = (currentTime: number) => {
    if (stepTiming.length === 0) return;
    const now = Date.now();
    const throttleMs = typeof window !== "undefined" && window.matchMedia("(max-width: 760px)").matches ? 66 : 33;
    if (now - lastVideoUpdateTimeRef.current < throttleMs) return;
    lastVideoUpdateTimeRef.current = now;
    for (let i = 0; i < stepTiming.length; i++) {
      const step = stepTiming[i];
      if (currentTime >= step.start_time && currentTime < step.end_time) {
        if (activeStepIndex !== i) setActiveStepIndex(i);
        return;
      }
    }
    if (activeStepIndex !== null) setActiveStepIndex(null);
  };

  const handleSourceLineClick = (lineIndex: number) => {
    const lineNumber = lineIndex + 1;
    const match = stepTiming.find(
      (s) => s.start_line != null && s.end_line != null
        && lineNumber >= s.start_line && lineNumber <= s.end_line,
    );
    if (match) {
      setSeekToTime(match.start_time);
      setTimeout(() => setSeekToTime(null), 100);
    }
  };

  const highlightedSourceLines =
    activeStepIndex !== null && stepTiming[activeStepIndex]
    && stepTiming[activeStepIndex].start_line != null
    && stepTiming[activeStepIndex].end_line != null
      ? Array.from(
        { length: stepTiming[activeStepIndex].end_line! - stepTiming[activeStepIndex].start_line! + 1 },
        (_, i) => stepTiming[activeStepIndex].start_line! + i - 1,
      )
      : [];

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.classList.toggle("dark", theme === "dark");
    window.localStorage.setItem(themeStorageKey, theme);
  }, [theme]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (activeRunId) window.localStorage.setItem(activeRunStorageKey, activeRunId);
    else window.localStorage.removeItem(activeRunStorageKey);
  }, [activeRunId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (selectedRunId) window.localStorage.setItem(selectedRunStorageKey, selectedRunId);
    else window.localStorage.removeItem(selectedRunStorageKey);
  }, [selectedRunId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const targetHash = `#${activePage}`;
    if (window.location.hash !== targetHash) window.history.replaceState(null, "", targetHash);
  }, [activePage]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    function handleHashChange() {
      const nextPage = getInitialPage();
      setActivePage(nextPage);
    }
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  async function refreshRuntimeCatalog(): Promise<RuntimeCatalog> {
    try {
      const catalog = await getRuntimeCatalog();
      setRuntimeCatalog(catalog);
      setRouterProvider((current) => resolveConfiguredProvider(catalog, current, catalog.default_router_provider));
      setGenerationProvider((current) => resolveConfiguredProvider(catalog, current, catalog.default_generation_provider));
      return catalog;
    } catch {
      setRuntimeCatalog(fallbackRuntimeCatalog);
      return fallbackRuntimeCatalog;
    }
  }

  async function loadRuns(): Promise<PipelineRunSummary[]> {
    try {
      const historyRuns = await getPipelineRuns();
      setRuns(historyRuns);
      setHistoryError(null);
      return historyRuns;
    } catch (loadError) {
      setHistoryError(loadError instanceof Error ? loadError.message : "历史记录加载失败");
      return [];
    }
  }

  useEffect(() => {
    let active = true;
    getRuntimeCatalog().then((catalog) => {
      if (!active) return;
      setRuntimeCatalog(catalog);
      setRouterProvider(resolveConfiguredProvider(catalog, catalog.default_router_provider, catalog.default_router_provider));
      setGenerationProvider(resolveConfiguredProvider(catalog, catalog.default_generation_provider, catalog.default_generation_provider));
    }).catch(() => {
      if (active) setRuntimeCatalog(fallbackRuntimeCatalog);
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    getPipelineRuns().then((historyRuns) => {
      if (!active) return;
      startTransition(() => {
        setRuns(historyRuns);
        setHistoryError(null);
      });
    }).catch((loadError) => {
      if (!active) return;
      startTransition(() => {
        setHistoryError(loadError instanceof Error ? loadError.message : "历史记录加载失败");
      });
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (deckMode === "expert" || runtimeCatalog.skills.length === 0 || selectedDomain) return;
    startTransition(() => { setSelectedDomain(runtimeCatalog.skills[0]?.domain ?? null); });
  }, [deckMode, runtimeCatalog.skills, selectedDomain]);

  function syncRunIntoEditor(run: PipelineRunDetail) {
    setPrompt(run.request.prompt);
    setSourceCode(run.request.source_code ?? "");
    setSourceCodeLanguage(run.request.source_code_language ?? "");
    setRouterProvider(resolveConfiguredProvider(runtimeCatalog, run.request.router_provider ?? run.response?.runtime.router_provider?.name, runtimeCatalog.default_router_provider));
    setGenerationProvider(resolveConfiguredProvider(runtimeCatalog, run.request.generation_provider ?? run.request.provider ?? run.response?.runtime.generation_provider?.name ?? run.response?.runtime.provider?.name, runtimeCatalog.default_generation_provider));
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
      setRuns((current) => current.map((item) => item.request_id === requestId ? {
        ...item,
        status: run.status,
        updated_at: run.updated_at,
        title: run.response?.cir.title ?? item.title,
        domain: run.response?.runtime.skill.domain ?? run.request.domain ?? item.domain,
        sandbox_status: run.response?.runtime.sandbox.status ?? (run.status === "failed" ? null : item.sandbox_status),
        error_message: run.error_message ?? null,
      } : item));
    });
  }

  const syncPolledRun = useEffectEvent(async (requestId: string) => {
    const run = await getPipelineRun(requestId, { includeRawOutput: debugToolsOpen });
    if (selectedRunId !== requestId) startTransition(() => { setSelectedRunId(requestId); });
    const shouldSyncViewedRun = selectedRunId === requestId || activeRunId === requestId || (selectedRunId === null && activePage === "studio");
    if (shouldSyncViewedRun && !editorDirty && !result) startTransition(() => { syncRunIntoEditor(run); });
    syncRunSummary(run, requestId);
    if (run.status === "succeeded" && run.response) {
      if (shouldSyncViewedRun) startTransition(() => { setResult(run.response!); });
      setActiveRunId((current) => (current === requestId ? null : current));
      await loadRuns();
      return true;
    }
    if (run.status === "failed") {
      if (shouldSyncViewedRun) { setResult(null); setLoading(false); setError(run.error_message ?? "请求失败"); }
      setActiveRunId((current) => (current === requestId ? null : current));
      await loadRuns();
      return true;
    }
    if (shouldSyncViewedRun) { setResult(null); setLoading(true); setError(null); }
    return false;
  });

  useEffect(() => {
    if (!activeRunId) return;
    let cancelled = false; let timer: number | undefined; let consecutiveErrors = 0;
    const poll = async () => {
      try { const finished = await syncPolledRun(activeRunId); consecutiveErrors = 0; if (cancelled || finished) return; }
      catch (pollError) {
        if (cancelled) return;
        const message = pollError instanceof Error ? pollError.message : "任务状态刷新失败";
        consecutiveErrors += 1; setHistoryError(message);
        if (message.includes("Pipeline run not found") || consecutiveErrors >= 3) {
          setLoading(false); setError(message); setActiveRunId((current) => (current === activeRunId ? null : current)); return;
        }
      }
      if (cancelled) return;
      timer = window.setTimeout(() => { void poll(); }, 2000);
    };
    void poll();
    return () => { cancelled = true; if (timer) window.clearTimeout(timer); };
  }, [activeRunId]);

  function handleSourceImageChange(value: string | null, name: string | null) { setEditorDirty(true); setSourceImage(value); setSourceImageName(name); }
  function handlePromptChange(value: string) { setEditorDirty(true); setPrompt(value); }
  function handleSourceCodeChange(value: string) { setEditorDirty(true); setSourceCode(value); }
  function handleSourceCodeLanguageChange(value: string) { setEditorDirty(true); setSourceCodeLanguage(value); }
  function handleRouterProviderChange(value: ModelProvider) { setEditorDirty(true); setRouterProvider(value); }
  function handleGenerationProviderChange(value: ModelProvider) { setEditorDirty(true); setGenerationProvider(value); }
  function handleSandboxModeChange(value: SandboxMode) { setEditorDirty(true); setSandboxMode(value); }
  function handleEnableNarrationChange(value: boolean) { setEditorDirty(true); setEnableNarration(value); }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setLoading(true); setError(null); setResult(null); setEditorDirty(false); setActiveStepIndex(null); setSeekToTime(null);
    try {
      const submittedRun = await submitPipeline(prompt, routerProvider, generationProvider, sandboxMode, deckMode === "expert" ? selectedDomain : null, sourceCode, sourceCodeLanguage || null, sourceImage, sourceImageName, theme, enableNarration);
      startTransition(() => { setSelectedRunId(submittedRun.request_id); });
      setActivePage("studio"); setActiveRunId(submittedRun.request_id); await loadRuns();
    } catch (submitError) { setError(submitError instanceof Error ? submitError.message : "请求失败"); setLoading(false); }
  }

  async function handleSelectRun(requestId: string) {
    try {
      startTransition(() => { setHistoryError(null); setSelectedRunId(requestId); });
      setActiveStepIndex(null); setSeekToTime(null);
      const run = await getPipelineRun(requestId, { includeRawOutput: debugToolsOpen });
      startTransition(() => { syncRunIntoEditor(run); setResult(run.status === "succeeded" ? (run.response ?? null) : null); });
      syncRunSummary(run, requestId);
      if (isRunningStatus(run.status)) { setLoading(true); setError(null); setActivePage("studio"); setSelectedRunId(requestId); setActiveRunId(requestId); }
      else { setLoading(false); setActiveRunId((current) => (current === requestId ? null : current)); setError(run.status === "failed" ? (run.error_message ?? "任务详情加载失败") : null); }
    } catch (loadError) { setHistoryError(loadError instanceof Error ? loadError.message : "任务详情加载失败"); }
  }

  useEffect(() => {
    if (!debugToolsOpen || !selectedRunId || !result) return;
    if (result.runtime.agent_traces.some((trace) => Boolean(trace.raw_output))) return;
    let active = true;
    void getPipelineRun(selectedRunId, { includeRawOutput: true }).then((run) => {
      if (!active || run.status !== "succeeded" || !run.response) return;
      startTransition(() => { setResult(run.response ?? null); });
    }).catch(() => {});
    return () => { active = false; };
  }, [debugToolsOpen, result, selectedRunId]);

  function handleExportCurrent() {
    if (!result) return;
    const exportedPayload = { exported_at: new Date().toISOString(), request: { prompt, source_code: sourceCode || null, source_code_language: sourceCodeLanguage || null, provider: generationProvider, router_provider: routerProvider, generation_provider: generationProvider, source_image_name: sourceImageName, enable_narration: enableNarration, sandbox_mode: sandboxMode }, response: result };
    const blob = new Blob([JSON.stringify(exportedPayload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob); const link = document.createElement("a");
    link.href = url; link.download = `${result.request_id}.json`; link.click(); URL.revokeObjectURL(url);
  }

  async function handleCreateProvider(payload: CustomProviderUpsertRequest) {
    await upsertCustomProvider(payload); const catalog = await refreshRuntimeCatalog();
    const providerExistsAndIsConfigured = catalog.providers.some((candidate) => candidate.name === payload.name && candidate.configured);
    setGenerationProvider(providerExistsAndIsConfigured ? payload.name : catalog.default_generation_provider);
  }

  async function handleDeleteProvider(name: string) {
    await deleteCustomProvider(name); const catalog = await refreshRuntimeCatalog();
    if (routerProvider === name) setRouterProvider(catalog.default_router_provider);
    if (generationProvider === name) setGenerationProvider(catalog.default_generation_provider);
  }

  async function handleUpdateRuntimeSettings(payload: any) { await updateRuntimeSettings(payload); await refreshRuntimeCatalog(); }

  function handleSelectDomain(domain: TopicDomain) { setEditorDirty(true); setSelectedDomain(domain); setPrompt(domainPresets[domain] ?? defaultPrompt); if (domain === "code" && !sourceCodeLanguage) setSourceCodeLanguage("python"); }

  function handleSetDeckMode(mode: DeckMode) { setEditorDirty(true); setDeckMode(mode); if (mode === "expert" && !selectedDomain) setSelectedDomain(runtimeCatalog.skills[0]?.domain ?? null); }

  function handleStartNewConversation() {
    startTransition(() => { setActivePage("studio"); setSelectedRunId(null); });
    setPrompt(resolveFreshPrompt(deckMode, selectedDomain)); setSourceCode(""); setSourceImage(null); setSourceImageName(null); setResult(null); setError(null); setLoading(false); setHistoryError(null); setActiveRunId(null); setEditorDirty(false); setActiveStepIndex(null); setSeekToTime(null); setDebugToolsOpen(false);
  }

  return (
    <div className="theory-shell" style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg)' }}>
      {/* 1. 全局魔法光标 */}
      <MagicCursor />

      {/* 2. 侧边栏结构 - 彻底修复导航错位 */}
      <aside className="left-sidebar" style={{
        position: 'fixed', top: 0, left: 0, bottom: 0, width: '260px',
        padding: '32px 24px', borderRight: '1px solid var(--panel-border)',
        display: 'flex', flexDirection: 'column', zIndex: 100,
        background: 'var(--surface)', boxShadow: '0 4px 20px rgba(0,0,0,0.1)'
      }}>
        {/* Logo */}
        <div className="brand-block" style={{ marginBottom: '48px', display: 'flex', alignItems: 'center', gap: '14px' }}>
          <span className="brand-mark" style={{ width: '10px', height: '32px', borderRadius: '99px', background: 'var(--primary)' }} />
          <div>
            <strong style={{ display: 'block', fontSize: '1.25rem', fontFamily: 'var(--headline)', fontWeight: 800 }}>MetaView</strong>
            <small style={{ color: 'var(--text-muted)', fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase' }}>Theoretical Canvas</small>
          </div>
        </div>

        {/* 垂直导航菜单 */}
        <nav className="sidebar-nav" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {[
            { id: 'studio', label: 'Studio' },
            { id: 'history', label: 'History' },
            { id: 'tools', label: 'Tools' }
          ].map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setActivePage(item.id as AppPage)}
              style={{
                textAlign: 'left', padding: '12px 16px', borderRadius: '10px', border: 'none',
                background: activePage === item.id ? 'var(--primary)' : 'transparent',
                color: activePage === item.id ? '#050505' : 'var(--text-muted)',
                fontFamily: 'var(--headline)', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer', transition: 'all 0.2s'
              }}
            >
              {item.label}
            </button>
          ))}
        </nav>

        {/* 高级设置面板 - 移至侧边栏底部 */}
        <div className="sidebar-footer" style={{ marginTop: 'auto', paddingTop: '20px' }}>
          <details className="panel-advanced" style={{ border: 'none', background: 'transparent', padding: 0 }}>
            <summary className="advanced-summary" style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>高级设置</summary>
            <div className="prompt-form-advanced" style={{
              display: 'grid', gap: '12px', padding: '16px', marginTop: '12px',
              borderRadius: '12px', background: 'var(--surface-high)', border: '1px solid var(--panel-border)'
            }}>
              <label style={{ display: 'grid', gap: '6px' }}>
                <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)' }}>配音</span>
                <button type="button" className={`switch-button ${enableNarration ? "is-active" : ""}`} onClick={() => setEnableNarration(!enableNarration)} style={{ height: '32px' }}>
                  <strong>{enableNarration ? "开启" : "关闭"}</strong>
                </button>
              </label>
              <label style={{ display: 'grid', gap: '6px' }}>
                <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)' }}>路由模型</span>
                <select value={routerProvider} onChange={(e) => setRouterProvider(e.target.value as ModelProvider)} style={{ fontSize: '12px', padding: '6px', borderRadius: '6px', background: 'var(--bg)', color: 'var(--text)', border: '1px solid var(--panel-border)' }}>
                  {runtimeCatalog.providers.map(p => <option key={p.name} value={p.name}>{p.label}</option>)}
                </select>
              </label>
            </div>
          </details>
        </div>
      </aside>

      {/* 3. 顶栏 - 仅动作按钮 */}
      <header className="topbar" style={{
        position: 'fixed', top: 0, left: '260px', right: 0, height: '72px',
        display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
        padding: '0 32px', zIndex: 90, background: 'rgba(5,5,5,0.5)', backdropFilter: 'blur(12px)',
        borderBottom: '1px solid var(--panel-border)'
      }}>
        <div className="topbar-actions" style={{ display: 'flex', gap: '12px' }}>
          <button type="button" className="topbar-secondary-button" onClick={handleStartNewConversation}>新对话</button>
          <button type="button" className="theme-toggle" onClick={() => {
            if (!(document as any).startViewTransition) { setTheme(t => t === "dark" ? "light" : "dark"); return; }
            (document as any).startViewTransition(() => setTheme(t => t === "dark" ? "light" : "dark"));
          }}>
            {theme === "dark" ? "Light Mode" : "Dark Mode"}
          </button>
        </div>
      </header>

      {/* 4. 工作区容器 */}
      <div className="workspace" style={{ marginLeft: '260px', width: 'calc(100% - 260px)', flex: 1 }}>
        <main className="canvas" style={{ padding: '100px 40px 40px' }}>
          {activePage === "studio" && (
            <section className={`studio-layout ${hasCompletedPreview ? "is-resolved" : "hero-shell"}`}>
              <div className="hero-glow" />
              <div className="studio-column">
                <ControlPanel
                  deckMode={deckMode} layoutMode={hasCompletedPreview ? "split" : "hero"}
                  selectedDomain={selectedDomain} prompt={prompt} sourceImage={sourceImage}
                  sourceCode={sourceCode} sourceCodeLanguage={sourceCodeLanguage}
                  routerProvider={routerProvider} generationProvider={generationProvider}
                  sandboxMode={sandboxMode} enableNarration={enableNarration}
                  skills={runtimeCatalog.skills} providers={runtimeCatalog.providers}
                  sandboxModes={runtimeCatalog.sandbox_modes} loading={loading}
                  sourceImageName={sourceImageName} routerProviderSupportsVision={routerProviderSupportsVision}
                  generationProviderSupportsVision={generationProviderSupportsVision}
                  onDeckModeChange={handleSetDeckMode} onSelectDomain={handleSelectDomain}
                  onPromptChange={handlePromptChange} onSourceCodeChange={handleSourceCodeChange}
                  onSourceCodeLanguageChange={handleSourceCodeLanguageChange}
                  onRouterProviderChange={handleRouterProviderChange} onGenerationProviderChange={handleGenerationProviderChange}
                  onSandboxModeChange={handleSandboxModeChange} onEnableNarrationChange={handleEnableNarrationChange}
                  onSourceImageChange={handleSourceImageChange} onStartNewQuestion={handleStartNewConversation}
                  onSubmit={handleSubmit}
                />
                {hasCompletedPreview && showSourcePanel && !hasInteractiveExplorer && (
                  <section className="panel source-panel studio-source-panel">
                    <div className="panel-header">
                      <span className="panel-kicker">Source</span>
                      <h3 style={{ fontSize: '1.25rem', marginTop: '4px' }}>算法源码</h3>
                      <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>这里只高亮 Python / C++ 源码。</p>
                    </div>
                    {activeStepIndex !== null && stepTiming[activeStepIndex] && (
                      <div className="execution-code-summary" style={{ padding: '12px', margin: '12px 0', borderRadius: '8px', background: 'var(--surface-high)' }}>
                        <strong style={{ fontSize: '0.9rem', color: 'var(--primary)' }}>步骤 {activeStepIndex + 1}</strong>
                        <p style={{ fontSize: '0.8rem', margin: 0 }}>对应源码第 {stepTiming[activeStepIndex].start_line} - {stepTiming[activeStepIndex].end_line} 行</p>
                      </div>
                    )}
                    <div className="console-content source-console">
                      <HighlightedCode code={sourceCode} language={sourcePreviewLanguage} maxLines={24} emphasizeLine={shouldEmphasizeSourceLine} highlightedLines={highlightedSourceLines} onLineClick={handleSourceLineClick} />
                    </div>
                  </section>
                )}
              </div>
              {hasCompletedPreview && (
                hasInteractiveExplorer && result?.execution_map ? (
                  <section className="panel stage-panel interactive-explorer-panel">
                    <InteractiveExecutionExplorer key={result.request_id} videoSrc={previewVideoUrl!} videoTitle="当前渲染视频" videoMeta={result ? `${result.request_id.slice(0, 8)} · ${result.runtime.generation_provider?.label ?? generationProvider}` : undefined} downloadName={result ? `${result.request_id}.mp4` : "metaview-preview.mp4"} sourceCode={sourceCode} sourceLanguage={sourcePreviewLanguage} editorName={editorName} executionMap={result.execution_map} onApplyParameterScenario={(scenario) => { setEditorDirty(true); setPrompt((current) => mergePromptScenario(current, scenario)); }} />
                  </section>
                ) : (
                  <section className="panel stage-panel stage-panel-sticky stage-panel-compact">
                    <VideoPreview src={previewVideoUrl!} title="当前渲染视频" meta={result ? `${result.request_id.slice(0, 8)} · ${result.runtime.generation_provider?.label ?? generationProvider}` : undefined} downloadName={result ? `${result.request_id}.mp4` : "metaview-preview.mp4"} headerless onTimeUpdate={handleVideoTimeUpdate} seekTo={seekToTime} />
                  </section>
                )
              )}
            </section>
          )}

          {activePage === "studio" && !hasCompletedPreview && (showPreviewPanel || showSourcePanel) && (
            <section className={`results-layout ${showDualResults ? "has-source" : ""}`}>
              {showPreviewPanel && (
                <section className="panel stage-panel">
                  <div className="panel-header panel-header-row">
                    <div>
                      <span className="panel-kicker">Result</span>
                      <h3 style={{ fontSize: '1.5rem' }}>{result?.cir.title ?? "正在生成预览"}</h3>
                    </div>
                  </div>
                  {error && <p className="error-text" style={{ color: 'var(--danger)', padding: '12px' }}>{error}</p>}
                  {previewVideoUrl ? (
                    <div className="preview-stage"><VideoPreview src={previewVideoUrl} title="当前渲染视频" meta={result ? `${result.request_id.slice(0, 8)} · ${result.runtime.generation_provider?.label ?? generationProvider}` : undefined} downloadName={result ? `${result.request_id}.mp4` : "metaview-preview.mp4"} /></div>
                  ) : (
                    <div className="preview-stage">
                      <div className={`preview-empty ${loading ? "is-loading" : ""}`}>
                        <strong style={{ fontSize: '1.1rem' }}>{loading ? "正在渲染视频" : "等待下一次渲染"}</strong>
                        <p style={{ fontSize: '0.9rem' }}>{loading ? "后端正在进行镜头规划和脚本生成。" : "提交题目后，这里会显示 MP4 预览。"}</p>
                      </div>
                    </div>
                  )}
                </section>
              )}
              {showSourcePanel && (
                <section className="panel source-panel">
                  <div className="panel-header"><span className="panel-kicker">Source</span><h3>算法源码</h3></div>
                  <div className="console-content source-console">
                    <HighlightedCode code={sourceCode} language={sourcePreviewLanguage} maxLines={24} emphasizeLine={shouldEmphasizeSourceLine} highlightedLines={highlightedSourceLines} onLineClick={handleSourceLineClick} />
                  </div>
                </section>
              )}
            </section>
          )}

          {activePage === "history" && (
            <section className="page-shell">
              <div className="page-header"><span className="panel-kicker">History</span><h2 style={{ fontSize: '2rem' }}>任务历史</h2></div>
              <div className="history-page-layout" style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: '24px' }}>
                <HistoryPanel error={historyError} runs={runs} selectedRunId={selectedRunId} onSelectRun={handleSelectRun} />
                <section className="panel history-detail-panel">
                  {selectedHistoryRun ? (
                    <>
                      <div className="panel-header"><h3>{result?.cir.title ?? selectedHistoryRun.title}</h3></div>
                      {previewVideoUrl && result?.request_id === selectedHistoryRun.request_id ? (
                        <div className="preview-stage"><VideoPreview src={previewVideoUrl} title="历史视频" headerless /></div>
                      ) : <div className="preview-empty"><strong>任务执行中或无可展示视频</strong></div>}
                      <div className="panel-toolbar" style={{ marginTop: '20px' }}>
                        <button type="button" className="ghost-button" onClick={() => setActivePage("studio")}>在 Studio 打开</button>
                      </div>
                    </>
                  ) : <div className="history-empty">还没有选中任务。</div>}
                </section>
              </div>
            </section>
          )}

          {activePage === "tools" && (
            <section className="page-shell">
              <div className="page-header"><span className="panel-kicker">Tools</span><h2 style={{ fontSize: '2rem' }}>工具与调试</h2></div>
              <details className="panel panel-advanced" onToggle={(e) => setDebugToolsOpen((e.currentTarget as any).open)}>
                <summary className="advanced-summary">调试与生成脚本</summary>
                {debugToolsOpen && (
                  <div className="advanced-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginTop: '16px' }}>
                    <section className="panel panel-nested"><div className="panel-header"><h3>运行诊断</h3></div><div className="panel-toolbar"><button type="button" className="ghost-button" onClick={handleExportCurrent}>导出 JSON</button></div></section>
                    <section className="panel panel-nested"><div className="panel-header"><h3>生成脚本</h3></div><div className="console-content" style={{ maxHeight: '300px', overflow: 'auto' }}><HighlightedCode code={result?.renderer_script ?? ""} language="python" /></div></section>
                  </div>
                )}
              </details>
              <div style={{ display: 'grid', gap: '24px', marginTop: '24px' }}>
                <details className="panel panel-advanced"><summary className="advanced-summary">Provider 管理</summary><ProviderManager providers={runtimeCatalog.providers} onCreateProvider={handleCreateProvider} onDeleteProvider={handleDeleteProvider} /></details>
                <details className="panel panel-advanced"><summary className="advanced-summary">TTS 配置</summary><TTSSettingsPanel settings={runtimeCatalog.settings} onSave={handleUpdateRuntimeSettings} /></details>
              </div>
            </section>
          )}
        </main>

        <nav className="mobile-nav" style={{
          display: 'none', position: 'fixed', bottom: 0, left: 0, right: 0,
          background: 'var(--surface)', borderTop: '1px solid var(--panel-border)', padding: '12px'
        }}>
          {['studio', 'history', 'tools'].map(p => <button key={p} onClick={() => setActivePage(p as AppPage)}>{p}</button>)}
        </nav>
      </div>
    </div>
  );
}
