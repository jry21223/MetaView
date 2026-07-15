import React, { useMemo, useState } from "react";

import type {
  BfsInteractionBinding,
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
  const [draft, setDraft] = useState(current);

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
        onChange={(event) => setDraft(Number(event.currentTarget.value))}
        onPointerUp={commit}
        onKeyUp={commit}
        onBlur={commit}
      />
    </label>
  );
}

function ChoiceBinding({
  binding,
  onApply,
}: {
  binding: BfsInteractionBinding;
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
            aria-pressed={binding.value === option.id}
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

export function InteractionSandboxPanel({
  manifest,
  currentStepId,
  events,
  dirty,
  canUndo,
  lastError,
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

  if (!binding) return null;

  return (
    <div className="playbook-interaction">
      <div className="playbook-interaction__notice">
        <span>沙盒预览</span>
        <small>{dirty ? `${events.length} 个未保存操作` : "不会修改原课程"}</small>
      </div>

      {binding.target_role === "marker-x" ? (
        <RangeBinding
          key={`${binding.id}:${binding.value}`}
          binding={binding}
          onApply={onApply}
        />
      ) : (
        <ChoiceBinding binding={binding} onApply={onApply} />
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
        <button type="button" onClick={onReset} disabled={!dirty}>
          重置
        </button>
      </div>
    </div>
  );
}
