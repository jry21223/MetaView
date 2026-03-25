import { useEffect, useMemo, useRef, useState, useCallback } from "react";

import type { ExecutionCheckpoint, ExecutionMap } from "../types";
import { HighlightedCode } from "./HighlightedCode";
import { VideoPreview } from "./VideoPreview";

type SourceLanguage = "python" | "cpp" | undefined;

interface InteractiveExecutionExplorerProps {
  videoSrc: string;
  videoTitle: string;
  videoMeta?: string;
  downloadName?: string;
  sourceCode: string;
  sourceLanguage?: SourceLanguage;
  editorName: string;
  executionMap: ExecutionMap;
  onApplyParameterScenario?: (scenario: string) => void;
}

interface RenderableCheckpoint extends ExecutionCheckpoint {
  renderStartS: number;
  renderEndS: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function formatTime(totalSeconds: number): string {
  const seconds = Math.max(0, totalSeconds);
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds - minutes * 60;
  return `${String(minutes).padStart(2, "0")}:${remainder.toFixed(1).padStart(4, "0")}`;
}

function buildScenarioText(values: Record<string, string>): string {
  const pairs = Object.entries(values)
    .filter(([, value]) => value.trim().length > 0)
    .map(([key, value]) => `${key}=${value.trim()}`);
  if (pairs.length === 0) {
    return "";
  }
  return `请用这组输入重新解释算法边界条件：${pairs.join("，")}。`;
}

function parseArrayValues(rawValue: string | undefined, fallbackValues: string[]): string[] {
  if (!rawValue || rawValue.trim().length === 0) {
    return fallbackValues;
  }
  const trimmed = rawValue.trim();
  const withoutBrackets = trimmed.replace(/^\[/, "").replace(/\]$/, "");
  const parsed = withoutBrackets
    .split(",")
    .map((value) => value.trim().replace(/^['"]|['"]$/g, ""))
    .filter(Boolean);
  return parsed.length > 0 ? parsed : fallbackValues;
}

export function InteractiveExecutionExplorer({
  videoSrc,
  videoTitle,
  videoMeta,
  downloadName,
  sourceCode,
  sourceLanguage,
  editorName,
  executionMap,
  onApplyParameterScenario,
}: InteractiveExecutionExplorerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [videoDuration, setVideoDuration] = useState<number | null>(null);
  const [seekRequest, setSeekRequest] = useState<{ time: number; token: number } | null>(null);
  const [acknowledgedBreakpoints, setAcknowledgedBreakpoints] = useState<string[]>([]);
  const [parameterValues, setParameterValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      executionMap.parameter_controls.map((control) => [control.id, control.value]),
    ),
  );

  // Throttle time updates to reduce re-renders on mobile
  const lastUpdateTimeRef = useRef(0);
  const handleTimeUpdate = useCallback((time: number) => {
    const now = Date.now();
    // Throttle to ~15fps on mobile, ~30fps on desktop
    const throttleMs = typeof window !== "undefined" && window.matchMedia("(max-width: 760px)").matches
      ? 66
      : 33;
    if (now - lastUpdateTimeRef.current < throttleMs) {
      return;
    }
    lastUpdateTimeRef.current = now;
    setCurrentTime(time);
  }, []);

  const effectiveDuration = videoDuration && Number.isFinite(videoDuration)
    ? videoDuration
    : executionMap.duration_s;
  const durationScale = executionMap.duration_s > 0
    ? effectiveDuration / executionMap.duration_s
    : 1;

  const checkpoints = useMemo<RenderableCheckpoint[]>(
    () =>
      executionMap.checkpoints.map((checkpoint) => ({
        ...checkpoint,
        renderStartS: checkpoint.start_s * durationScale,
        renderEndS: checkpoint.end_s * durationScale,
      })),
    [durationScale, executionMap.checkpoints],
  );

  const activeCheckpoint = useMemo(() => {
    const found = checkpoints.find(
      (checkpoint) => currentTime >= checkpoint.renderStartS && currentTime < checkpoint.renderEndS,
    );
    if (found) {
      return found;
    }
    if (checkpoints.length === 0) {
      return null;
    }
    if (currentTime < checkpoints[0].renderStartS) {
      return checkpoints[0];
    }
    return checkpoints[checkpoints.length - 1];
  }, [checkpoints, currentTime]);

  useEffect(() => {
    if (!activeCheckpoint?.breakpoint) {
      return;
    }
    if (acknowledgedBreakpoints.includes(activeCheckpoint.id)) {
      return;
    }
    videoRef.current?.pause();
  }, [acknowledgedBreakpoints, activeCheckpoint]);

  const highlightedLines = activeCheckpoint?.code_lines ?? [];

  function requestSeek(time: number) {
    const bounded = clamp(time, 0, effectiveDuration);
    setCurrentTime(bounded);
    setSeekRequest((current) => ({
      time: bounded,
      token: (current?.token ?? 0) + 1,
    }));
  }

  function handleCodeLineClick(lineIndex: number) {
    const lineNumber = lineIndex + 1;
    const match = checkpoints.find((checkpoint) => checkpoint.code_lines.includes(lineNumber));
    if (!match) {
      return;
    }
    requestSeek(match.renderStartS);
    videoRef.current?.pause();
  }

  function handleCheckpointJump(checkpoint: RenderableCheckpoint) {
    requestSeek(checkpoint.renderStartS);
    videoRef.current?.pause();
  }

  function handleContinueBreakpoint(checkpoint: RenderableCheckpoint) {
    setAcknowledgedBreakpoints((current) =>
      current.includes(checkpoint.id) ? current : [...current, checkpoint.id],
    );
    requestSeek(checkpoint.renderStartS + 0.02);
    void videoRef.current?.play();
  }

  const scenarioText = buildScenarioText(parameterValues);
  const progressPercent = effectiveDuration > 0 ? (currentTime / effectiveDuration) * 100 : 0;
  const arrayValues = useMemo(
    () =>
      executionMap.array_track
        ? parseArrayValues(
            parameterValues[executionMap.array_track.id],
            executionMap.array_track.values,
          )
        : [],
    [executionMap.array_track, parameterValues],
  );

  function handleArrayCellClick(index: number) {
    const match = checkpoints
      .filter(
        (checkpoint) =>
          checkpoint.array_focus_indices.includes(index)
          || checkpoint.array_reference_indices.includes(index),
      )
      .sort((left, right) => {
        const leftDistance = Math.abs(left.renderStartS - currentTime);
        const rightDistance = Math.abs(right.renderStartS - currentTime);
        return leftDistance - rightDistance;
      })[0];
    if (!match) {
      return;
    }
    requestSeek(match.renderStartS);
    videoRef.current?.pause();
  }

  const overlay = activeCheckpoint ? (
    <>
      <div className="execution-overlay-chip execution-overlay-chip-top">
        <span>Execution Focus</span>
        <strong>{activeCheckpoint.title}</strong>
      </div>
      {executionMap.array_track && arrayValues.length > 0 ? (
        <div className="execution-array-overlay">
          <div className="execution-array-head">
            <span>{executionMap.array_track.label}</span>
            {executionMap.array_track.target_value ? (
              <strong>target = {executionMap.array_track.target_value}</strong>
            ) : null}
          </div>
          <div className="execution-array-track">
            {arrayValues.map((value, index) => {
              const isFocused = activeCheckpoint.array_focus_indices.includes(index);
              const isReferenced = activeCheckpoint.array_reference_indices.includes(index);
              return (
                <button
                  key={`${executionMap.array_track?.id}-${index}-${value}`}
                  type="button"
                  className={`execution-array-cell ${
                    isFocused ? "is-focused" : ""
                  } ${isReferenced ? "is-referenced" : ""}`}
                  onClick={() => handleArrayCellClick(index)}
                >
                  <small>{index}</small>
                  <strong>{value}</strong>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
      <div className="execution-overlay-hotspots">
        {checkpoints.map((checkpoint) => (
          <button
            key={checkpoint.id}
            type="button"
            className={`execution-hotspot ${
              activeCheckpoint.id === checkpoint.id ? "is-active" : ""
            }`}
            onClick={() => handleCheckpointJump(checkpoint)}
          >
            {checkpoint.focus_tokens[0] ?? checkpoint.title}
          </button>
        ))}
      </div>
    </>
  ) : null;

  return (
    <section className="interactive-explorer">
      <div className="interactive-explorer-head">
        <div>
          <span className="panel-kicker">Explorer</span>
          <h3>算法执行联动探索</h3>
          <p>{executionMap.interaction_hint ?? "拖动时间轴或点代码行，直接跳到对应执行瞬间。"}</p>
        </div>
        <div className="interactive-explorer-meta">
          <span>{checkpoints.length} checkpoints</span>
          <span>{formatTime(effectiveDuration)}</span>
          <span>{sourceLanguage ?? "text"}</span>
        </div>
      </div>

      <div className="interactive-explorer-grid">
        <div className="interactive-explorer-stage">
          <VideoPreview
            src={videoSrc}
            title={videoTitle}
            meta={videoMeta}
            downloadName={downloadName}
            headerless
            seekRequest={seekRequest}
            onTimeUpdate={handleTimeUpdate}
            onDurationChange={setVideoDuration}
            overlay={overlay}
            videoRef={videoRef}
          />

          <div className="execution-timeline">
            <div className="execution-timeline-head">
              <strong>时间轴</strong>
              <span>
                {formatTime(currentTime)} / {formatTime(effectiveDuration)}
              </span>
            </div>
            <div className="execution-timeline-track">
              <div
                className="execution-timeline-progress"
                style={{ width: `${progressPercent}%` }}
              />
              {checkpoints.map((checkpoint) => {
                const markerLeft = effectiveDuration > 0
                  ? `${(checkpoint.renderStartS / effectiveDuration) * 100}%`
                  : "0%";
                return (
                  <button
                    key={checkpoint.id}
                    type="button"
                    className={`execution-marker ${
                      activeCheckpoint?.id === checkpoint.id ? "is-active" : ""
                    } ${checkpoint.breakpoint ? "is-breakpoint" : ""}`}
                    style={{ left: markerLeft }}
                    onClick={() => handleCheckpointJump(checkpoint)}
                    title={checkpoint.title}
                  />
                );
              })}
              <input
                className="execution-timeline-range"
                type="range"
                min={0}
                max={effectiveDuration}
                step={0.01}
                value={clamp(currentTime, 0, effectiveDuration)}
                onChange={(event) => requestSeek(Number(event.currentTarget.value))}
              />
            </div>
          </div>

          <div className="execution-checkpoints">
            {checkpoints.map((checkpoint) => (
              <button
                key={checkpoint.id}
                type="button"
                className={`execution-checkpoint ${
                  activeCheckpoint?.id === checkpoint.id ? "is-active" : ""
                }`}
                onClick={() => handleCheckpointJump(checkpoint)}
              >
                <span>{checkpoint.title}</span>
                <small>{formatTime(checkpoint.renderStartS)}</small>
              </button>
            ))}
          </div>

          {activeCheckpoint?.breakpoint && !acknowledgedBreakpoints.includes(activeCheckpoint.id) ? (
            <div className="execution-breakpoint-card">
              <span className="panel-kicker">Pause Point</span>
              <strong>{activeCheckpoint.title}</strong>
              <p>{activeCheckpoint.guiding_question ?? activeCheckpoint.summary}</p>
              <div className="execution-breakpoint-actions">
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => handleCheckpointJump(activeCheckpoint)}
                >
                  回到断点开始
                </button>
                <button
                  type="button"
                  className="composer-submit"
                  onClick={() => handleContinueBreakpoint(activeCheckpoint)}
                >
                  继续播放
                </button>
              </div>
            </div>
          ) : null}

          {executionMap.parameter_controls.length > 0 ? (
            <div className="execution-parameter-panel">
              <div className="interactive-subhead">
                <strong>参数实验</strong>
                <span>改输入后可写回提示词，再重新生成观察边界条件。</span>
              </div>
              <div className="execution-parameter-grid">
                {executionMap.parameter_controls.map((control) => (
                  <label key={control.id} className="execution-parameter-field">
                    <span>{control.label}</span>
                    <input
                      type="text"
                      value={parameterValues[control.id] ?? ""}
                      placeholder={control.placeholder ?? ""}
                      onChange={(event) =>
                        setParameterValues((current) => ({
                          ...current,
                          [control.id]: event.currentTarget.value,
                        }))
                      }
                    />
                    {control.description ? <small>{control.description}</small> : null}
                  </label>
                ))}
              </div>
              <div className="execution-parameter-actions">
                <code>{scenarioText || "填写参数后可生成新的边界条件提示词。"}</code>
                <button
                  type="button"
                  className="ghost-button"
                  disabled={!scenarioText}
                  onClick={() => {
                    if (scenarioText) {
                      onApplyParameterScenario?.(scenarioText);
                    }
                  }}
                >
                  写回提示词
                </button>
              </div>
            </div>
          ) : null}
        </div>

        <div className="interactive-explorer-code">
          <div className="console-toolbar">
            <div className="console-dots">
              <span />
              <span />
              <span />
            </div>
            <strong>{editorName}</strong>
          </div>
          <div className="execution-code-summary">
            <div>
              <span className="panel-kicker">Active Checkpoint</span>
              <strong>{activeCheckpoint?.title ?? "等待交互"}</strong>
            </div>
            <p>{activeCheckpoint?.summary ?? "点击时间轴、动画焦点或代码行开始探索。"}</p>
          </div>
          <div className="console-content source-console interactive-source-console">
            <HighlightedCode
              code={sourceCode}
              language={sourceLanguage}
              emphasizeLine={undefined}
              highlightedLines={highlightedLines}
              onLineClick={handleCodeLineClick}
              lineNumberBase={1}
            />
          </div>
        </div>
      </div>
    </section>
  );
}
