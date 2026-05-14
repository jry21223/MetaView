import React from "react";
import type { PipelineRunStatus } from "../../entities/pipeline/types";

interface RunProgressStepperProps {
  status: PipelineRunStatus;
  attempts: number;
  maxAttempts: number;
}

type StepState = "pending" | "active" | "done" | "failed";

interface StepView {
  key: string;
  label: string;
  state: StepState;
}

function deriveSteps(
  status: PipelineRunStatus,
  attempts: number,
  maxAttempts: number,
): StepView[] {
  const reviewLabel =
    attempts > 0
      ? `审核 (尝试 ${attempts}/${Math.max(maxAttempts, attempts)})`
      : "审核";
  const failedAtReview = status === "failed" && attempts > 0;

  let drafting: StepState = "active";
  let review: StepState = "pending";
  let render: StepState = "pending";

  switch (status) {
    case "queued":
      drafting = "pending";
      break;
    case "running":
      drafting = "active";
      break;
    case "reviewing":
      drafting = "done";
      review = "active";
      break;
    case "succeeded":
      drafting = "done";
      review = attempts > 0 ? "done" : "done";
      render = "done";
      break;
    case "failed":
      drafting = "done";
      if (failedAtReview) {
        review = "failed";
      } else {
        drafting = "failed";
        review = "pending";
      }
      break;
  }

  return [
    { key: "drafting", label: "起草", state: drafting },
    { key: "review", label: reviewLabel, state: review },
    { key: "render", label: "渲染", state: render },
  ];
}

function StepIcon({ state }: { state: StepState }) {
  switch (state) {
    case "done":
      return <span className="mv-run-stepper__icon" data-state="done" aria-hidden="true">✓</span>;
    case "failed":
      return <span className="mv-run-stepper__icon" data-state="failed" aria-hidden="true">✗</span>;
    case "active":
      return (
        <span
          className="mv-run-stepper__icon mv-run-stepper__icon--spin"
          data-state="active"
          aria-hidden="true"
        />
      );
    default:
      return <span className="mv-run-stepper__icon" data-state="pending" aria-hidden="true">•</span>;
  }
}

export function RunProgressStepper({
  status,
  attempts,
  maxAttempts,
}: RunProgressStepperProps) {
  const steps = deriveSteps(status, attempts, maxAttempts);
  return (
    <div
      className="mv-run-stepper"
      role="status"
      aria-live="polite"
      aria-label="生成流水线进度"
    >
      {steps.map((step, index) => (
        <React.Fragment key={step.key}>
          <div className="mv-run-stepper__step" data-state={step.state}>
            <StepIcon state={step.state} />
            <span className="mv-run-stepper__label">{step.label}</span>
          </div>
          {index < steps.length - 1 && <div className="mv-run-stepper__line" />}
        </React.Fragment>
      ))}
    </div>
  );
}
