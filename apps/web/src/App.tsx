import { startTransition, useEffect, useState } from "react";
import type { FormEvent } from "react";

import {
  deleteCustomProvider,
  getPipelineRun,
  getPipelineRuns,
  getRuntimeCatalog,
  runPipeline,
  upsertCustomProvider,
} from "./api/client";
import { CodeAdapterPanel } from "./components/CodeAdapterPanel";
import { ControlPanel } from "./components/ControlPanel";
import { HistoryPanel } from "./components/HistoryPanel";
import { ProviderManager } from "./components/ProviderManager";
import { TaskQueuePanel } from "./components/TaskQueuePanel";
import type {
  CustomProviderUpsertRequest,
  ModelProvider,
  PipelineResponse,
  PipelineRunSummary,
  RuntimeCatalog,
  SandboxMode,
} from "./types";

const defaultPrompt = "请可视化讲解二分查找的边界收缩过程，突出 left / mid / right 的变化。";
const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8000").replace(/\/$/, "");

const fallbackRuntimeCatalog: RuntimeCatalog = {
  default_provider: "mock",
  default_router_provider: "mock",
  default_generation_provider: "mock",
  sandbox_engine: "python-manim-static",
  providers: [
    {
      name: "mock",
      label: "Mock Provider",
      kind: "mock",
      model: "mock-cir-studio-001",
      stage_models: {},
      description: "本地确定性规则提供者，用于 MVP 阶段替代真实大模型。",
      configured: true,
      is_custom: false,
      supports_vision: false,
      base_url: null,
    },
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
  const configuredProviders = catalog.providers.filter((candidate) => candidate.configured);
  if (configuredProviders.some((candidate) => candidate.name === requestedProvider)) {
    return requestedProvider as ModelProvider;
  }
  if (configuredProviders.some((candidate) => candidate.name === fallbackProvider)) {
    return fallbackProvider;
  }
  return configuredProviders[0]?.name ?? fallbackProvider;
}

export default function App() {
  const [prompt, setPrompt] = useState(defaultPrompt);
  const [sourceCode, setSourceCode] = useState("");
  const [sourceCodeLanguage, setSourceCodeLanguage] = useState("");
  const [routerProvider, setRouterProvider] = useState<ModelProvider>(
    fallbackRuntimeCatalog.default_router_provider,
  );
  const [generationProvider, setGenerationProvider] = useState<ModelProvider>(
    fallbackRuntimeCatalog.default_generation_provider,
  );
  const [sandboxMode, setSandboxMode] = useState<SandboxMode>("dry_run");
  const [sourceImage, setSourceImage] = useState<string | null>(null);
  const [sourceImageName, setSourceImageName] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PipelineResponse | null>(null);
  const [runtimeCatalog, setRuntimeCatalog] = useState<RuntimeCatalog>(fallbackRuntimeCatalog);
  const [runs, setRuns] = useState<PipelineRunSummary[]>([]);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
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
        sourceCode,
        sourceCodeLanguage || null,
        sourceImage,
        sourceImageName,
      );
      startTransition(() => {
        setResult(response);
        setSelectedRunId(response.request_id);
      });
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

  return (
    <main className="app-shell">
      <section className="hero">
        <div>
          <span className="hero-kicker">Video MVP</span>
          <h2>输入题目，后端直接生成预览视频。</h2>
          <p className="hero-copy">
            当前主链路统一输出 Python Manim，并通过后端渲染视频；前端不再承担实时脚本转换。
          </p>
        </div>
        <div className="hero-badges">
          <span>{activeSkill?.label ?? "模型自动判断"}</span>
          <span>Backend Render</span>
          <span>Video Preview</span>
        </div>
      </section>

      <div className="workspace-grid">
        <ControlPanel
          prompt={prompt}
          sourceCode={sourceCode}
          sourceCodeLanguage={sourceCodeLanguage}
          routerProvider={routerProvider}
          generationProvider={generationProvider}
          sandboxMode={sandboxMode}
          providers={runtimeCatalog.providers}
          sandboxModes={runtimeCatalog.sandbox_modes}
          loading={loading}
          sourceImageName={sourceImageName}
          routerProviderSupportsVision={routerProviderSupportsVision}
          generationProviderSupportsVision={generationProviderSupportsVision}
          onPromptChange={setPrompt}
          onSourceCodeChange={setSourceCode}
          onSourceCodeLanguageChange={setSourceCodeLanguage}
          onRouterProviderChange={setRouterProvider}
          onGenerationProviderChange={setGenerationProvider}
          onSandboxModeChange={setSandboxMode}
          onSourceImageChange={handleSourceImageChange}
          onSubmit={handleSubmit}
        />

        <section className="panel panel-preview">
          <div className="panel-header">
            <span className="panel-kicker">Preview</span>
            <h3>视频预览</h3>
            <p>主页优先播放后端生成的 MP4 预览视频。</p>
          </div>
          {previewVideoUrl ? (
            <div className="preview-video-shell">
              <video
                key={previewVideoUrl}
                className="preview-video"
                src={previewVideoUrl}
                controls
                playsInline
                autoPlay
                muted
                loop
              />
            </div>
          ) : (
            <div className="preview-empty">
              <strong>{loading ? "后端渲染中" : "等待生成结果"}</strong>
              <span>
                {loading
                  ? "正在生成预览视频，首次渲染会比前端实时预览稍慢。"
                  : "提交题目后，这里会显示后端渲染好的 MP4 视频。"}
              </span>
            </div>
          )}
        </section>
      </div>

      <div className="workspace-grid workspace-grid-bottom">
        <section className="panel panel-diagnostics">
          <div className="panel-header">
            <span className="panel-kicker">Status</span>
            <h3>本次结果</h3>
          </div>
          {error ? <p className="error-text">{error}</p> : null}
          {result ? (
            <p className="panel-note">
              当前任务自动路由到 <strong>{result.runtime.skill.label}</strong>，并已生成可播放的视频预览。
            </p>
          ) : null}
          {hasRawProviderOutput ? (
            <p className="panel-note">
              已捕获 LLM 原始返回，展开下方“高级调试与脚本信息”可查看完整内容。
            </p>
          ) : null}
          {result ? (
            <div className="runtime-summary">
              <div>
                <span>标题</span>
                <strong>{result.cir.title}</strong>
                <small>{result.cir.domain}</small>
              </div>
              <div>
                <span>Skill</span>
                <strong>{result.runtime.skill.domain}</strong>
                <small>{result.runtime.skill.id}</small>
              </div>
              <div>
                <span>Router</span>
                <strong>{result.runtime.router_provider.name}</strong>
                <small>{result.runtime.router_provider.model}</small>
              </div>
              <div>
                <span>Generation</span>
                <strong>{result.runtime.generation_provider.name}</strong>
                <small>{result.runtime.generation_provider.model}</small>
              </div>
              <div>
                <span>视频预览</span>
                <strong>{result.preview_video_url ? "ready" : "fallback"}</strong>
                <small>{result.preview_video_url ?? "未生成视频 URL"}</small>
              </div>
            </div>
          ) : null}
          <ul className="diagnostic-list">
            {(result?.diagnostics ?? []).slice(0, 4).map((diagnostic, index) => (
              <li key={`${diagnostic.agent}-${index}`}>
                <strong>{diagnostic.agent}</strong>
                <span>{diagnostic.message}</span>
              </li>
            ))}
            {!result && !error ? (
              <li className="empty-state">提交题目后，这里会显示简短结果概览。</li>
            ) : null}
          </ul>
        </section>

        <HistoryPanel runs={runs} selectedRunId={selectedRunId} onSelectRun={handleSelectRun} />
      </div>

      <details className="panel panel-advanced workspace-grid-bottom">
        <summary className="advanced-summary">高级调试信息</summary>
        <div className="advanced-grid">
          <section className="panel panel-history-detail panel-nested">
            <div className="panel-header">
              <span className="panel-kicker">Diagnostics</span>
              <h3>完整诊断</h3>
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
              <span className="panel-kicker">LLM Raw Output</span>
              <h3>模型原始返回</h3>
              <p>展示每个 agent 阶段从远程 provider 收到的原始内容。</p>
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
              <div className="preview-empty raw-output-empty">
                <strong>暂无原始返回</strong>
                <span>当前结果来自本地模板或 mock provider，未记录远程 LLM 原始内容。</span>
              </div>
            )}
          </section>

          <section className="panel panel-history-detail panel-nested">
            <div className="panel-header">
              <span className="panel-kicker">Repair Loop</span>
              <h3>验证与修复详情</h3>
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

      <details className="panel panel-advanced workspace-grid-bottom">
        <summary className="advanced-summary">代码转换测试</summary>
        <div className="advanced-grid advanced-grid-single">
          <CodeAdapterPanel />
        </div>
      </details>

      <details className="panel panel-advanced workspace-grid-bottom">
        <summary className="advanced-summary">📋 任务队列 & 过程回放</summary>
        <div className="advanced-grid">
          <TaskQueuePanel apiBaseUrl={API_BASE_URL} />
        </div>
      </details>

      <details className="panel panel-advanced workspace-grid-bottom">
        <summary className="advanced-summary">Provider 管理</summary>
        <div className="advanced-grid">
          <ProviderManager
            providers={runtimeCatalog.providers}
            onCreateProvider={handleCreateProvider}
            onDeleteProvider={handleDeleteProvider}
          />

          <section className="panel panel-history-detail panel-nested">
            <div className="panel-header">
              <span className="panel-kicker">Skill Routing</span>
              <h3>当前路由状态</h3>
              <p>保留为调试视图，主界面不再默认展开。</p>
            </div>
            <div className="skill-card">
              <strong>{activeSkill?.label ?? "等待模型判断"}</strong>
              <p>{activeSkill?.description ?? "提交题目后，这里会显示当前 skill。"} </p>
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
    </main>
  );
}
