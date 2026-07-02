import React, { useEffect, useState } from "react";
import type { PipelineRunResult } from "../../../entities/pipeline/types";
import { usePrefersReducedMotion } from "../../../shared/hooks/usePrefersReducedMotion";
import { PIPELINE_STAGE_HINTS } from "./pipelineStageHints";

type PipelineStatus = PipelineRunResult["status"] | null;
type ActiveStatus = keyof typeof PIPELINE_STAGE_HINTS;

const HINT_ROTATE_MS = 4000;

const STAGES: { key: ActiveStatus; label: string }[] = [
  { key: "queued", label: "排队中" },
  { key: "running", label: "脚本生成" },
  { key: "reviewing", label: "审核与修正" },
  { key: "succeeded", label: "渲染完成" },
];

const STATUS_ORDER: Record<NonNullable<PipelineStatus>, number> = {
  queued: 0,
  running: 1,
  reviewing: 2,
  succeeded: 3,
  failed: 3,
};

const STATUS_LOADER_LABEL: Record<NonNullable<PipelineStatus>, string> = {
  queued: "排队等待生成",
  running: "正在生成脚本",
  reviewing: "正在审核与修正",
  succeeded: "渲染完成",
  failed: "生成失败",
};

function formatElapsed(totalSeconds: number): string {
  const safe = Math.max(0, totalSeconds);
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function elapsedSecondsSince(createdAt: string, now: number): number {
  const started = Date.parse(createdAt);
  if (Number.isNaN(started)) return 0;
  return Math.floor((now - started) / 1000);
}

function useElapsedSeconds(createdAt: string | null | undefined): number | null {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!createdAt) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [createdAt]);

  if (!createdAt) return null;
  return elapsedSecondsSince(createdAt, now);
}

function useRotatingHint(status: PipelineStatus): string | null {
  const prefersReducedMotion = usePrefersReducedMotion();
  const hints =
    status && status !== "failed" ? PIPELINE_STAGE_HINTS[status] : null;
  const hintCount = hints?.length ?? 0;
  const [hintIndex, setHintIndex] = useState(0);

  useEffect(() => {
    setHintIndex(0);
    if (prefersReducedMotion || hintCount <= 1) return;
    const timer = setInterval(
      () => setHintIndex((index) => (index + 1) % hintCount),
      HINT_ROTATE_MS,
    );
    return () => clearInterval(timer);
  }, [status, hintCount, prefersReducedMotion]);

  if (!hints || hints.length === 0) return null;
  return hints[Math.min(hintIndex, hints.length - 1)];
}

interface PipelineSkeletonProps {
  status: PipelineStatus;
  /** Run creation time from the backend record; drives the elapsed timer. */
  createdAt?: string | null;
}

export function PipelineSkeleton({ status, createdAt = null }: PipelineSkeletonProps) {
  const currentOrder = status !== null ? STATUS_ORDER[status] : -1;
  const loaderLabel =
    status !== null ? STATUS_LOADER_LABEL[status] : "正在准备生成";
  const elapsedSeconds = useElapsedSeconds(createdAt);
  const hint = useRotatingHint(status);

  return (
    <div className="mv-pipeline-skeleton">
      <div className="mv-pipeline-stages mv-motion-decorative">
        {STAGES.map((stage, i) => {
          const stageOrder = STATUS_ORDER[stage.key];
          const isDone = currentOrder > stageOrder;
          const isActive = currentOrder === stageOrder;
          const lineState =
            i < currentOrder ? " is-done" : i === currentOrder ? " is-active" : "";
          return (
            <React.Fragment key={stage.key}>
              <div
                className={`mv-stage${isActive ? " is-active" : isDone ? " is-done" : ""}`}
              >
                <span className="mv-stage-dot" />
                <span>{stage.label}</span>
              </div>
              {i < STAGES.length - 1 && (
                <div className={`mv-stage-line${lineState}`}>
                  <span className="mv-stage-line__fill" />
                </div>
              )}
            </React.Fragment>
          );
        })}
      </div>

      <div className="mv-skeleton-area mv-motion-decorative">
        <div className="mv-pipeline-status" role="status" aria-live="polite">
          <span>{loaderLabel}</span>
          {elapsedSeconds !== null && (
            <span className="mv-pipeline-elapsed">
              · 已用时 {formatElapsed(elapsedSeconds)}
            </span>
          )}
        </div>
        {hint && (
          <div className="mv-pipeline-hint" key={hint}>
            {hint}
          </div>
        )}
        <div className="mv-skeleton-bar mv-skeleton-title" />
        <div className="mv-skeleton-cells">
          {Array.from({ length: 8 }, (_, i) => (
            <div
              key={i}
              className="mv-skeleton-bar mv-skeleton-cell"
              style={{ animationDelay: `${i * 0.1}s` }}
            />
          ))}
        </div>
        <div className="mv-skeleton-bar mv-skeleton-narration" />
        <div className="mv-skeleton-bar mv-skeleton-narration-short" />
      </div>
    </div>
  );
}
