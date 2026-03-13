import type { FormEvent } from "react";

import type { TopicDomain } from "../types";

interface ControlPanelProps {
  prompt: string;
  domain: TopicDomain;
  loading: boolean;
  onPromptChange: (value: string) => void;
  onDomainChange: (value: TopicDomain) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}

export function ControlPanel({
  prompt,
  domain,
  loading,
  onPromptChange,
  onDomainChange,
  onSubmit,
}: ControlPanelProps) {
  return (
    <section className="panel panel-form">
      <div className="panel-header">
        <span className="panel-kicker">Prompt Studio</span>
        <h1>基于 CIR 的算法与高数可视化工作台</h1>
        <p>
          当前版本先打通 Planner、Coder、Critic 的后端链路，并在浏览器中用原生
          Canvas 做即时预览。
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
          <select value={domain} onChange={(event) => onDomainChange(event.target.value as TopicDomain)}>
            <option value="algorithm">算法</option>
            <option value="math">高等数学</option>
          </select>
        </label>

        <div className="form-actions">
          <button type="submit" disabled={loading || prompt.trim().length < 5}>
            {loading ? "生成中..." : "生成可视化草案"}
          </button>
          <p>后续这里会接入模型选择、点数消耗、沙盒 dry-run 和导出策略。</p>
        </div>
      </form>
    </section>
  );
}

