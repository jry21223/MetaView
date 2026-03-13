import { startTransition, useDeferredValue, useEffect, useState } from "react";
import type { FormEvent } from "react";

import { getRuntimeCatalog, runPipeline } from "./api/client";
import { ControlPanel } from "./components/ControlPanel";
import { PreviewCanvas } from "./components/PreviewCanvas";
import type {
  ModelProvider,
  PipelineResponse,
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
  const deferredResult = useDeferredValue(result);

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

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const response = await runPipeline(prompt, domain, provider, sandboxMode);
      startTransition(() => {
        setResult(response);
      });
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "请求失败");
    } finally {
      setLoading(false);
    }
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
          <pre>{result?.renderer_script ?? "// 生成后显示渲染时间线草案"}</pre>
        </section>
      </div>
    </main>
  );
}
