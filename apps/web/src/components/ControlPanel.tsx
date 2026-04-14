import {
  useEffect,
  useEffectEvent,
  useId,
  useState,
  type ChangeEvent,
  type DragEvent as ReactDragEvent,
  type FormEvent,
} from "react";

import type { ModelProvider, OutputMode, ProviderDescriptor, SandboxMode } from "../types";
import type { SkillDescriptor } from "../types";
import type { TtsAvailability } from "../utils/tts";

interface ControlPanelProps {
  outputMode: OutputMode;
  layoutMode?: "hero" | "split";
  prompt: string;
  sourceImage: string | null;
  detectedSourceLanguage: string;
  routerProvider: ModelProvider;
  generationProvider: ModelProvider;
  sandboxMode: SandboxMode;
  enableNarration: boolean;
  ttsAvailability: TtsAvailability;
  skills: SkillDescriptor[];
  providers: ProviderDescriptor[];
  sandboxModes: SandboxMode[];
  loading: boolean;
  sourceImageName: string | null;
  routerProviderSupportsVision: boolean;
  generationProviderSupportsVision: boolean;
  onOutputModeChange: (value: OutputMode) => void;
  onPromptChange: (value: string) => void;
  onRouterProviderChange: (value: ModelProvider) => void;
  onGenerationProviderChange: (value: ModelProvider) => void;
  onSandboxModeChange: (value: SandboxMode) => void;
  onEnableNarrationChange: (value: boolean) => void;
  onSourceImageChange: (value: string | null, name: string | null) => void;
  onStartNewQuestion: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}

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
  outputMode,
  layoutMode = "hero",
  prompt,
  sourceImage,
  detectedSourceLanguage,
  routerProvider,
  generationProvider,
  sandboxMode,
  enableNarration,
  ttsAvailability,
  providers,
  sandboxModes,
  loading,
  sourceImageName,
  routerProviderSupportsVision,
  generationProviderSupportsVision,
  onOutputModeChange,
  onPromptChange,
  onRouterProviderChange,
  onGenerationProviderChange,
  onSandboxModeChange,
  onEnableNarrationChange,
  onSourceImageChange,
  onSubmit,
}: ControlPanelProps) {
  const imageInputId = useId();
  const configuredProvidersCount = providers.filter((provider) => provider.configured).length;
  const hasDetectedSourceCode = detectedSourceLanguage.length > 0;
  const canSubmit = !loading && prompt.trim().length >= 5 && configuredProvidersCount > 0;
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
        <span className="panel-kicker">Smart Mode</span>
        <h1>想问什么直接问</h1>
        <p>题目、源码、题图都可以。系统会自动判断模块并优先生成 HTML 交互，也可切换为视频。</p>
      </div>

      <form className="composer-form" onSubmit={onSubmit}>
        <input
          id={imageInputId}
          className="composer-upload-input"
          type="file"
          accept="image/*"
          onChange={handleInputFileChange}
        />

        <div
          className={`composer-search-shell ${dragActive ? "is-drag-active" : ""} ${
            sourceImage ? "has-attachment" : ""
          }`.trim()}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <div className="composer-search-intro">
            <span className="composer-search-kicker">统一输入入口</span>
            <p className="composer-search-description">
              支持自然语言、源码与题图联合提交，系统会自动选择讲解路径并生成结果。
            </p>
          </div>

          <div className={`composer-container ${prompt.trim() ? "is-active" : ""}`}>
            <textarea
              className="composer-input"
              value={prompt}
              onChange={(event) => onPromptChange(event.target.value)}
              placeholder="描述您想生成的可视化场景..."
              rows={4}
            />

            {sourceImage ? (
              <div className="composer-inline-attachment">
                <span className="material-symbols-outlined" style={{ fontSize: "16px" }}>image</span>
                <span className="composer-inline-attachment-name">
                  {sourceImageName ?? "已附带题图"}
                </span>
                <button
                  type="button"
                  className="icon-button composer-inline-attachment-remove"
                  onClick={() => onSourceImageChange(null, null)}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: "14px" }}>close</span>
                </button>
              </div>
            ) : null}

            <div className="composer-search-actions">
              <button
                type="button"
                className="composer-attach-button"
                title="上传参考图片"
                onClick={() => {
                  const imageInput = document.getElementById(imageInputId) as HTMLInputElement | null;
                  imageInput?.click();
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: "18px" }}>attach_file</span>
                题图
              </button>

              <button
                type="submit"
                className="btn btn-primary composer-submit"
                disabled={!canSubmit}
              >
                {loading ? (
                  <>
                    <span className="material-symbols-outlined rotating" style={{ fontSize: "18px" }}>
                      progress_activity
                    </span>
                    生成中
                  </>
                ) : configuredProvidersCount === 0 ? (
                  <>
                    请先配置 Provider
                    <span className="material-symbols-outlined" style={{ fontSize: "18px" }}>
                      settings
                    </span>
                  </>
                ) : (
                  <>
                    {outputMode === "html" ? "生成 HTML" : "生成视频"}
                    <span className="material-symbols-outlined" style={{ fontSize: "18px" }}>
                      magic_button
                    </span>
                  </>
                )}
              </button>
            </div>
          </div>

          <div className="composer-meta">
            <span>自动判断学科与镜头结构</span>
            {configuredProvidersCount > 0 ? (
              <span>{configuredProvidersCount} 个 provider 可用</span>
            ) : (
              <span className="composer-meta-warning">
                <span className="material-symbols-outlined" style={{ fontSize: 14 }}>warning</span>
                尚未配置 Provider —
                <a href="#tools" className="composer-meta-link">前往设置</a>
              </span>
            )}
            {hasDetectedSourceCode ? <span>已自动识别源码</span> : null}
            {sourceImageName ? <span>已附带题图</span> : null}
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
            className={`composer-toggle-button ${outputMode === "video" ? "is-active" : ""}`}
            onClick={() => onOutputModeChange("video")}
          >
            视频预览
          </button>
          <button
            type="button"
            className={`composer-toggle-button ${outputMode === "html" ? "is-active" : ""}`}
            onClick={() => onOutputModeChange("html")}
          >
            HTML 交互
          </button>
        </div>

        <details className="composer-advanced composer-advanced-card">
          <summary className="composer-advanced-summary">
            <span>高级设置</span>
            <span className="composer-advanced-summary-text">配音、模型与沙盒配置</span>
          </summary>

          <div className="prompt-form prompt-form-advanced">
            <label className="toggle-field">
              <div>
                <span>视频配音</span>
                <p className="field-hint">
                  {ttsAvailability.available
                    ? "开启后会在渲染完成时自动生成中文旁白并嵌入视频。"
                    : `${ttsAvailability.reason}。请先在设置页配置 TTS 服务。`}
                </p>
              </div>
              <button
                type="button"
                className={`switch-button ${enableNarration && ttsAvailability.available ? "is-active" : ""}`}
                onClick={() => onEnableNarrationChange(!enableNarration)}
                aria-pressed={enableNarration}
                disabled={!ttsAvailability.available}
                style={{ opacity: ttsAvailability.available ? 1 : 0.5, cursor: ttsAvailability.available ? "pointer" : "not-allowed" }}
              >
                <span />
                <strong>{!ttsAvailability.available ? "不可用" : enableNarration ? "开启" : "关闭"}</strong>
              </button>
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
            </div>

            <div className="select-grid">
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

              <label>
                <span>源码识别</span>
                <input
                  value={hasDetectedSourceCode ? (detectedSourceLanguage === "cpp" ? "已识别为 C++" : "已识别为 Python") : "未识别到源码块"}
                  readOnly
                />
              </label>
            </div>
          </div>
        </details>
      </form>
    </section>
  );
}
