interface VideoPreviewProps {
  src: string;
  title: string;
  meta?: string;
  compact?: boolean;
  downloadName?: string;
}

export function VideoPreview({
  src,
  title,
  meta,
  compact = false,
  downloadName,
}: VideoPreviewProps) {
  return (
    <div className={`video-surface ${compact ? "is-compact" : ""}`.trim()}>
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

      <div className="preview-video-shell">
        <div className="preview-video-frame">
          <video
            key={src}
            className="preview-video"
            src={src}
            controls
            playsInline
            preload="metadata"
          />
        </div>
      </div>
    </div>
  );
}
