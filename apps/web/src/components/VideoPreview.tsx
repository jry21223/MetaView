import { useState, useRef, useEffect } from "react";

interface VideoPreviewProps {
  src: string;
  title: string;
  meta?: string;
  compact?: boolean;
  downloadName?: string;
  headerless?: boolean;
  /** 视频时间更新回调，返回当前播放时间（秒） */
  onTimeUpdate?: (currentTime: number) => void;
  /** 跳转到指定时间（秒），由外部控制 */
  seekTo?: number | null;
}

export function VideoPreview({
  src,
  title,
  meta,
  compact = false,
  downloadName,
  headerless = false,
  onTimeUpdate,
  seekTo,
}: VideoPreviewProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  // 处理外部 seekTo 请求
  useEffect(() => {
    if (videoRef.current && seekTo !== null && seekTo !== undefined) {
      videoRef.current.currentTime = seekTo;
    }
  }, [seekTo]);

  const handleLoadStart = () => {
    setIsLoading(true);
    setHasError(false);
  };

  const handleCanPlay = () => {
    setIsLoading(false);
  };

  const handleError = () => {
    setIsLoading(false);
    setHasError(true);
  };

  const handleTimeUpdate = () => {
    if (videoRef.current && onTimeUpdate) {
      onTimeUpdate(videoRef.current.currentTime);
    }
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
                }}
              >
                重试
              </button>
            </div>
          )}
          <video
            ref={videoRef}
            key={src}
            className="preview-video"
            src={src}
            controls
            playsInline
            preload="metadata"
            onLoadStart={handleLoadStart}
            onCanPlay={handleCanPlay}
            onError={handleError}
            onTimeUpdate={handleTimeUpdate}
          />
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
