import { useCallback, useEffect, useRef, useState } from "react";

interface HtmlSandboxProps {
  /** URL to the HTML file served by the backend */
  src: string;
  /** Send a goToStep message to the iframe */
  goToStep?: number | null;
  /** Called when the iframe announces its total step count */
  onReady?: (totalSteps: number) => void;
  /** Called when the iframe navigates to a new step */
  onStepChange?: (index: number) => void;
}

export function HtmlSandbox({
  src,
  goToStep,
  onReady,
  onStepChange,
}: HtmlSandboxProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [loading, setLoading] = useState(true);

  const handleMessage = useCallback(
    (event: MessageEvent) => {
      const data = event.data;
      if (!data || typeof data !== "object" || !data.type) return;

      if (data.type === "ready" && typeof data.totalSteps === "number") {
        onReady?.(data.totalSteps);
      }
      if (data.type === "step" && typeof data.index === "number") {
        onStepChange?.(data.index);
      }
    },
    [onReady, onStepChange],
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
        onLoad={() => setLoading(false)}
      />
    </div>
  );
}
