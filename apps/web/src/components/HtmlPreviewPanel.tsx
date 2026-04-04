import { HtmlSandbox, type HtmlSandboxLoadState } from "./HtmlSandbox";
import type { UITheme } from "../types";
import type { ReactNode } from "react";

interface HtmlPreviewPanelProps {
  src: string;
  srcDoc?: string;
  meta?: string;
  headerAction?: ReactNode;
  theme?: UITheme;
  expectReadySignal?: boolean;
  onLoadStateChange?: (state: HtmlSandboxLoadState) => void;
}

export function HtmlPreviewPanel({
  src,
  srcDoc,
  meta,
  headerAction,
  theme = "dark",
  expectReadySignal = true,
  onLoadStateChange,
}: HtmlPreviewPanelProps) {
  return (
    <div className="html-preview-panel">
      <div className="html-preview-header">
        <div>
          <div className="video-preview-title html-preview-title">交互动画预览</div>
          {meta ? <div className="video-preview-meta">{meta}</div> : null}
        </div>

        <div className="html-preview-header-actions">{headerAction}</div>
      </div>

      <div className="html-preview-stage html-preview-stage-browser">
        <HtmlSandbox
          src={src}
          srcDoc={srcDoc}
          theme={theme}
          expectReadySignal={expectReadySignal}
          onLoadStateChange={onLoadStateChange}
        />
      </div>
    </div>
  );
}
