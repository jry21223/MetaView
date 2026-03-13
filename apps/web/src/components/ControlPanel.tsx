import type { ChangeEvent, FormEvent } from "react";

import type { ModelProvider, ProviderDescriptor, SandboxMode, TopicDomain } from "../types";

interface ControlPanelProps {
  prompt: string;
  domain: TopicDomain;
  provider: ModelProvider;
  sandboxMode: SandboxMode;
  providers: ProviderDescriptor[];
  sandboxModes: SandboxMode[];
  loading: boolean;
  sourceImageName: string | null;
  onPromptChange: (value: string) => void;
  onDomainChange: (value: TopicDomain) => void;
  onProviderChange: (value: ModelProvider) => void;
  onSandboxModeChange: (value: SandboxMode) => void;
  onSourceImageChange: (value: string | null, name: string | null) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}

const promptPlaceholders: Record<TopicDomain, string> = {
  algorithm: "例如：请可视化讲解二分查找的边界收缩过程，突出 left / mid / right 的变化。",
  math: "例如：请讲解定积分如何通过黎曼和逼近面积，并展示极限过程。",
  physics: "例如：请根据题目中的受力关系讲解斜面小球的加速度与运动轨迹。",
  chemistry: "例如：请讲解 SN2 反应中键断裂与成键的空间构型变化。",
  biology: "例如：请可视化讲解有丝分裂各阶段中染色体与细胞结构的变化。",
  geography: "例如：请讲解水循环中蒸发、输送、降水与径流的空间流转过程。",
};

export function ControlPanel({
  prompt,
  domain,
  provider,
  sandboxMode,
  providers,
  sandboxModes,
  loading,
  sourceImageName,
  onPromptChange,
  onDomainChange,
  onProviderChange,
  onSandboxModeChange,
  onSourceImageChange,
  onSubmit,
}: ControlPanelProps) {
  async function handleImageInput(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    if (!file) {
      onSourceImageChange(null, null);
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : null;
      onSourceImageChange(result, file.name);
    };
    reader.readAsDataURL(file);
  }

  return (
    <section className="panel panel-form">
      <div className="panel-header">
        <span className="panel-kicker">Prompt Studio</span>
        <h1>基于 Skill Routing 的多学科可视化工作台</h1>
        <p>
          当前版本已经支持算法、数学、物理、化学、生物和地理 skill，并允许物理题从静态题图提取对象关系后生成动画草案。
        </p>
      </div>

      <form className="prompt-form" onSubmit={onSubmit}>
        <label>
          <span>题目描述</span>
          <textarea
            value={prompt}
            onChange={(event) => onPromptChange(event.target.value)}
            placeholder={promptPlaceholders[domain]}
            rows={8}
          />
        </label>

        <label>
          <span>学科</span>
          <select
            value={domain}
            onChange={(event) => onDomainChange(event.target.value as TopicDomain)}
          >
            <option value="algorithm">计算机与算法</option>
            <option value="math">数学</option>
            <option value="physics">物理</option>
            <option value="chemistry">化学</option>
            <option value="biology">生物</option>
            <option value="geography">地理</option>
          </select>
        </label>

        {domain === "physics" ? (
          <label>
            <span>物理题图</span>
            <input type="file" accept="image/*" onChange={handleImageInput} />
            <small className="field-hint">
              {sourceImageName
                ? `当前已附带题图：${sourceImageName}`
                : "可选。上传静态题目图片后，Planner 会先提取受力对象、约束和已知量。"}
            </small>
            {sourceImageName ? (
              <button
                type="button"
                className="inline-action"
                onClick={() => onSourceImageChange(null, null)}
              >
                清除题图
              </button>
            ) : null}
          </label>
        ) : null}

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
          <p>未配置的 Provider 会自动禁用。当前支持 dry-run 校验、任务持久化、历史回看和物理题图辅助建模。</p>
        </div>
      </form>
    </section>
  );
}
