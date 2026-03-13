import type { ChangeEvent, FormEvent } from "react";

import type { ModelProvider, ProviderDescriptor, SandboxMode } from "../types";

interface ControlPanelProps {
  prompt: string;
  provider: ModelProvider;
  sandboxMode: SandboxMode;
  providers: ProviderDescriptor[];
  sandboxModes: SandboxMode[];
  loading: boolean;
  sourceImageName: string | null;
  providerSupportsVision: boolean;
  onPromptChange: (value: string) => void;
  onProviderChange: (value: ModelProvider) => void;
  onSandboxModeChange: (value: SandboxMode) => void;
  onSourceImageChange: (value: string | null, name: string | null) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}

const genericPlaceholder =
  "例如：请讲解二分查找边界收缩；或说明定积分如何逼近面积；或根据题图分析斜面小球受力。";

export function ControlPanel({
  prompt,
  provider,
  sandboxMode,
  providers,
  sandboxModes,
  loading,
  sourceImageName,
  providerSupportsVision,
  onPromptChange,
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
        <h1>统一输入，模型自动判断学科与渲染 skill</h1>
        <p>
          当前版本不再要求手动选择学科。系统会根据题目文本与可选题图，自动路由到算法、数学、物理、化学、生物或地理 skill。
        </p>
      </div>

      <form className="prompt-form" onSubmit={onSubmit}>
        <label>
          <span>题目描述</span>
          <textarea
            value={prompt}
            onChange={(event) => onPromptChange(event.target.value)}
            placeholder={genericPlaceholder}
            rows={8}
          />
        </label>

        <label>
          <span>题目图片</span>
          <input type="file" accept="image/*" onChange={handleImageInput} />
          <small className="field-hint">
            {sourceImageName
              ? `当前已附带题图：${sourceImageName}`
              : "可选。物理题、几何题或结构题推荐上传图片，系统会自动辅助建模。"}
          </small>
          {!providerSupportsVision && sourceImageName ? (
            <small className="field-hint">
              当前 Provider 未声明视觉能力，题图不会发送给远程模型，但系统仍会用于自动路由与本地辅助规划。
            </small>
          ) : null}
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
          <p>未配置的 Provider 会自动禁用。当前支持自动学科判断、dry-run 校验、历史回看与自定义 Provider。</p>
        </div>
      </form>
    </section>
  );
}
