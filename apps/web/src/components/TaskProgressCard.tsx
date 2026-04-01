import type { PipelineStage } from "../types";

const STAGE_LABELS: Record<PipelineStage, string> = {
  domain_routing: "领域路由",
  cir_planning: "CIR 规划",
  script_coding: "脚本编码",
  render_output: "渲染输出",
};

const STAGE_ICONS: Record<PipelineStage, string> = {
  domain_routing: "route",
  cir_planning: "account_tree",
  script_coding: "code",
  render_output: "movie",
};

interface TaskProgressCardProps {
  currentStageIndex: number;
  stages: PipelineStage[];
  isIdle: boolean;
  isComplete: boolean;
}

export function TaskProgressCard({
  currentStageIndex,
  stages,
  isIdle,
  isComplete,
}: TaskProgressCardProps) {
  if (isIdle) {
    return (
      <div className="task-progress-idle">
        <span className="material-symbols-outlined" style={{ fontSize: 28, color: "var(--outline)" }}>
          hourglass_empty
        </span>
        <span className="task-progress-idle-label">等待提交</span>
      </div>
    );
  }

  return (
    <div className="task-progress-pipeline">
      {stages.map((stage, i) => {
        const isCompleted = isComplete || i < currentStageIndex;
        const isActive = !isComplete && i === currentStageIndex;

        return (
          <div key={stage} className="task-progress-stage-row">
            <div className={`task-progress-stage ${isCompleted ? "is-completed" : ""} ${isActive ? "is-active" : ""}`}>
              <div className="task-progress-dot">
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                  {isCompleted ? "check" : STAGE_ICONS[stage]}
                </span>
              </div>
              <div className="task-progress-info">
                <span className="task-progress-label">{STAGE_LABELS[stage]}</span>
                {isActive && <span className="task-progress-status">处理中...</span>}
                {isCompleted && <span className="task-progress-status is-done">完成</span>}
              </div>
            </div>
            {i < stages.length - 1 && (
              <div className={`task-progress-connector ${isCompleted ? "is-completed" : ""}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}
