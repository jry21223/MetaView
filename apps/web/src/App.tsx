import { lazy, startTransition, Suspense, useDeferredValue, useEffect, useState } from "react";
import type { FormEvent } from "react";

import {
  deleteCustomProvider,
  getPipelineRun,
  getPipelineRuns,
  getRuntimeCatalog,
  runPipeline,
  upsertCustomProvider,
} from "./api/client";
import { ControlPanel } from "./components/ControlPanel";
import { HistoryPanel } from "./components/HistoryPanel";
import { ProviderManager } from "./components/ProviderManager";
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

const defaultPrompt = "请可视化讲解二分查找的边界收缩过程，突出 left / mid / right 的变化。";
const PreviewCanvas = lazy(async () => {
  const module = await import("./components/PreviewCanvas");
  return { default: module.default };
});

const fallbackSkills: SkillDescriptor[] = [
  {
    id: "algorithm-process-viz",
    domain: "algorithm",
    label: "算法过程可视化",
    description: "将排序、搜索、图论与动态规划的状态迁移过程转成可交互动画。",
    version: "1.0.0",
    triggers: ["可视化算法", "排序演示", "图论遍历", "状态转移"],
    dependencies: ["manim-web", "manim-algorithm", "manim-code-blocks"],
    supports_image_input: false,
    execution_notes: [
      "提取循环与条件分支的关键状态。",
      "同步代码高亮与变量变化。",
      "递归场景优先拆出调用栈镜头。",
    ],
  },
  {
    id: "math-theorem-walkthrough",
    domain: "math",
    label: "数学定理攻略",
    description: "生成数学证明、函数图像和线性代数变换的视觉步进动画。",
    version: "1.0.0",
    triggers: ["数学证明", "函数图像绘制", "几何变换", "微积分演示"],
    dependencies: ["manim-web", "katex", "sympy", "numpy"],
    supports_image_input: false,
    execution_notes: [
      "先定义对象与坐标系。",
      "推导过程不能跳步。",
      "导数与积分要显式跟踪变量。",
    ],
  },
  {
    id: "physics-simulation-viz",
    domain: "physics",
    label: "物理模拟可视化",
    description: "支持力学、电学与场论过程演示，并可从静态题目图片提取对象关系。",
    version: "1.0.0",
    triggers: ["物理模拟", "力学实验", "电路分析", "电磁场演示"],
    dependencies: ["manim-web", "manim-physics", "manim-circuit"],
    supports_image_input: true,
    execution_notes: [
      "题图先提取对象、受力与约束。",
      "建模先于动画。",
      "结果必须回到物理定律校核。",
    ],
  },
  {
    id: "molecular-structure-viz",
    domain: "chemistry",
    label: "分子结构可视化",
    description: "解析分子结构、键变化与反应机理，生成球棍模型与过程动画。",
    version: "1.0.0",
    triggers: ["分子结构", "化学反应演示", "分子键断裂", "原子轨道"],
    dependencies: ["manim-web", "manim-chemistry", "rdkit"],
    supports_image_input: false,
    execution_notes: [
      "明确键连接与构型。",
      "关键断键成键要同步叙事。",
      "结果要审查化合价与守恒。",
    ],
  },
  {
    id: "biology-process-viz",
    domain: "biology",
    label: "生物过程可视化",
    description: "用于细胞、遗传、代谢与生态系统中具有阶段性变化的知识过程。",
    version: "1.0.0",
    triggers: ["细胞分裂", "遗传规律", "代谢通路", "生态系统"],
    dependencies: ["manim-web", "numpy"],
    supports_image_input: false,
    execution_notes: [
      "先确定结构层级。",
      "阶段切换与调控箭头分离呈现。",
      "结论要回到功能解释。",
    ],
  },
  {
    id: "geospatial-process-viz",
    domain: "geography",
    label: "地理演化可视化",
    description: "展示板块运动、水循环、人口迁移和区域空间演化过程。",
    version: "1.0.0",
    triggers: ["板块运动", "水循环", "人口迁移", "区域分析"],
    dependencies: ["manim-web", "geopandas", "matplotlib"],
    supports_image_input: false,
    execution_notes: [
      "统一底图坐标。",
      "强调方向、流向和区域差异。",
      "最后回到区域分析结论。",
    ],
  },
];

const fallbackRuntimeCatalog: RuntimeCatalog = {
  default_provider: "mock",
  sandbox_engine: "preview-dry-run",
  providers: [
    {
      name: "mock",
      label: "Mock Provider",
      kind: "mock",
      model: "mock-cir-studio-001",
      description: "本地确定性规则提供者，用于 MVP 阶段替代真实大模型。",
      configured: true,
      is_custom: false,
      base_url: null,
    },
    {
      name: "openai",
      label: "OpenAI Compatible",
      kind: "openai_compatible",
      model: "not-configured",
      description: "OpenAI 兼容 Provider，需配置环境变量后启用。",
      configured: false,
      is_custom: false,
      base_url: null,
    },
  ],
  skills: fallbackSkills,
  sandbox_modes: ["dry_run", "off"],
};

function findSkill(catalog: RuntimeCatalog, domain: TopicDomain): SkillDescriptor {
  return (
    catalog.skills.find((candidate) => candidate.domain === domain) ??
    fallbackSkills.find((candidate) => candidate.domain === domain) ??
    fallbackSkills[0]
  );
}

export default function App() {
  const [prompt, setPrompt] = useState(defaultPrompt);
  const [domain, setDomain] = useState<TopicDomain>("algorithm");
  const [provider, setProvider] = useState<ModelProvider>("mock");
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
  const deferredResult = useDeferredValue(result);
  const activeSkill = result?.runtime.skill ?? findSkill(runtimeCatalog, domain);

  async function refreshRuntimeCatalog(): Promise<RuntimeCatalog> {
    try {
      const catalog = await getRuntimeCatalog();
      setRuntimeCatalog(catalog);
      if (!catalog.providers.some((candidate) => candidate.name === provider && candidate.configured)) {
        setProvider(catalog.default_provider);
      }
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

  function handleDomainChange(nextDomain: TopicDomain) {
    setDomain(nextDomain);
    if (nextDomain !== "physics") {
      setSourceImage(null);
      setSourceImageName(null);
    }
  }

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
        domain,
        provider,
        sandboxMode,
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
      setDomain(run.request.domain);
      setProvider(run.request.provider ?? "mock");
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
        domain,
        provider,
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
    setProvider(providerExistsAndIsConfigured ? payload.name : catalog.default_provider);
  }

  async function handleDeleteProvider(name: string) {
    await deleteCustomProvider(name);
    const catalog = await refreshRuntimeCatalog();
    if (provider === name) {
      setProvider(catalog.default_provider);
    }
  }

  return (
    <main className="app-shell">
      <section className="hero">
        <div>
          <span className="hero-kicker">Skill-routed Preview</span>
          <h2>把题目路由到学科技能，再把逻辑翻译成 CIR 与浏览器原生动画。</h2>
        </div>
        <div className="hero-badges">
          <span>{activeSkill.label}</span>
          <span>Planner</span>
          <span>Coder</span>
          <span>Critic</span>
          <span>manim-web</span>
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
          sourceImageName={sourceImageName}
          onPromptChange={setPrompt}
          onDomainChange={handleDomainChange}
          onProviderChange={setProvider}
          onSandboxModeChange={setSandboxMode}
          onSourceImageChange={handleSourceImageChange}
          onSubmit={handleSubmit}
        />

        <section className="panel panel-preview">
          <div className="panel-header">
            <span className="panel-kicker">Preview</span>
            <h3>前端即时渲染</h3>
            <p>
              当前预览由 manim-web 正式渲染层驱动，three.js 承载运行时；当选择物理 skill
              时，还可以用静态题图辅助建模。
            </p>
          </div>
          <Suspense fallback={<div className="preview-empty">加载 manim-web 渲染器...</div>}>
            <PreviewCanvas
              cir={deferredResult?.cir ?? null}
              sceneKey={deferredResult?.request_id ?? "empty-preview"}
              skillLabel={activeSkill.label}
              sourceImageName={sourceImageName}
            />
          </Suspense>
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
            <p className="panel-note">
              当前任务由 <strong>{result.runtime.skill.label}</strong> 路由，Provider 为{" "}
              <strong>{result.runtime.provider.label}</strong>。
            </p>
          ) : null}
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
            <button
              type="button"
              className="ghost-button"
              onClick={handleExportCurrent}
              disabled={!result}
            >
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

      <div className="workspace-grid workspace-grid-bottom">
        <ProviderManager
          providers={runtimeCatalog.providers}
          onCreateProvider={handleCreateProvider}
          onDeleteProvider={handleDeleteProvider}
        />
        <section className="panel panel-history-detail">
          <div className="panel-header">
            <span className="panel-kicker">Skill Routing</span>
            <h3>当前学科技能</h3>
            <p>系统会按学科路由到不同 skill，把领域约束显式注入 Planner、Coder 和 Critic。</p>
          </div>
          <div className="skill-card">
            <strong>{activeSkill.label}</strong>
            <p>{activeSkill.description}</p>
            <div className="history-item-meta">
              <span>{activeSkill.id}</span>
              <span>{activeSkill.domain}</span>
              <span>{activeSkill.supports_image_input ? "image-assisted" : "text-only"}</span>
            </div>
          </div>
          <ul className="diagnostic-list">
            {activeSkill.execution_notes.map((note, index) => (
              <li key={`${activeSkill.id}-note-${index}`}>
                <strong>rule</strong>
                <span>{note}</span>
              </li>
            ))}
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
    </main>
  );
}
