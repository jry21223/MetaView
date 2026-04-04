import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type ThemeMode = "dark" | "light";

export type HtmlSandboxLoadState = "loading" | "loaded" | "error";

interface HtmlSandboxProps {
  /** URL to the HTML file served by the backend */
  src?: string;
  /** Inline HTML content for local debugging or direct preview */
  srcDoc?: string;
  /** Send a goToStep message to the iframe */
  goToStep?: number | null;
  /** Playback state */
  playback?: { autoplay: boolean; paused: boolean; speed: number };
  /** Parameters for the rendering */
  params?: Record<string, string>;
  /** Current app theme to sync into iframe */
  theme?: ThemeMode;
  /** Whether to wait for the embedded HTML runtime to emit a ready signal */
  expectReadySignal?: boolean;
  /** Called when the iframe announces its total step count */
  onReady?: (totalSteps: number) => void;
  /** Called when the iframe navigates to a new step */
  onStepChange?: (index: number) => void;
  /** Called when iframe announces its capabilities */
  onCapabilities?: (caps: SandboxCapabilities) => void;
  /** Called when iframe load state changes */
  onLoadStateChange?: (state: HtmlSandboxLoadState) => void;
}

export interface SandboxCapabilities {
  playback?: boolean;
  params?: boolean;
  theme?: boolean;
  reducedMotionAware?: boolean;
}

export function HtmlSandbox({
  src,
  srcDoc,
  goToStep,
  playback,
  params,
  theme = "dark",
  expectReadySignal = true,
  onReady,
  onStepChange,
  onCapabilities,
  onLoadStateChange,
}: HtmlSandboxProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const readyTimeoutRef = useRef<number | null>(null);
  const [readyPreviewKey, setReadyPreviewKey] = useState<string | null>(null);
  const [errorState, setErrorState] = useState<{ key: string; message: string } | null>(null);

  const previewKey = useMemo(
    () => `${src ?? ""}::${srcDoc ?? ""}`,
    [src, srcDoc],
  );
  const isReady = readyPreviewKey === previewKey;
  const errorMessage = errorState?.key === previewKey ? errorState.message : null;
  const loading = !isReady && errorMessage == null;

  const locationLabel = srcDoc ? "inline HTML (srcDoc)" : src ?? "about:blank";

  const clearReadyTimeout = useCallback(() => {
    if (readyTimeoutRef.current != null) {
      window.clearTimeout(readyTimeoutRef.current);
      readyTimeoutRef.current = null;
    }
  }, []);

  const postToIframe = useCallback((message: Record<string, unknown>) => {
    iframeRef.current?.contentWindow?.postMessage(message, "*");
  }, []);

  const armReadyTimeout = useCallback(() => {
    clearReadyTimeout();
    readyTimeoutRef.current = window.setTimeout(() => {
      setErrorState({
        key: previewKey,
        message:
          "HTML 预览文件已加载，但没有完成运行时初始化。通常表示生成的 HTML 缺少必需脚本或启动逻辑。",
      });
      onLoadStateChange?.("error");
    }, 2500);
  }, [clearReadyTimeout, onLoadStateChange, previewKey]);

  const handleMessage = useCallback(
    (event: MessageEvent) => {
      if (iframeRef.current?.contentWindow !== event.source) {
        return;
      }

      const data = event.data;
      if (!data || typeof data !== "object" || !("type" in data)) {
        return;
      }

      switch (data.type) {
        case "ready": {
          clearReadyTimeout();
          setReadyPreviewKey(previewKey);
          setErrorState(null);
          onLoadStateChange?.("loaded");
          if (typeof data.totalSteps === "number") {
            onReady?.(data.totalSteps);
          }
          if (data.capabilities) {
            onCapabilities?.(data.capabilities as SandboxCapabilities);
          }
          postToIframe({ type: "theme", theme });
          if (playback) {
            postToIframe({ type: "playback", ...playback });
          }
          if (params) {
            Object.entries(params).forEach(([key, value]) => {
              postToIframe({ type: "setParam", key, value });
            });
          }
          break;
        }
        case "step": {
          if (typeof data.index === "number") {
            onStepChange?.(data.index);
          }
          break;
        }
        case "playback": {
          break;
        }
        case "paramChange": {
          break;
        }
      }
    },
    [
      clearReadyTimeout,
      onReady,
      onStepChange,
      onCapabilities,
      onLoadStateChange,
      params,
      playback,
      postToIframe,
      theme,
      previewKey,
    ],
  );

  useEffect(() => {
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [handleMessage]);

  useEffect(() => {
    if (goToStep == null || !isReady) return;
    postToIframe({ type: "goToStep", index: goToStep });
  }, [goToStep, isReady, postToIframe]);

  useEffect(() => {
    if (!playback || !isReady) return;
    postToIframe({ type: "playback", ...playback });
  }, [isReady, playback, postToIframe]);

  useEffect(() => {
    if (!params || !isReady) return;
    Object.entries(params).forEach(([key, value]) => {
      postToIframe({ type: "setParam", key, value });
    });
  }, [isReady, params, postToIframe]);

  useEffect(() => {
    if (!isReady) return;
    postToIframe({ type: "theme", theme });
  }, [isReady, postToIframe, theme]);

  useEffect(() => {
    clearReadyTimeout();
    return clearReadyTimeout;
  }, [clearReadyTimeout]);

  return (
    <div className="html-sandbox-container">
      {loading && !errorMessage && (
        <div className="html-sandbox-loading">
          <div className="generation-spinner">
            <div className="generation-spinner-ring" />
            <span className="material-symbols-outlined generation-spinner-icon" style={{ fontSize: 24 }}>
              code
            </span>
          </div>
          <span style={{ color: "var(--on-surface-variant)", fontSize: "0.875rem" }}>
            加载交互动画...
          </span>
        </div>
      )}
      {errorMessage ? (
        <div className="html-sandbox-error" role="alert">
          <strong>HTML 预览未正常启动</strong>
          <span>{errorMessage}</span>
          <code>{locationLabel}</code>
        </div>
      ) : null}
      <iframe
        key={previewKey}
        ref={iframeRef}
        src={src}
        srcDoc={srcDoc}
        className="html-sandbox-iframe"
        sandbox="allow-scripts"
        title="HTML 交互动画"
        loading="eager"
        onLoad={() => {
          setErrorState(null);
          if (expectReadySignal) {
            onLoadStateChange?.("loading");
            armReadyTimeout();
            postToIframe({ type: "theme", theme });
            return;
          }
          clearReadyTimeout();
          setReadyPreviewKey(previewKey);
          onLoadStateChange?.("loaded");
        }}
      />
    </div>
  );
}
