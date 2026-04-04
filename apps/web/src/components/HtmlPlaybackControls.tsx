import type { PlaybackState } from "../hooks/useHtmlPreviewSync";

interface HtmlPlaybackControlsProps {
  currentStep: number;
  totalSteps: number;
  playback: PlaybackState;
  onPlaybackChange: (state: PlaybackState) => void;
  onPrev: () => void;
  onNext: () => void;
  onSeek: (step: number) => void;
  disabled?: boolean;
}

export function HtmlPlaybackControls({
  currentStep,
  totalSteps,
  playback,
  onPlaybackChange,
  onPrev,
  onNext,
  onSeek,
  disabled = false,
}: HtmlPlaybackControlsProps) {
  const canGoPrev = currentStep > 0 && !disabled;
  const canGoNext = currentStep < totalSteps - 1 && !disabled;
  const maxStep = Math.max(0, totalSteps - 1);

  const handlePlayPause = () => {
    onPlaybackChange({
      ...playback,
      paused: !playback.paused,
      autoplay: true,
    });
  };

  const handleSpeedChange = (speed: number) => {
    onPlaybackChange({ ...playback, speed });
  };

  return (
    <div
      className="html-playback-controls"
      style={{
        display: "flex",
        alignItems: "center",
        gap: "12px",
        padding: "12px 16px",
        background: "var(--surface-container-low)",
        borderRadius: "var(--radius-md)",
        border: "1px solid var(--outline-variant)",
      }}
    >
      {/* Previous */}
      <button
        type="button"
        className="btn btn-secondary btn-icon"
        onClick={onPrev}
        disabled={!canGoPrev}
        title="上一步"
        aria-label="上一步"
      >
        <span className="material-symbols-outlined" style={{ fontSize: 20 }}>
          skip_previous
        </span>
      </button>

      {/* Play/Pause */}
      <button
        type="button"
        className="btn btn-primary btn-icon"
        onClick={handlePlayPause}
        disabled={disabled}
        title={playback.paused ? "播放" : "暂停"}
        aria-label={playback.paused ? "播放" : "暂停"}
      >
        <span className="material-symbols-outlined" style={{ fontSize: 20 }}>
          {playback.paused ? "play_arrow" : "pause"}
        </span>
      </button>

      {/* Next */}
      <button
        type="button"
        className="btn btn-secondary btn-icon"
        onClick={onNext}
        disabled={!canGoNext}
        title="下一步"
        aria-label="下一步"
      >
        <span className="material-symbols-outlined" style={{ fontSize: 20 }}>
          skip_next
        </span>
      </button>

      {/* Step Slider */}
      <div style={{ flex: 1, display: "flex", alignItems: "center", gap: "8px" }}>
        <input
          type="range"
          min={0}
          max={maxStep}
          value={Math.min(currentStep, maxStep)}
          onChange={(e) => onSeek(parseInt(e.target.value, 10))}
          disabled={disabled || totalSteps <= 1}
          style={{ flex: 1, cursor: disabled ? "not-allowed" : "pointer" }}
          aria-label="步骤进度"
        />
      </div>

      {/* Step Counter */}
      <span
        style={{
          fontSize: "0.85rem",
          fontVariantNumeric: "tabular-nums",
          color: "var(--on-surface-variant)",
          minWidth: "3.5em",
          textAlign: "center",
        }}
      >
        {currentStep + 1} / {totalSteps || 1}
      </span>

      {/* Speed Control */}
      <select
        value={playback.speed}
        onChange={(e) => handleSpeedChange(parseFloat(e.target.value))}
        className="input"
        disabled={disabled}
        style={{
          padding: "6px 10px",
          width: "auto",
          fontSize: "0.85rem",
          borderRadius: "var(--radius-sm)",
        }}
        aria-label="播放速度"
      >
        <option value={0.5}>0.5x</option>
        <option value={0.75}>0.75x</option>
        <option value={1}>1.0x</option>
        <option value={1.25}>1.25x</option>
        <option value={1.5}>1.5x</option>
        <option value={2}>2.0x</option>
      </select>
    </div>
  );
}
