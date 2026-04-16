import { useEffect, useRef, useState } from "react";
import type { ReactNode, RefObject } from "react";

interface VideoPreviewProps {
  src: string;
  title: string;
  meta?: string;
  compact?: boolean;
  downloadName?: string;
  headerless?: boolean;
  onTimeUpdate?: (currentTime: number) => void;
  onDurationChange?: (duration: number) => void;
  seekTo?: number | null;
  seekRequest?: { time: number; token: number } | null;
  overlay?: ReactNode;
  videoRef?: RefObject<HTMLVideoElement | null>;
}

export function VideoPreview({
  src,
  title,
  meta,
  compact = false,
  downloadName,
  headerless = false,
  onTimeUpdate,
  onDurationChange,
  seekTo,
  seekRequest,
  overlay,
  videoRef,
}: VideoPreviewProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [retryToken, setRetryToken] = useState(0);
  const internalVideoRef = useRef<HTMLVideoElement>(null);
  const resolvedVideoRef = videoRef ?? internalVideoRef;
  const lastReportedDurationRef = useRef<number | null>(null);

  useEffect(() => {
    if (resolvedVideoRef.current && seekTo !== null && seekTo !== undefined) {
      resolvedVideoRef.current.currentTime = seekTo;
    }
  }, [resolvedVideoRef, seekTo]);

  useEffect(() => {
    if (!resolvedVideoRef.current || !seekRequest) {
      return;
    }
    resolvedVideoRef.current.currentTime = seekRequest.time;
  }, [resolvedVideoRef, seekRequest]);

  const reportDuration = () => {
    const duration = resolvedVideoRef.current?.duration;
    if (duration === undefined || !Number.isFinite(duration)) {
      return;
    }
    if (lastReportedDurationRef.current === duration) {
      return;
    }
    lastReportedDurationRef.current = duration;
    onDurationChange?.(duration);
  };

  const handleMediaReady = () => {
    setIsLoading(false);
    reportDuration();
  };

  const handleLoadStart = () => {
    lastReportedDurationRef.current = null;
    setIsLoading(true);
    setHasError(false);
  };

  const handleCanPlay = () => {
    handleMediaReady();
  };

  const handleLoadedData = () => {
    handleMediaReady();
  };

  const handleError = () => {
    setIsLoading(false);
    setHasError(true);
  };

  const handleTimeUpdate = () => {
    if (resolvedVideoRef.current && onTimeUpdate) {
      onTimeUpdate(resolvedVideoRef.current.currentTime);
    }
  };

  const handleLoadedMetadata = () => {
    setIsLoading(false);
    reportDuration();
  };

  return (
    <div
      className={`video-surface ${compact ? "is-compact" : ""} ${
        headerless ? "is-headerless" : ""
      }`.trim()}
    >
      {!headerless ? (
        <div className="video-surface-toolbar">
          <div className="video-surface-copy">
            <strong>{title}</strong>
            {meta ? <small>{meta}</small> : null}
          </div>

          <div className="video-surface-actions">
            <a
              className="video-action"
              href={src}
              download={downloadName}
            >
              下载视频
            </a>
          </div>
        </div>
      ) : null}

      <div className="preview-video-shell">
        <div className="preview-video-frame">
          {isLoading && !hasError && (
            <div className="video-loading-overlay">
              <div className="video-loading-spinner" />
              <span>加载视频中...</span>
            </div>
          )}
          {hasError && (
            <div className="video-error-overlay">
              <span className="video-error-icon">⚠️</span>
              <span>视频加载失败</span>
              <button
                type="button"
                className="video-retry-button"
                onClick={() => {
                  setHasError(false);
                  setIsLoading(true);
                  setRetryToken((token) => token + 1);
                }}
              >
                重试
              </button>
            </div>
          )}
          <video
            ref={resolvedVideoRef}
            key={`${src}-${retryToken}`}
            className="preview-video"
            src={src}
            controls
            playsInline
            preload="metadata"
            onLoadStart={handleLoadStart}
            onCanPlay={handleCanPlay}
            onLoadedData={handleLoadedData}
            onError={handleError}
            onLoadedMetadata={handleLoadedMetadata}
            onTimeUpdate={handleTimeUpdate}
          />
          {overlay ? <div className="preview-video-overlay">{overlay}</div> : null}
        </div>
      </div>

      {headerless ? (
        <div className="video-surface-footer">
          <a
            className="video-action"
            href={src}
            download={downloadName}
          >
            下载视频
          </a>
        </div>
      ) : null}
    </div>
  );
}
