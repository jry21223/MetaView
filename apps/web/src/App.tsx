import { startTransition, useDeferredValue, useEffect, useState } from "react";
import type { FormEvent } from "react";

import {
  getPipelineRun,
  getPipelineRuns,
  getRuntimeCatalog,
  runPipeline,
} from "./api/client";
import { ControlPanel } from "./components/ControlPanel";
import { HistoryPanel } from "./components/HistoryPanel";
import { PreviewCanvas } from "./components/PreviewCanvas";
import type {
  ModelProvider,
  PipelineResponse,
  PipelineRunSummary,
  RuntimeCatalog,
  SandboxMode,
  TopicDomain,
} from "./types";

const defaultPrompt = "请可视化讲解二分查找的边界收缩过程，突出 left / mid / right 的变化。";
const fallbackRuntimeCatalog: RuntimeCatalog = {
  default_provider: "mock",
  sandbox_engine: "preview-dry-run",
  providers: [
    {
      name: "mock",
      model: "mock-cir-studio-001",
      description: "本地确定性规则提供者，用于 MVP 阶段替代真实大模型。",
      configured: true,
    },
    {
      name: "openai",
      model: "not-configured",
      description: "OpenAI 兼容 Provider，需配置环境变量后启用。",
      configured: false,
    },
  ],
  sandbox_modes: ["dry_run", "off"],
};

export default function App() {
  const [prompt, setPrompt] = useState(defaultPrompt);
  const [domain, setDomain] = useState<TopicDomain>("algorithm");
  const [provider, setProvider] = useState<ModelProvider>("mock");
  const [sandboxMode, setSandboxMode] = useState<SandboxMode>("dry_run");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PipelineResponse | null>(null);
  const [runtimeCatalog, setRuntimeCatalog] = useState<RuntimeCatalog>(fallbackRuntimeCatalog);
  const [runs, setRuns] = useState<PipelineRunSummary[]>([]);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const deferredResult = useDeferredValue(result);

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
        setProvider(catalog.default_provider);
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

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const response = await runPipeline(prompt, domain, provider, sandboxMode);
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
      setDomain(run.request.domain);
      setProvider(run.request.provider ?? "mock");
      setSandboxMode(run.request.sandbox_mode);
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
        domain,
        provider,
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

  return (
    <main className="app-shell">
      <section className="hero">
        <div>
          <span className="hero-kicker">Web-native Preview</span>
          <h2>把题目先翻译成 CIR，再驱动浏览器原生渲染。</h2>
        </div>
        <div className="hero-badges">
          <span>Planner</span>
          <span>Coder</span>
          <span>Critic</span>
          <span>Canvas MVP</span>
        </div>
      </section>

      <div className="workspace-grid">
        <ControlPanel
          prompt={prompt}
          domain={domain}
          provider={provider}
          sandboxMode={sandboxMode}
          providers={runtimeCatalog.providers}
          sandboxModes={runtimeCatalog.sandbox_modes}
          loading={loading}
          onPromptChange={setPrompt}
          onDomainChange={setDomain}
          onProviderChange={setProvider}
          onSandboxModeChange={setSandboxMode}
          onSubmit={handleSubmit}
        />

        <section className="panel panel-preview">
          <div className="panel-header">
            <span className="panel-kicker">Preview</span>
            <h3>前端即时渲染</h3>
            <p>当前使用 Canvas 进行轻量场景预览，后续可替换为 manim-web / WebGPU 适配层。</p>
          </div>
          <PreviewCanvas cir={deferredResult?.cir ?? null} />
        </section>
      </div>

      <div className="workspace-grid workspace-grid-bottom">
        <section className="panel panel-diagnostics">
          <div className="panel-header">
            <span className="panel-kicker">Diagnostics</span>
            <h3>智能体诊断</h3>
          </div>
          {error ? <p className="error-text">{error}</p> : null}
          {result ? (
            <div className="runtime-summary">
              <div>
                <span>Provider</span>
                <strong>{result.runtime.provider.name}</strong>
                <small>{result.runtime.provider.model}</small>
              </div>
              <div>
                <span>Sandbox</span>
                <strong>{result.runtime.sandbox.status}</strong>
                <small>{result.runtime.sandbox.engine}</small>
              </div>
              <div>
                <span>Duration</span>
                <strong>{result.runtime.sandbox.duration_ms} ms</strong>
                <small>{result.runtime.sandbox.mode}</small>
              </div>
            </div>
          ) : null}
          {result ? (
            <div className="validation-summary">
              <div>
                <span>Validation</span>
                <strong>{result.runtime.validation.status}</strong>
              </div>
              <div>
                <span>Repair Count</span>
                <strong>{result.runtime.repair_count}</strong>
              </div>
              <div>
                <span>Issues</span>
                <strong>{result.runtime.validation.issues.length}</strong>
              </div>
            </div>
          ) : null}
          {result ? (
            <ul className="trace-list">
              {result.runtime.agent_traces.map((trace) => (
                <li key={trace.agent}>
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
            {!result && !error ? (
              <li className="empty-state">提交题目后展示 Planner / Critic / Sandbox 的诊断结果。</li>
            ) : null}
          </ul>
        </section>

        <section className="panel panel-code">
          <div className="panel-header">
            <span className="panel-kicker">Renderer Draft</span>
            <h3>脚本草案</h3>
          </div>
          <div className="panel-toolbar">
            <button type="button" className="ghost-button" onClick={handleExportCurrent} disabled={!result}>
              导出当前任务 JSON
            </button>
          </div>
          <pre>{result?.renderer_script ?? "// 生成后显示渲染时间线草案"}</pre>
        </section>
      </div>

      <div className="workspace-grid workspace-grid-bottom">
        <HistoryPanel runs={runs} selectedRunId={selectedRunId} onSelectRun={handleSelectRun} />
        <section className="panel panel-history-detail">
          <div className="panel-header">
            <span className="panel-kicker">Repair Loop</span>
            <h3>验证与修复详情</h3>
            <p>这里汇总 CIR 校验结果、自动修复动作与后续接入 RLEF 的承接位。</p>
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
            <div className="history-empty">选择历史任务或先生成新任务后，这里会展示验证与修复细节。</div>
          )}
        </section>
      </div>
    </main>
  );
}
