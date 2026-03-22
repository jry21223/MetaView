import { useEffect, useEffectEvent, useId, useState } from "react";
import type {
  ChangeEvent,
  ClipboardEvent as ReactClipboardEvent,
  DragEvent as ReactDragEvent,
} from "react";

interface ImageUploadFieldProps {
  imageDataUrl: string | null;
  imageName: string | null;
  routerProviderSupportsVision: boolean;
  generationProviderSupportsVision: boolean;
  onChange: (value: string | null, name: string | null) => void;
}

const maxImageSizeBytes = 2_500_000;

function extractImageFile(items: DataTransferItemList | null | undefined): File | null {
  if (!items) {
    return null;
  }

  for (const item of Array.from(items)) {
    if (item.kind === "file") {
      const file = item.getAsFile();
      if (file?.type.startsWith("image/")) {
        return file;
      }
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

export function ImageUploadField({
  imageDataUrl,
  imageName,
  routerProviderSupportsVision,
  generationProviderSupportsVision,
  onChange,
}: ImageUploadFieldProps) {
  const inputId = useId();
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File | null) {
    if (!file) {
      return;
    }

    if (!file.type.startsWith("image/")) {
      setError("仅支持图片文件。");
      return;
    }

    if (file.size > maxImageSizeBytes) {
      setError("图片请控制在 2.5 MB 以内，避免请求体过大。");
      return;
    }

    try {
      const dataUrl = await readAsDataUrl(file);
      onChange(dataUrl, resolveDisplayName(file));
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "图片读取失败");
    }
  }

  function handleInputChange(event: ChangeEvent<HTMLInputElement>) {
    void handleFile(event.target.files?.[0] ?? null);
    event.target.value = "";
  }

  function handlePaste(event: ReactClipboardEvent<HTMLElement>) {
    const file = extractImageFile(event.clipboardData?.items);
    if (!file) {
      return;
    }
    event.preventDefault();
    void handleFile(file);
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
    <section className="upload-module">
      <div
        className={`upload-dropzone ${dragActive ? "is-drag-active" : ""} ${
          imageDataUrl ? "has-image" : ""
        }`.trim()}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onPaste={handlePaste}
        tabIndex={0}
      >
        <div className="upload-copy">
          <span className="panel-kicker">Image Input</span>
          <strong>{imageDataUrl ? "题图已就绪" : "上传题目图片"}</strong>
          <p>
            支持拖拽到网页、点击选择文件，或直接粘贴截图。适合几何题、物理题和结构题。
          </p>
        </div>

        <div className="upload-actions">
          <label className="video-action upload-action" htmlFor={inputId}>
            选择图片
          </label>
          {imageDataUrl ? (
            <button
              type="button"
              className="ghost-button"
              onClick={() => {
                onChange(null, null);
                setError(null);
              }}
            >
              清除题图
            </button>
          ) : null}
          <input
            id={inputId}
            type="file"
            accept="image/*"
            className="upload-native-input"
            onChange={handleInputChange}
          />
        </div>

        {imageDataUrl ? (
          <div className="upload-preview">
            <img className="upload-preview-image" src={imageDataUrl} alt={imageName ?? "题图预览"} />
            <div className="upload-preview-meta">
              <strong>{imageName ?? "已附带图片"}</strong>
              <span>图片会作为静态题图发送到支持视觉的阶段。</span>
            </div>
          </div>
        ) : null}
      </div>

      <div className="upload-notes">
        <span>{imageName ? `当前文件：${imageName}` : "未附带题图"}</span>
        <span>支持 png / jpg / webp</span>
        <span>建议 2.5 MB 以内</span>
      </div>

      {error ? <p className="error-text">{error}</p> : null}
      {!routerProviderSupportsVision && imageName ? (
        <p className="field-hint">
          当前路由模型未声明视觉能力，题图不会发送给路由阶段。
        </p>
      ) : null}
      {!generationProviderSupportsVision && imageName ? (
        <p className="field-hint">
          当前规划/编码模型未声明视觉能力，题图不会发送给远程模型。
        </p>
      ) : null}
    </section>
  );
}
