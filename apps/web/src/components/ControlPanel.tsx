import type { FormEvent } from "react";

import type { ModelProvider, ProviderDescriptor, SandboxMode, TopicDomain } from "../types";

interface ControlPanelProps {
  prompt: string;
  domain: TopicDomain;
  provider: ModelProvider;
  sandboxMode: SandboxMode;
  providers: ProviderDescriptor[];
  sandboxModes: SandboxMode[];
  loading: boolean;
  onPromptChange: (value: string) => void;
  onDomainChange: (value: TopicDomain) => void;
  onProviderChange: (value: ModelProvider) => void;
  onSandboxModeChange: (value: SandboxMode) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}

export function ControlPanel({
  prompt,
  domain,
  provider,
  sandboxMode,
  providers,
  sandboxModes,
  loading,
  onPromptChange,
  onDomainChange,
  onProviderChange,
  onSandboxModeChange,
  onSubmit,
}: ControlPanelProps) {
  return (
    <section className="panel panel-form">
      <div className="panel-header">
        <span className="panel-kicker">Prompt Studio</span>
        <h1>基于 CIR 的算法与高数可视化工作台</h1>
        <p>
          当前版本已经打通 Planner、Coder、Critic 的后端链路，前端使用 manim-web
          正式渲染层，并支持选择内置或自定义 OpenAI 兼容 Provider。
        </p>
      </div>

      <form className="prompt-form" onSubmit={onSubmit}>
        <label>
          <span>题目描述</span>
          <textarea
            value={prompt}
            onChange={(event) => onPromptChange(event.target.value)}
            placeholder="例如：请可视化讲解二分查找的边界收缩过程，突出 left / mid / right 的变化。"
            rows={8}
          />
        </label>

        <label>
          <span>题型</span>
          <select
            value={domain}
            onChange={(event) => onDomainChange(event.target.value as TopicDomain)}
          >
            <option value="algorithm">算法</option>
            <option value="math">高等数学</option>
          </select>
        </label>

        <div className="select-grid">
          <label>
            <span>模型 Provider</span>
            <select
              value={provider}
              onChange={(event) => onProviderChange(event.target.value as ModelProvider)}
            >
              {providers.map((item) => (
                <option key={item.name} value={item.name} disabled={!item.configured}>
                  {item.label} / {item.model}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>沙盒模式</span>
            <select
              value={sandboxMode}
              onChange={(event) => onSandboxModeChange(event.target.value as SandboxMode)}
            >
              {sandboxModes.map((mode) => (
                <option key={mode} value={mode}>
                  {mode}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="form-actions">
          <button type="submit" disabled={loading || prompt.trim().length < 5}>
            {loading ? "生成中..." : "生成可视化草案"}
          </button>
          <p>未配置的 Provider 会自动禁用。当前支持 dry-run 校验、任务持久化与历史回看。</p>
        </div>
      </form>
    </section>
  );
}
