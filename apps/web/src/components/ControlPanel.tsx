import type { ChangeEvent, FormEvent } from "react";

import type { ModelProvider, ProviderDescriptor, SandboxMode } from "../types";

interface ControlPanelProps {
  prompt: string;
  sourceCode: string;
  sourceCodeLanguage: string;
  routerProvider: ModelProvider;
  generationProvider: ModelProvider;
  sandboxMode: SandboxMode;
  providers: ProviderDescriptor[];
  sandboxModes: SandboxMode[];
  loading: boolean;
  sourceImageName: string | null;
  routerProviderSupportsVision: boolean;
  generationProviderSupportsVision: boolean;
  onPromptChange: (value: string) => void;
  onSourceCodeChange: (value: string) => void;
  onSourceCodeLanguageChange: (value: string) => void;
  onRouterProviderChange: (value: ModelProvider) => void;
  onGenerationProviderChange: (value: ModelProvider) => void;
  onSandboxModeChange: (value: SandboxMode) => void;
  onSourceImageChange: (value: string | null, name: string | null) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}

const genericPlaceholder =
  "例如：请讲解二分查找边界收缩；或说明定积分如何逼近面积；或根据题图分析斜面小球受力。";

function routerModelLabel(provider: ProviderDescriptor): string {
  return provider.stage_models.router ?? provider.model;
}

function generationModelLabel(provider: ProviderDescriptor): string {
  const planningModel = provider.stage_models.planning ?? provider.model;
  const codingModel = provider.stage_models.coding ?? planningModel;
  if (planningModel === codingModel) {
    return planningModel;
  }
  return `规划 ${planningModel} / 编码 ${codingModel}`;
}

export function ControlPanel({
  prompt,
  sourceCode,
  sourceCodeLanguage,
  routerProvider,
  generationProvider,
  sandboxMode,
  providers,
  sandboxModes,
  loading,
  sourceImageName,
  routerProviderSupportsVision,
  generationProviderSupportsVision,
  onPromptChange,
  onSourceCodeChange,
  onSourceCodeLanguageChange,
  onRouterProviderChange,
  onGenerationProviderChange,
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
        <span className="panel-kicker">Prompt</span>
        <h1>输入题目，生成视频预览</h1>
        <p>先走后端渲染视频，保证 MVP 可交付；实时前端渲染后续再逐步完善。</p>
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

        <div className="select-grid">
          <label>
            <span>源码语言</span>
            <select
              value={sourceCodeLanguage}
              onChange={(event) => onSourceCodeLanguageChange(event.target.value)}
            >
              <option value="">未指定</option>
              <option value="python">Python</option>
              <option value="cpp">C++</option>
            </select>
          </label>
          <label>
            <span>源码输入</span>
            <textarea
              value={sourceCode}
              onChange={(event) => onSourceCodeChange(event.target.value)}
              placeholder="可选。粘贴 Python 或 C++ 算法源码后，系统会优先切到源码算法模块。"
              rows={8}
            />
          </label>
        </div>

        <label>
          <span>题目图片</span>
          <input type="file" accept="image/*" onChange={handleImageInput} />
          <small className="field-hint">
            {sourceImageName
              ? `当前已附带题图：${sourceImageName}`
              : "可选。物理题、几何题或结构题推荐上传图片，系统会自动辅助建模。"}
          </small>
          {!routerProviderSupportsVision && sourceImageName ? (
            <small className="field-hint">
              当前路由模型未声明视觉能力，题图不会发送给路由阶段，系统会回退到文本与本地规则辅助判断。
            </small>
          ) : null}
          {!generationProviderSupportsVision && sourceImageName ? (
            <small className="field-hint">
              当前规划/编码模型未声明视觉能力，题图不会发送给远程模型，但系统仍会用于自动路由与本地辅助规划。
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
            <span>路由模型</span>
            <select
              value={routerProvider}
              onChange={(event) => onRouterProviderChange(event.target.value as ModelProvider)}
            >
              {providers.map((item) => (
                <option key={item.name} value={item.name} disabled={!item.configured}>
                  {item.label} / {routerModelLabel(item)}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>规划/编码模型</span>
            <select
              value={generationProvider}
              onChange={(event) =>
                onGenerationProviderChange(event.target.value as ModelProvider)
              }
            >
              {providers.map((item) => (
                <option key={item.name} value={item.name} disabled={!item.configured}>
                  {item.label} / {generationModelLabel(item)}
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
            {loading ? "生成中..." : "生成预览视频"}
          </button>
          <p>未配置的 Provider 会自动禁用。</p>
        </div>
      </form>
    </section>
  );
}
