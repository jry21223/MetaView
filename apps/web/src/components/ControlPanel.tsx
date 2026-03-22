import type { FormEvent } from "react";

import { domainLabels } from "../domainPresentation";
import { ImageUploadField } from "./ImageUploadField";
import type { ModelProvider, ProviderDescriptor, SandboxMode } from "../types";
import type { SkillDescriptor, TopicDomain } from "../types";

interface ControlPanelProps {
  deckMode: "smart" | "expert";
  layoutMode?: "hero" | "split";
  selectedDomain: TopicDomain | null;
  prompt: string;
  sourceImage: string | null;
  sourceCode: string;
  sourceCodeLanguage: string;
  routerProvider: ModelProvider;
  generationProvider: ModelProvider;
  sandboxMode: SandboxMode;
  enableNarration: boolean;
  skills: SkillDescriptor[];
  providers: ProviderDescriptor[];
  sandboxModes: SandboxMode[];
  loading: boolean;
  sourceImageName: string | null;
  routerProviderSupportsVision: boolean;
  generationProviderSupportsVision: boolean;
  onDeckModeChange: (value: "smart" | "expert") => void;
  onSelectDomain: (value: TopicDomain) => void;
  onPromptChange: (value: string) => void;
  onSourceCodeChange: (value: string) => void;
  onSourceCodeLanguageChange: (value: string) => void;
  onRouterProviderChange: (value: ModelProvider) => void;
  onGenerationProviderChange: (value: ModelProvider) => void;
  onSandboxModeChange: (value: SandboxMode) => void;
  onEnableNarrationChange: (value: boolean) => void;
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
  deckMode,
  layoutMode = "hero",
  selectedDomain,
  prompt,
  sourceImage,
  sourceCode,
  sourceCodeLanguage,
  routerProvider,
  generationProvider,
  sandboxMode,
  enableNarration,
  skills,
  providers,
  sandboxModes,
  loading,
  sourceImageName,
  routerProviderSupportsVision,
  generationProviderSupportsVision,
  onDeckModeChange,
  onSelectDomain,
  onPromptChange,
  onSourceCodeChange,
  onSourceCodeLanguageChange,
  onRouterProviderChange,
  onGenerationProviderChange,
  onSandboxModeChange,
  onEnableNarrationChange,
  onSourceImageChange,
  onSubmit,
}: ControlPanelProps) {
  const configuredProvidersCount = providers.filter((provider) => provider.configured).length;
  const hasSourceCode = sourceCode.trim().length > 0;
  const canSubmit =
    !loading &&
    prompt.trim().length >= 5 &&
    (deckMode === "smart" || selectedDomain !== null);

  return (
    <section className={`composer-panel ${layoutMode === "split" ? "is-split" : ""}`.trim()}>
      <div className="composer-copy">
        <span className="panel-kicker">
          {deckMode === "smart" ? "Smart Mode" : "Expert Mode"}
        </span>
        <h1>{deckMode === "smart" ? "想问什么直接问" : "指定学科后再提问"}</h1>
        <p>
          {deckMode === "smart"
            ? "题目、源码、题图都可以。系统会自动判断模块并直接生成视频。"
            : "先选定学科，再把问题交给对应模块处理。"}
        </p>
      </div>

      <form className="composer-form" onSubmit={onSubmit}>
        <div className="composer-search-shell">
          <textarea
            className="composer-input"
            value={prompt}
            onChange={(event) => onPromptChange(event.target.value)}
            placeholder={genericPlaceholder}
            rows={3}
          />
          <button
            type="submit"
            className="composer-submit"
            disabled={!canSubmit}
          >
            {loading ? "生成中..." : "生成视频"}
          </button>
        </div>

        <div className="composer-toggle">
          <button
            type="button"
            className={`composer-toggle-button ${deckMode === "smart" ? "is-active" : ""}`}
            onClick={() => onDeckModeChange("smart")}
          >
            智能模式
          </button>
          <button
            type="button"
            className={`composer-toggle-button ${deckMode === "expert" ? "is-active" : ""}`}
            onClick={() => onDeckModeChange("expert")}
          >
            专家模式
          </button>
        </div>

        {deckMode === "expert" ? (
          skills.length > 0 ? (
            <div className="composer-chip-grid">
              {skills.map((skill) => (
                <button
                  key={skill.id}
                  type="button"
                  className={`composer-chip ${selectedDomain === skill.domain ? "is-active" : ""}`}
                  onClick={() => onSelectDomain(skill.domain)}
                >
                  {domainLabels[skill.domain] ?? skill.domain}
                </button>
              ))}
            </div>
          ) : (
            <p className="composer-chip-empty">当前还没有可用学科模块。</p>
          )
        ) : null}

        <div className="composer-meta">
          <span>
            {deckMode === "smart"
              ? "自动判断学科与镜头结构"
              : `当前学科：${selectedDomain ? domainLabels[selectedDomain] : "未选择"}`}
          </span>
          <span>{configuredProvidersCount} 个 provider 可用</span>
          {hasSourceCode ? <span>已附带源码</span> : null}
          {sourceImageName ? <span>已附带题图</span> : null}
        </div>

        <ImageUploadField
          imageDataUrl={sourceImage}
          imageName={sourceImageName}
          routerProviderSupportsVision={routerProviderSupportsVision}
          generationProviderSupportsVision={generationProviderSupportsVision}
          onChange={onSourceImageChange}
        />

        <details className="composer-advanced">
          <summary className="composer-advanced-summary">高级设置</summary>

          <div className="prompt-form prompt-form-advanced">
            <label className="toggle-field">
              <div>
                <span>视频配音</span>
                <p className="field-hint">
                  开启后会在渲染完成时尝试用 `mimotts-v2` 生成中文旁白并嵌入视频。
                </p>
              </div>
              <button
                type="button"
                className={`switch-button ${enableNarration ? "is-active" : ""}`}
                onClick={() => onEnableNarrationChange(!enableNarration)}
                aria-pressed={enableNarration}
              >
                <span />
                <strong>{enableNarration ? "开启" : "关闭"}</strong>
              </button>
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
            </div>

            <div className="select-grid">
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

            <label>
              <span>源码输入</span>
              <textarea
                value={sourceCode}
                onChange={(event) => onSourceCodeChange(event.target.value)}
                placeholder="可选。粘贴 Python 或 C++ 源码后，系统会尽量按真实代码执行顺序生成动画。"
                rows={8}
              />
            </label>
          </div>
        </details>
      </form>
    </section>
  );
}
