import React, { useCallback, useEffect, useMemo, useState } from "react";

import type {
  BfsInteractionBinding,
  BfsInteractionReplay,
  DerivativeInteractionBinding,
  InteractionCommand,
  InteractionEvent,
  InteractionManifest,
} from "./types";

interface InteractionSandboxPanelProps {
  manifest: InteractionManifest;
  currentStepId: string;
  events: InteractionEvent[];
  dirty: boolean;
  canUndo: boolean;
  lastError: string | null;
  latestReplay: BfsInteractionReplay | null;
  onShowReplayFrame: (replay: BfsInteractionReplay, frameIndex: number) => void;
  onApply: (command: InteractionCommand) => void;
  onUndo: () => void;
  onReset: () => void;
}

function RangeBinding({
  binding,
  onApply,
}: {
  binding: DerivativeInteractionBinding;
  onApply: (command: InteractionCommand) => void;
}) {
  const current = binding.value;
  const [draftState, setDraftState] = useState(() => ({
    source: binding,
    value: current,
  }));
  const draft = draftState.source === binding ? draftState.value : current;

  const commit = () => {
    if (!Number.isFinite(draft) || draft === current) return;
    onApply({
      adapter_id: binding.adapter_id,
      step_id: binding.step_id,
      target_id: binding.id,
      action: binding.action,
      value: draft,
    });
  };

  const min = binding.min ?? 0;
  const max = binding.max ?? 1;
  const step = Math.max((max - min) / 200, 0.001);

  return (
    <label className="playbook-interaction__range">
      <span>
        {binding.label}
        <output>{Number.isFinite(draft) ? draft.toFixed(2) : "—"}</output>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={draft}
        aria-label={binding.label}
        onChange={(event) => setDraftState({
          source: binding,
          value: Number(event.currentTarget.value),
        })}
        onPointerUp={commit}
        onKeyUp={commit}
        onBlur={commit}
      />
    </label>
  );
}

function ChoiceBinding({
  binding,
  selectedValue,
  onApply,
}: {
  binding: BfsInteractionBinding;
  selectedValue: string;
  onApply: (command: InteractionCommand) => void;
}) {
  return (
    <div className="playbook-interaction__choice" role="group" aria-label={binding.label}>
      <span>{binding.label}</span>
      <div>
        {binding.options?.map((option) => (
          <button
            key={option.id}
            type="button"
            aria-pressed={selectedValue === option.id}
            disabled={selectedValue === option.id}
            onClick={() => onApply({
              adapter_id: binding.adapter_id,
              step_id: binding.step_id,
              target_id: binding.id,
              action: binding.action,
              value: option.id,
            })}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function BfsReplayControls({
  replay,
  onShowFrame,
}: {
  replay: BfsInteractionReplay;
  onShowFrame: (replay: BfsInteractionReplay, frameIndex: number) => void;
}) {
  const [frameIndex, setFrameIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const lastIndex = Math.max(0, replay.frames.length - 1);

  const showFrame = useCallback((nextIndex: number) => {
    const bounded = Math.max(0, Math.min(nextIndex, lastIndex));
    setFrameIndex(bounded);
    onShowFrame(replay, bounded);
  }, [lastIndex, onShowFrame, replay]);

  const showManualFrame = (nextIndex: number) => {
    setPlaying(false);
    showFrame(nextIndex);
  };

  useEffect(() => {
    if (!playing || frameIndex >= lastIndex) return;
    const timeout = window.setTimeout(() => {
      const nextIndex = frameIndex + 1;
      showFrame(nextIndex);
      if (nextIndex >= lastIndex) setPlaying(false);
    }, 700);
    return () => window.clearTimeout(timeout);
  }, [frameIndex, lastIndex, playing, showFrame]);

  return (
    <div className="playbook-interaction__replay" role="group" aria-label="BFS 重放">
      <div className="playbook-interaction__replay-status" aria-live="polite">
        <span>重放 {frameIndex + 1} / {replay.frames.length}</span>
        <small>
          当前 {replay.frames[frameIndex]?.current_node_id ?? "—"}
          {" · "}队列 {replay.frames[frameIndex]?.queue_node_ids.join(", ") || "空"}
        </small>
      </div>
      <div className="playbook-interaction__replay-order">
        {replay.visit_order.join(" → ")}
      </div>
      <div className="playbook-interaction__replay-actions">
        <button
          type="button"
          onClick={() => showManualFrame(0)}
          disabled={frameIndex === 0}
        >
          第一帧
        </button>
        <button
          type="button"
          onClick={() => showManualFrame(frameIndex - 1)}
          disabled={frameIndex === 0}
        >
          上一帧
        </button>
        <button
          type="button"
          onClick={() => {
            if (frameIndex >= lastIndex) showFrame(0);
            setPlaying((value) => !value);
          }}
          disabled={replay.frames.length < 2}
          aria-pressed={playing}
        >
          {playing ? "暂停" : "播放"}
        </button>
        <button
          type="button"
          onClick={() => showManualFrame(frameIndex + 1)}
          disabled={frameIndex >= lastIndex}
        >
          下一帧
        </button>
        <button
          type="button"
          onClick={() => showManualFrame(lastIndex)}
          disabled={frameIndex >= lastIndex}
        >
          最后一帧
        </button>
      </div>
    </div>
  );
}

export function InteractionSandboxPanel({
  manifest,
  currentStepId,
  events,
  dirty,
  canUndo,
  lastError,
  latestReplay,
  onShowReplayFrame,
  onApply,
  onUndo,
  onReset,
}: InteractionSandboxPanelProps) {
  const binding = useMemo(
    () => manifest.adapters
      .flatMap((adapter) => adapter.bindings)
      .find((candidate) => candidate.step_id === currentStepId) ?? null,
    [currentStepId, manifest],
  );

  if (!binding && !dirty && !lastError) return null;

  return (
    <div className="playbook-interaction">
      <div className="playbook-interaction__notice">
        <span>沙盒预览</span>
        <small>{dirty ? `${events.length} 个未保存操作` : "不会修改原课程"}</small>
      </div>

      {binding?.target_role === "marker-x" ? (
        <RangeBinding
          key={binding.id}
          binding={binding}
          onApply={onApply}
        />
      ) : binding?.target_role === "start-node" ? (
        <>
          <ChoiceBinding
            binding={binding}
            selectedValue={
              latestReplay?.step_id === binding.step_id
                ? latestReplay.start_node_id
                : binding.value
            }
            onApply={onApply}
          />
          {latestReplay?.step_id === binding.step_id && (
            <BfsReplayControls
              key={`${latestReplay.step_id}:${latestReplay.start_node_id}`}
              replay={latestReplay}
              onShowFrame={onShowReplayFrame}
            />
          )}
        </>
      ) : (
        <p className="playbook-interaction__inactive" role="status">
          当前步骤没有交互目标；仍可撤销或重置沙盒操作。
        </p>
      )}

      {lastError && (
        <p className="playbook-interaction__error" role="alert">
          {lastError}
        </p>
      )}

      <div className="playbook-interaction__actions">
        <button type="button" onClick={onUndo} disabled={!canUndo}>
          撤销
        </button>
        <button type="button" onClick={onReset} disabled={!dirty && !lastError}>
          重置
        </button>
      </div>
    </div>
  );
}
