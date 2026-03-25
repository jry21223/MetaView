import {
  useEffect,
  useEffectEvent,
  useId,
  useState,
  type ChangeEvent,
  type DragEvent as ReactDragEvent,
  type FormEvent,
} from "react";

import { domainLabels } from "../domainPresentation";
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
  onStartNewQuestion: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}

const genericPlaceholder =
  "例如：请讲解二分查找边界收缩；或说明定积分如何逼近面积；或根据题图分析斜面小球受力。";
const maxImageSizeBytes = 2_500_000;

function extractImageFile(items: DataTransferItemList | null | undefined): File | null {
  if (!items) {
    return null;
  }

  for (const item of Array.from(items)) {
    if (item.kind !== "file") {
      continue;
    }

    const file = item.getAsFile();
    if (file?.type.startsWith("image/")) {
      return file;
    }
  }

  return null;
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }
      reject(new Error("图片读取失败"));
    };
    reader.onerror = () => reject(new Error("图片读取失败"));
    reader.readAsDataURL(file);
  });
}

function resolveDisplayName(file: File): string {
  return file.name || `pasted-image-${Date.now()}.png`;
}

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
  onStartNewQuestion,
  onSubmit,
}: ControlPanelProps) {
  const imageInputId = useId();
  const configuredProvidersCount = providers.filter((provider) => provider.configured).length;
  const hasSourceCode = sourceCode.trim().length > 0;
  const canSubmit =
    !loading &&
    prompt.trim().length >= 5 &&
    (deckMode === "smart" || selectedDomain !== null);
  const [dragActive, setDragActive] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);

  async function handleFile(file: File | null) {
    if (!file) {
      return;
    }

    if (!file.type.startsWith("image/")) {
      setImageError("仅支持图片文件。");
      return;
    }

    if (file.size > maxImageSizeBytes) {
      setImageError("图片请控制在 2.5 MB 以内，避免请求体过大。");
      return;
    }

    try {
      const dataUrl = await readAsDataUrl(file);
      onSourceImageChange(dataUrl, resolveDisplayName(file));
      setImageError(null);
    } catch (loadError) {
      setImageError(loadError instanceof Error ? loadError.message : "图片读取失败");
    }
  }

  function handleInputFileChange(event: ChangeEvent<HTMLInputElement>) {
    void handleFile(event.target.files?.[0] ?? null);
    event.target.value = "";
  }

  function handleDragOver(event: ReactDragEvent<HTMLElement>) {
    const hasImage = Array.from(event.dataTransfer.items).some(
      (item) => item.kind === "file" && item.type.startsWith("image/"),
    );
    if (!hasImage) {
      return;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    setDragActive(true);
  }

  function handleDragLeave(event: ReactDragEvent<HTMLElement>) {
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) {
      return;
    }

    setDragActive(false);
  }

  function handleDrop(event: ReactDragEvent<HTMLElement>) {
    event.preventDefault();
    setDragActive(false);
    const file = Array.from(event.dataTransfer.files).find((item) =>
      item.type.startsWith("image/"),
    );
    void handleFile(file ?? null);
  }

  const handleWindowPasteFile = useEffectEvent((file: File | null) => {
    void handleFile(file);
  });

  useEffect(() => {
    function handleWindowPaste(event: ClipboardEvent) {
      const file = extractImageFile(event.clipboardData?.items);
      if (!file) {
        return;
      }

      event.preventDefault();
      handleWindowPasteFile(file);
    }

    window.addEventListener("paste", handleWindowPaste);
    return () => window.removeEventListener("paste", handleWindowPaste);
  }, []);

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
        <div
          className={`composer-search-shell ${dragActive ? "is-drag-active" : ""} ${
            sourceImage ? "has-attachment" : ""
          }`.trim()}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <textarea
            className="composer-input"
            value={prompt}
            onChange={(event) => onPromptChange(event.target.value)}
            placeholder={genericPlaceholder}
            rows={3}
          />

          {sourceImage ? (
            <div className="composer-attachment">
              <img
                className="composer-attachment-image"
                src={sourceImage}
                alt={sourceImageName ?? "题图预览"}
              />
              <div className="composer-attachment-copy">
                <strong>{sourceImageName ?? "已附带题图"}</strong>
                <span>题图会随请求发送到支持视觉的阶段，用于识别题面与图形关系。</span>
              </div>
              <button
                type="button"
                className="ghost-button composer-attachment-clear"
                onClick={() => {
                  onSourceImageChange(null, null);
                  setImageError(null);
                }}
              >
                移除图片
              </button>
            </div>
          ) : null}

          <div className="composer-search-actions">
            <div className="composer-inline-tools">
              <label className="composer-attach-button" htmlFor={imageInputId}>
                上传图片
              </label>
              {dragActive ? <span className="composer-inline-hint">松开即可附带题图</span> : null}
              <input
                id={imageInputId}
                type="file"
                accept="image/*"
                className="composer-upload-input"
                onChange={handleInputFileChange}
              />
            </div>

            <div className="composer-primary-actions">
              <button
                type="button"
                className="ghost-button composer-reset-button"
                onClick={onStartNewQuestion}
              >
                新建问题
              </button>
              <button
                type="submit"
                className="composer-submit"
                disabled={!canSubmit}
              >
                {loading ? "生成中..." : "生成视频"}
              </button>
            </div>
          </div>
        </div>

        {imageError ? <p className="error-text composer-upload-feedback">{imageError}</p> : null}
        {!routerProviderSupportsVision && sourceImageName ? (
          <p className="field-hint composer-upload-feedback">
            当前路由模型未声明视觉能力，题图不会发送给路由阶段。
          </p>
        ) : null}
        {!generationProviderSupportsVision && sourceImageName ? (
          <p className="field-hint composer-upload-feedback">
            当前规划/编码模型未声明视觉能力，题图不会发送给远程模型。
          </p>
        ) : null}

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
