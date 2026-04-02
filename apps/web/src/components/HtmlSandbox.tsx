import { useCallback, useEffect, useRef, useState } from "react";

interface HtmlSandboxProps {
  /** URL to the HTML file served by the backend */
  src: string;
  /** Send a goToStep message to the iframe */
  goToStep?: number | null;
  /** Playback state */
  playback?: { autoplay: boolean; paused: boolean; speed: number };
  /** Parameters for the rendering */
  params?: Record<string, string>;
  /** Called when the iframe announces its total step count */
  onReady?: (totalSteps: number) => void;
  /** Called when the iframe navigates to a new step */
  onStepChange?: (index: number) => void;
  /** Called when iframe announces its capabilities */
  onCapabilities?: (caps: SandboxCapabilities) => void;
}

export interface SandboxCapabilities {
  playback?: boolean;
  params?: boolean;
  theme?: boolean;
  reducedMotionAware?: boolean;
}

export function HtmlSandbox({
  src,
  goToStep,
  playback,
  params,
  onReady,
  onStepChange,
  onCapabilities,
}: HtmlSandboxProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [loading, setLoading] = useState(true);

  const handleMessage = useCallback(
    (event: MessageEvent) => {
      // Security: verify event source
      if (iframeRef.current?.contentWindow !== event.source) {
        return;
      }

      const data = event.data;
      if (!data || typeof data !== "object" || !data.type) return;

      switch (data.type) {
        case "ready": {
          if (typeof data.totalSteps === "number") {
            onReady?.(data.totalSteps);
          }
          if (data.capabilities) {
            onCapabilities?.(data.capabilities as SandboxCapabilities);
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
          // iframe 通知播放状态变化
          break;
        }
        case "paramChange": {
          // iframe 通知参数变化
          break;
        }
      }
    },
    [onReady, onStepChange, onCapabilities],
  );

  useEffect(() => {
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [handleMessage]);

  // Forward goToStep to iframe
  useEffect(() => {
    if (goToStep == null || !iframeRef.current?.contentWindow) return;
    iframeRef.current.contentWindow.postMessage(
      { type: "goToStep", index: goToStep },
      "*",
    );
  }, [goToStep]);

  // Forward playback to iframe
  useEffect(() => {
    if (!playback || !iframeRef.current?.contentWindow) return;
    iframeRef.current.contentWindow.postMessage(
      { type: "playback", ...playback },
      "*",
    );
  }, [playback]);

  // Forward params to iframe
  useEffect(() => {
    if (!params || !iframeRef.current?.contentWindow) return;
    Object.entries(params).forEach(([key, value]) => {
      iframeRef.current?.contentWindow?.postMessage(
        { type: "setParam", key, value },
        "*",
      );
    });
  }, [params]);

  // Reset loading when src changes
  useEffect(() => {
    setLoading(true);
  }, [src]);

  return (
    <div className="html-sandbox-container">
      {loading && (
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
      <iframe
        ref={iframeRef}
        src={src}
        className="html-sandbox-iframe"
        sandbox="allow-scripts"
        title="HTML 交互动画"
        loading="lazy"
        onLoad={() => setLoading(false)}
      />
    </div>
  );
}
