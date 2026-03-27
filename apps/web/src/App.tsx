import { startTransition, useEffect, useEffectEvent, useState } from "react";
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
  // 动画-代码联动状态
  const [activeStepIndex, setActiveStepIndex] = useState<number | null>(null);
  const [seekToTime, setSeekToTime] = useState<number | null>(null);

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

  // 动画-代码联动：根据视频时间确定当前步骤
  const stepTiming = result?.step_timing ?? [];
  const handleVideoTimeUpdate = (currentTime: number) => {
    if (stepTiming.length === 0) return;
    // 找到当前时间对应的步骤
    for (let i = 0; i < stepTiming.length; i++) {
      const step = stepTiming[i];
      if (currentTime >= step.start_time && currentTime < step.end_time) {
        // Only update if step changed
        if (activeStepIndex !== i) {
          setActiveStepIndex(i);
        }
        return;
      }
    }
    // 如果不在任何步骤范围内，清除高亮
    if (activeStepIndex !== null) {
      setActiveStepIndex(null);
    }
  };

  // 动画-代码联动：点击代码行跳转到对应步骤
  // lineIndex is 0-indexed from HighlightedCode, step_timing uses 1-indexed lines
  const handleSourceLineClick = (lineIndex: number) => {
    const lineNumber = lineIndex + 1; // Convert to 1-indexed
    const match = stepTiming.find(
      (s) => s.start_line != null && s.end_line != null
        && lineNumber >= s.start_line && lineNumber <= s.end_line,
    );
    if (match) {
      // Use a unique token to force re-seek even if time is the same
      setSeekToTime(match.start_time);
      // Clear seekToTime after a short delay to allow re-seeking to the same time
      setTimeout(() => setSeekToTime(null), 100);
    }
  };

  // 计算当前高亮的源码行号（step_timing 使用 1-indexed，需转换为 0-indexed 供 HighlightedCode 使用）
  const highlightedSourceLines =
    activeStepIndex !== null && stepTiming[activeStepIndex]
    && stepTiming[activeStepIndex].start_line != null
    && stepTiming[activeStepIndex].end_line != null
      ? Array.from(
        {
          length:
            stepTiming[activeStepIndex].end_line! -
            stepTiming[activeStepIndex].start_line! +
            1,
        },
        (_, i) => stepTiming[activeStepIndex].start_line! + i - 1, // Convert to 0-indexed
      )
      : [];

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.classList.toggle("dark", theme === "dark");
    window.localStorage.setItem(themeStorageKey, theme);
  }, [theme]);

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
    let active = true;

    void getPipelineRuns()
      .then((historyRuns) => {
        if (!active) {
          return;
        }

        startTransition(() => {
          setRuns(historyRuns);
          setHistoryError(null);
        });
      })
      .catch((loadError) => {
        if (!active) {
          return;
        }
        startTransition(() => {
          setHistoryError(loadError instanceof Error ? loadError.message : "历史记录加载失败");
        });
      });

    return () => {
      active = false;
    };
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
    setActiveStepIndex(null);
    setSeekToTime(null);

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
      setActiveStepIndex(null);
      setSeekToTime(null);

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
    setActiveStepIndex(null);
    setSeekToTime(null);
    setDebugToolsOpen(false);
  }

  return (
    <div className="theory-shell">
      {/* 2. 挂载魔法光标 */}
      <MagicCursor />

      <header className="topbar">
        <div className="brand-block">
          <span className="brand-mark" />
          <div>
            <strong>MetaView</strong>
            <small>Theoretical Canvas</small>
          </div>
        </div>

        <nav className="topbar-nav" aria-label="Primary">
          <button
            type="button"
            className={activePage === "studio" ? "is-active" : ""}
            onClick={() => setActivePage("studio")}
          >
            Studio
          </button>
          <button
            type="button"
            className={activePage === "history" ? "is-active" : ""}
            onClick={() => setActivePage("history")}
          >
            History
          </button>
          <button
            type="button"
            className={activePage === "tools" ? "is-active" : ""}
            onClick={() => setActivePage("tools")}
          >
            Tools
          </button>
        </nav>

        <div className="topbar-actions">
          <button
            type="button"
            className="topbar-secondary-button"
            onClick={handleStartNewConversation}
          >
            新对话
          </button>

          {/* 核心修改：主题切换按钮，带有从鼠标位置扩散的动画 */}
          <button
            type="button"
            className="theme-toggle"
            onClick={() => {
              // 如果浏览器不支持动画 API (Firefox/Safari)
              if (!(document as any).startViewTransition) {
                setTheme((current) => (current === "dark" ? "light" : "dark"));
                return;
              }

              // 开启扩散动画
              (document as any).startViewTransition(() => {
                // 在这里更新主题，动画会自动识别前后差异并执行 CSS 定义的 circle-expand
                setTheme((current) => (current === "dark" ? "light" : "dark"));
              });
            }}
          >
            {theme === "dark" ? "Light Mode" : "Dark Mode"}
          </button>
        </div>
      </header>

      <div className="workspace">
        <main className="canvas">
          {activePage === "studio" ? (
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
                />

                {hasCompletedPreview && showSourcePanel && !hasInteractiveExplorer ? (
                  <section className="panel source-panel studio-source-panel">
                    <div className="panel-header">
                      <span className="panel-kicker">Source</span>
                      <h3>算法源码</h3>
                      <p>这里只高亮你输入的 Python / C++ 源码，不展示生成的 Manim 脚本。</p>
                    </div>

                    {activeStepIndex !== null && stepTiming[activeStepIndex] ? (
                      <div className="execution-code-summary">
                        <div>
                          <span className="panel-kicker">Active Step</span>
                          <strong>步骤 {activeStepIndex + 1}</strong>
                        </div>
                        <p>
                          当前播放时间对应源码第 {stepTiming[activeStepIndex].start_line}
                          {stepTiming[activeStepIndex].end_line !== stepTiming[activeStepIndex].start_line
                            ? ` - ${stepTiming[activeStepIndex].end_line}` : ''} 行
                        </p>
                      </div>
                    ) : null}

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
                        highlightedLines={highlightedSourceLines}
                        onLineClick={handleSourceLineClick}
                      />
                    </div>
                  </section>
                ) : null}
              </div>

              {hasCompletedPreview ? (
                hasInteractiveExplorer && result?.execution_map ? (
                  <section className="panel stage-panel interactive-explorer-panel">
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
                  </section>
                ) : (
                  <section className="panel stage-panel stage-panel-sticky stage-panel-compact">
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
                        headerless
                        onTimeUpdate={handleVideoTimeUpdate}
                        seekTo={seekToTime}
                      />
                    </div>
                  </section>
                )
              ) : null}
            </section>
          ) : null}

          {activePage === "studio" && !hasCompletedPreview && (showPreviewPanel || showSourcePanel) ? (
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
                      highlightedLines={highlightedSourceLines}
                      onLineClick={handleSourceLineClick}
                    />
                  </div>
                </section>
              ) : null}
            </section>
          ) : null}

          {activePage === "history" ? (
            <section className="page-shell" id="history">
              <div className="page-header">
                <span className="panel-kicker">History</span>
                <h2>任务历史</h2>
                <p>历史任务集中放在这里查看。选择记录后，右侧会显示当前结果摘要，并可一键切回 Studio 继续编辑或复用。</p>
              </div>

              <div className="history-page-layout">
                <HistoryPanel
                  error={historyError}
                  runs={runs}
                  selectedRunId={selectedRunId}
                  onSelectRun={handleSelectRun}
                />
                <section className="panel panel-history-detail history-detail-panel">
                  <div className="panel-header">
                    <span className="panel-kicker">Selected Run</span>
                    <h3>{result?.cir.title ?? selectedHistoryRun?.title ?? "选择一条历史任务"}</h3>
                    <p>
                      {selectedHistoryRun
                        ? selectedHistoryRun.prompt
                        : "点击左侧历史记录后，这里会显示该任务的视频、状态与诊断摘要。"}
                    </p>
                  </div>

                  {selectedHistoryRun ? (
                    <>
                      <div className="history-item-meta">
                        <span>{selectedHistoryRun.request_id.slice(0, 8)}</span>
                        <span>{selectedHistoryRun.status}</span>
                        <span>{selectedHistoryRun.domain ?? "auto"}</span>
                        <span>{selectedHistoryRun.generation_provider ?? "-"}</span>
                      </div>

                      {previewVideoUrl && result?.request_id === selectedHistoryRun.request_id ? (
                        <div className="preview-stage">
                          <VideoPreview
                            src={previewVideoUrl}
                            title="历史视频"
                            downloadName={`${selectedHistoryRun.request_id}.mp4`}
                            headerless
                          />
                        </div>
                      ) : (
                        <div className={`preview-empty ${loading ? "is-loading" : ""}`}>
                          <strong>
                            {selectedHistoryRun.status === "failed"
                              ? "该任务执行失败"
                              : isRunningStatus(selectedHistoryRun.status)
                                ? "该任务仍在执行中"
                                : "该任务暂无可展示视频"}
                          </strong>
                          <span>
                            {selectedHistoryRun.error_message ??
                              (isRunningStatus(selectedHistoryRun.status)
                                ? "后台会继续执行，完成后可在这里直接查看。"
                                : "如果任务成功但未加载出视频，可切回 Studio 重新拉取详情。")}
                          </span>
                        </div>
                      )}

                      <ul className="diagnostic-list">
                        {(result?.request_id === selectedHistoryRun.request_id
                            ? result.diagnostics.slice(0, 4)
                            : []
                        ).map((diagnostic, index) => (
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
                          onClick={() => setActivePage("studio")}
                        >
                          在 Studio 打开
                        </button>
                      </div>
                    </>
                  ) : (
                    <div className="history-empty">还没有选中任务。</div>
                  )}
                </section>
              </div>
            </section>
          ) : null}

          {activePage === "tools" ? (
            <section className="page-shell" id="tools">
              <div className="page-header">
                <span className="panel-kicker">Tools</span>
                <h2>工具与调试</h2>
                <p>生成脚本、原始返回、Provider 管理、Prompt 工具等都集中在这里，不再堆在主页面下方。</p>
              </div>

              <details
                className="panel panel-advanced"
                onToggle={(event) => {
                  setDebugToolsOpen((event.currentTarget as HTMLDetailsElement).open);
                }}
              >
                <summary className="advanced-summary">调试与生成脚本</summary>
                {debugToolsOpen ? (
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
                ) : null}
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
            </section>
          ) : null}
        </main>

        <nav className="mobile-nav" aria-label="Mobile navigation">
          <button type="button" onClick={handleStartNewConversation}>
            新对话
          </button>
          <button
            type="button"
            className={activePage === "studio" ? "is-active" : ""}
            onClick={() => setActivePage("studio")}
          >
            Studio
          </button>
          <button
            type="button"
            className={activePage === "history" ? "is-active" : ""}
            onClick={() => setActivePage("history")}
          >
            History
          </button>
          <button
            type="button"
            className={activePage === "tools" ? "is-active" : ""}
            onClick={() => setActivePage("tools")}
          >
            Tools
          </button>
        </nav>
      </div>
    </div>
  );
}
