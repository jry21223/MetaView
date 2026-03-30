import { startTransition, useEffect, useEffectEvent, useRef, useState } from "react";
import type { FormEvent } from "react";

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
  domainLabels,
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
    return "light";
  }
  const storedTheme = window.localStorage.getItem(themeStorageKey);
  if (storedTheme === "dark" || storedTheme === "light") {
    return storedTheme;
  }
  return "light";
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

  // Throttle time update ref for mobile performance
  const lastVideoUpdateTimeRef = useRef<number>(0);

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

  // 动画-代码联动：根据视频时间确定当前步骤
  const stepTiming = result?.step_timing ?? [];
  const handleVideoTimeUpdate = (currentTime: number) => {
    if (stepTiming.length === 0) return;

    // Throttle updates for mobile performance (~15fps on mobile, ~30fps on desktop)
    const now = Date.now();
    const throttleMs = typeof window !== "undefined" && window.matchMedia("(max-width: 760px)").matches
      ? 66
      : 33;
    if (now - lastVideoUpdateTimeRef.current < throttleMs) {
      return;
    }
    lastVideoUpdateTimeRef.current = now;

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
    <div className="app-shell">
      {/* Top Navigation Bar - Full Width */}
      <header className="topbar">
        <div className="topbar-brand">
          <span className="topbar-neon-strip" />
          <span className="topbar-brand-text">MetaView</span>
        </div>
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
          <div className="sidebar-brand-title">MetaView</div>
          <div className="sidebar-brand-subtitle">AI Visualization Studio</div>
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
      <main className="main-content">
        <div className="page-container">
          {/* Studio Page */}
          {activePage === "studio" ? (
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
                        onClick={() => handleSetDeckMode("smart")}
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
                        onClick={() => handleSetDeckMode("expert")}
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
                      <div style={{ color: "var(--error)" }}>
                        <strong>生成失败</strong>
                        <p>{error}</p>
                      </div>
                    ) : loading ? (
                      <div style={{ textAlign: "center", padding: "40px" }}>
                        <span className="material-symbols-outlined" style={{ fontSize: "48px", color: "var(--primary)" }}>
                          progress_activity
                        </span>
                        <p style={{ marginTop: "16px", color: "var(--on-surface-variant)" }}>
                          正在渲染视频...
                        </p>
                      </div>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          {/* History Page */}
          {activePage === "history" ? (
            <section className="page-shell" id="history">
              <div className="page-header">
                <span className="panel-kicker">History</span>
                <h2>任务历史</h2>
                <p>历史任务集中放在这里查看。选择记录后，右侧会显示结果摘要，并可一键切回工作台复用。</p>
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
                                : "如果任务成功但未加载出视频，可切回工作台重新拉取详情。")}
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
                          在工作台打开
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
                <p>生成脚本、原始返回、Provider 管理、Prompt 工具都集中在这里，采用浅色 Stitch 风格对齐。</p>
              </div>

              <div className="bento-grid" style={{ marginTop: "32px" }}>
                <section style={{ gridColumn: "span 8", display: "flex", flexDirection: "column", gap: "16px" }}>
                  <details
                    className="accordion-item"
                    open={debugToolsOpen}
                    onToggle={(event) => {
                      setDebugToolsOpen((event.currentTarget as HTMLDetailsElement).open);
                    }}
                  >
                    <summary className="accordion-trigger">
                      <div className="accordion-trigger-left">
                        <div className="accordion-icon secondary">
                          <span className="material-symbols-outlined">terminal</span>
                        </div>
                        <div>
                          <div className="accordion-label">调试与生成脚本</div>
                          <div className="accordion-hint">执行本地系统健康检查</div>
                        </div>
                      </div>
                      <span className="material-symbols-outlined accordion-arrow">expand_more</span>
                    </summary>
                    {debugToolsOpen ? (
                      <div className="accordion-content">
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "16px" }}>
                          <section className="bento-card" style={{ padding: "20px" }}>
                            <div style={{ fontSize: "0.625rem", fontWeight: 700, letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: "16px" }}>
                              运行诊断
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
                            ) : (
                              <div style={{ color: "var(--on-surface-variant)", fontSize: "0.875rem" }}>
                                生成任务后显示诊断信息
                              </div>
                            )}
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm"
                              style={{ marginTop: "16px" }}
                              onClick={handleExportCurrent}
                              disabled={!result}
                            >
                              导出当前任务 JSON
                            </button>
                          </section>

                          <section className="bento-card" style={{ padding: "20px" }}>
                            <div style={{ fontSize: "0.625rem", fontWeight: 700, letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: "16px" }}>
                              生成的 Manim 脚本
                            </div>
                            {result?.renderer_script ? (
                              <div style={{ maxHeight: "200px", overflow: "auto" }}>
                                <HighlightedCode
                                  code={result.renderer_script}
                                  language="python"
                                  className="highlighted-code-surface"
                                />
                              </div>
                            ) : (
                              <div style={{ color: "var(--on-surface-variant)", fontSize: "0.875rem" }}>
                                生成任务后显示 Manim 脚本
                              </div>
                            )}
                          </section>
                        </div>
                      </div>
                    ) : null}
                  </details>

                  <details className="accordion-item">
                    <summary className="accordion-trigger">
                      <div className="accordion-trigger-left">
                        <div className="accordion-icon tertiary">
                          <span className="material-symbols-outlined">data_object</span>
                        </div>
                        <div>
                          <div className="accordion-label">代码转换测试</div>
                          <div className="accordion-hint">验证架构转换</div>
                        </div>
                      </div>
                      <span className="material-symbols-outlined accordion-arrow">expand_more</span>
                    </summary>
                    <div className="accordion-content">
                      <CodeAdapterPanel />
                    </div>
                  </details>

                  <details className="accordion-item">
                    <summary className="accordion-trigger">
                      <div className="accordion-trigger-left">
                        <div className="accordion-icon primary">
                          <span className="material-symbols-outlined">hub</span>
                        </div>
                        <div>
                          <div className="accordion-label">Provider 管理</div>
                          <div className="accordion-hint">{runtimeCatalog.providers.length} 个活动端点监控中</div>
                        </div>
                      </div>
                      <span className="material-symbols-outlined accordion-arrow">expand_more</span>
                    </summary>
                    <div className="accordion-content">
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "16px" }}>
                        <ProviderManager
                          providers={runtimeCatalog.providers}
                          onCreateProvider={handleCreateProvider}
                          onDeleteProvider={handleDeleteProvider}
                        />
                        <TTSSettingsPanel
                          settings={runtimeCatalog.settings}
                          onSave={handleUpdateRuntimeSettings}
                        />
                      </div>
                    </div>
                  </details>

                  <details className="accordion-item">
                    <summary className="accordion-trigger">
                      <div className="accordion-trigger-left">
                        <div className="accordion-icon secondary">
                          <span className="material-symbols-outlined">psychology_alt</span>
                        </div>
                        <div>
                          <div className="accordion-label">Prompt 工具</div>
                          <div className="accordion-hint">A/B 测试大模型指令</div>
                        </div>
                      </div>
                      <span className="material-symbols-outlined accordion-arrow">expand_more</span>
                    </summary>
                    <div className="accordion-content">
                      <PromptReferenceTool
                        providers={runtimeCatalog.providers}
                        defaultProvider={runtimeCatalog.default_generation_provider}
                      />
                    </div>
                  </details>
                </section>

                <aside style={{ gridColumn: "span 4", display: "flex", flexDirection: "column", gap: "24px" }}>
                  <div className="resource-sidebar">
                    <div className="resource-sidebar-header">资源分配</div>
                    <div className="resource-sidebar-value">
                      <span className="resource-sidebar-number">84.2</span>
                      <span className="resource-sidebar-unit">%</span>
                    </div>
                    <div className="resource-sidebar-desc">主节点执行效率</div>

                    <div className="resource-progress-item">
                      <div className="resource-progress-label">
                        <span>计算负载</span>
                        <span>62%</span>
                      </div>
                      <div className="resource-progress-bar">
                        <div className="resource-progress-fill is-primary" style={{ width: "62%" }} />
                      </div>
                    </div>

                    <div className="resource-progress-item">
                      <div className="resource-progress-label">
                        <span>内存缓存</span>
                        <span>41%</span>
                      </div>
                      <div className="resource-progress-bar">
                        <div className="resource-progress-fill is-secondary" style={{ width: "41%" }} />
                      </div>
                    </div>
                  </div>

                  <div className="bento-card" style={{ padding: "24px" }}>
                    <div style={{ fontSize: "0.625rem", fontWeight: 700, letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: "16px" }}>
                      当前 Skill
                    </div>
                    {activeSkill ? (
                      <>
                        <strong style={{ color: "var(--on-surface)" }}>{activeSkill.label}</strong>
                        <p style={{ margin: "8px 0", fontSize: "0.75rem", color: "var(--on-surface-variant)" }}>
                          {activeSkill.description}
                        </p>
                        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                          <span className="chip chip-outline">{activeSkill.id}</span>
                          <span className="chip chip-outline">{activeSkill.domain}</span>
                          <span className="chip chip-primary">
                            {activeSkill.supports_image_input ? "image" : "text"}
                          </span>
                        </div>
                      </>
                    ) : (
                      <div style={{ color: "var(--on-surface-variant)", fontSize: "0.875rem" }}>
                        等待模型判断
                      </div>
                    )}
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                    <div style={{ fontSize: "0.625rem", fontWeight: 700, letterSpacing: "0.15em", textTransform: "uppercase", color: "var(--on-surface-variant)" }}>
                      快速操作
                    </div>
                    <button className="resource-quick-action" type="button">
                      <span className="resource-quick-action-label">重新索引核心清单</span>
                      <span className="material-symbols-outlined resource-quick-action-icon">refresh</span>
                    </button>
                    <button className="resource-quick-action" type="button">
                      <span className="resource-quick-action-label">刷新翻译缓存</span>
                      <span className="material-symbols-outlined resource-quick-action-icon">sync</span>
                    </button>
                  </div>
                </aside>
              </div>

              <footer className="tools-footer">
                <div className="tools-footer-stat">
                  <span className="tools-footer-label">活跃监听</span>
                  <span className="tools-footer-value">2,481</span>
                </div>
                <div className="tools-footer-stat">
                  <span className="tools-footer-label">错误频率</span>
                  <span className="tools-footer-value is-error">0.04%</span>
                </div>
                <div className="tools-footer-stat">
                  <span className="tools-footer-label">API 请求 (24小时)</span>
                  <span className="tools-footer-value">1.2M</span>
                </div>
                <div className="tools-footer-stat">
                  <span className="tools-footer-label">会话可靠性</span>
                  <span className="tools-footer-value is-primary">99.98%</span>
                </div>
              </footer>
            </section>
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
