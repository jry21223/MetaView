import type {
  MathSceneSnapshot,
  MetaStep,
  PlaybookScript,
} from "../../../features/playbook/engine/types";
import {
  InteractionEngineError,
  type ChangeConicExplanationCommand,
  type ClarifyCurrentConicStepCommand,
  type ConicFollowupCommand,
  type ConicFollowupAction,
  type EmphasizeConicConclusionCommand,
  type InteractionAdapter,
  type InteractionAdapterManifest,
  type InteractionCommand,
  type SetConicParameterCommand,
  type SlowConicSegmentCommand,
} from "../../../features/playbook/interaction/types";
import type {
  TemplatePreviewControl,
  TemplatePreviewFollowups,
  TemplatePreviewParams,
  TemplatePreviewQuestion,
} from "../templatePreviewCases";

const ADAPTER_ID = "math.conic-followup" as const;

interface ConicFollowupSource {
  parameterSchema?: {
    controls: TemplatePreviewControl[];
    defaults: TemplatePreviewParams;
  };
  buildPublicPlaybook: (params: TemplatePreviewParams) => PlaybookScript;
}

function targetId(stepId: string, action: string): string {
  return `step:${stepId}:${action}`;
}

function requireConicCommand(command: InteractionCommand) {
  if (command.adapter_id !== ADAPTER_ID) {
    throw new InteractionEngineError("Unsupported conic Follow-up operation");
  }
  return command;
}

function slowCurrentSegment(
  script: PlaybookScript,
  command: SlowConicSegmentCommand,
): PlaybookScript {
  if (!Number.isFinite(command.factor) || command.factor <= 1 || command.factor > 3) {
    throw new InteractionEngineError("Conic segment slowdown factor must be above 1 and at most 3");
  }
  const targetIndex = script.steps.findIndex((step) => step.step_id === command.step_id);
  if (targetIndex < 0) {
    throw new InteractionEngineError("Conic Follow-up step no longer exists");
  }
  const previousEnd = script.steps[targetIndex - 1]?.end_frame ?? 0;
  const duration = script.steps[targetIndex].end_frame - previousEnd;
  if (!Number.isInteger(duration) || duration < 1) {
    throw new InteractionEngineError("Conic Follow-up requires a valid Playbook timeline");
  }
  const slowedDuration = Math.ceil(duration * command.factor);
  const frameDelta = slowedDuration - duration;
  const steps = script.steps.map((step, index) =>
    index < targetIndex ? step : { ...step, end_frame: step.end_frame + frameDelta }
  );
  return {
    ...script,
    steps,
    total_frames: script.total_frames + frameDelta,
  };
}

function updateTargetStep(
  script: PlaybookScript,
  stepId: string,
  update: (step: MetaStep) => MetaStep,
): PlaybookScript {
  let matched = false;
  const steps = script.steps.map((step) => {
    if (step.step_id !== stepId) return step;
    if (matched) {
      throw new InteractionEngineError("Conic Follow-up step ids must be unique");
    }
    matched = true;
    return update(step);
  });
  if (!matched) throw new InteractionEngineError("Conic Follow-up step no longer exists");
  return { ...script, steps };
}

function changeExplanation(
  script: PlaybookScript,
  command: ChangeConicExplanationCommand,
): PlaybookScript {
  const explanation = command.explanation.trim();
  if (!explanation) throw new InteractionEngineError("Conic explanation cannot be empty");
  return updateTargetStep(script, command.step_id, (step) => ({
    ...step,
    voiceover_text: explanation,
    narration_template: null,
  }));
}

function emphasizeSnapshot(
  snapshot: MathSceneSnapshot,
  semanticRole: string | undefined,
  reason: string,
): MathSceneSnapshot {
  const emphasize = <T extends { semantic_role?: string; emphasis?: string }>(items: T[] | undefined) =>
    items?.map((item) =>
      !semanticRole || item.semantic_role === semanticRole
        ? { ...item, emphasis: "accent" }
        : item
    );
  return {
    ...snapshot,
    points: emphasize(snapshot.points),
    curves: emphasize(snapshot.curves),
    segments: emphasize(snapshot.segments),
    regions: emphasize(snapshot.regions),
    caption: [snapshot.caption, reason].filter(Boolean).join(" "),
  };
}

function emphasizeConclusion(
  script: PlaybookScript,
  command: EmphasizeConicConclusionCommand,
): PlaybookScript {
  const reason = command.reason.trim();
  if (!reason) throw new InteractionEngineError("Conic conclusion reason cannot be empty");
  return updateTargetStep(script, command.step_id, (step) => {
    if (step.snapshot.kind !== "math_scene") {
      throw new InteractionEngineError("Conic emphasis requires a math_scene step");
    }
    const snapshot = emphasizeSnapshot(step.snapshot, command.semantic_role, reason);
    const layers = step.layers?.map((layer) =>
      layer.body.kind === "math_scene"
        ? { ...layer, body: emphasizeSnapshot(layer.body, command.semantic_role, reason) }
        : layer
    );
    return {
      ...step,
      voiceover_text: `${step.voiceover_text} 关键依据：${reason}`,
      snapshot,
      ...(layers ? { layers } : {}),
    };
  });
}

function clarifyCurrentStep(
  script: PlaybookScript,
  command: ClarifyCurrentConicStepCommand,
): PlaybookScript {
  const clarification = command.clarification.trim();
  if (!clarification) throw new InteractionEngineError("Conic clarification cannot be empty");
  return updateTargetStep(script, command.step_id, (step) => ({
    ...step,
    voiceover_text: `${step.voiceover_text} ${clarification}`,
  }));
}

function paramsFromScript(
  source: ConicFollowupSource,
  script: PlaybookScript,
): TemplatePreviewParams {
  const controls = source.parameterSchema?.controls ?? [];
  const values = new Map(script.parameter_controls.map((control) => [control.id, control.value]));
  return Object.fromEntries(controls.map((control) => {
    const raw = values.get(control.id) ?? source.parameterSchema?.defaults[control.id];
    return [control.id, control.kind === "select" ? String(raw) : Number(raw)];
  }));
}

function normalizedParameterValue(
  control: TemplatePreviewControl,
  value: number | string,
): number | string {
  if (control.kind === "select") {
    const selected = String(value);
    if (!control.options.some((option) => option.value === selected)) {
      throw new InteractionEngineError("Conic parameter option is not declared by the manifest");
    }
    return selected;
  }
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    throw new InteractionEngineError("Conic parameter must be finite");
  }
  return Math.min(control.max, Math.max(control.min, numeric));
}

function setParameter(
  source: ConicFollowupSource,
  script: PlaybookScript,
  command: SetConicParameterCommand,
): PlaybookScript {
  if (!script.steps.some((step) => step.step_id === command.step_id)) {
    throw new InteractionEngineError("Conic Follow-up step no longer exists");
  }
  const control = source.parameterSchema?.controls.find(
    (candidate) => candidate.id === command.parameter_id,
  );
  if (!control) {
    throw new InteractionEngineError("Conic parameter is not declared by the manifest");
  }
  const params = paramsFromScript(source, script);
  params[control.id] = normalizedParameterValue(control, command.value);
  const rebuilt = source.buildPublicPlaybook(params);
  if (!rebuilt.steps.some((step) => step.step_id === command.step_id)) {
    throw new InteractionEngineError("Conic parameter rebuild removed the active step");
  }
  return rebuilt;
}

const STEP_ACTIONS: readonly ConicFollowupAction[] = [
  "slow-current-segment",
  "change-explanation",
  "emphasize-conclusion",
  "set-parameter",
  "clarify-current-step",
];

export function createConicFollowupAdapter(source: ConicFollowupSource): InteractionAdapter {
  return {
    adapter_id: ADAPTER_ID,
    deriveManifest(script): InteractionAdapterManifest | null {
      if (script.domain !== "math") return null;
      return {
        adapter_id: ADAPTER_ID,
        experimental: true,
        bindings: script.steps.flatMap((step) => STEP_ACTIONS.map((action) => ({
          id: targetId(step.step_id, action),
          adapter_id: ADAPTER_ID,
          step_id: step.step_id,
          target_role: action,
          action,
          label: action,
        }))),
      };
    },
    apply(script, rawCommand) {
      const command = requireConicCommand(rawCommand);
      if (command.action === "change-explanation") {
        return {
          script: changeExplanation(script, command),
          summary: `Changed the explanation for conic step ${command.step_id}.`,
        };
      }
      if (command.action === "emphasize-conclusion") {
        return {
          script: emphasizeConclusion(script, command),
          summary: `Emphasized the conclusion evidence in conic step ${command.step_id}.`,
        };
      }
      if (command.action === "clarify-current-step") {
        return {
          script: clarifyCurrentStep(script, command),
          summary: `Clarified only conic step ${command.step_id}.`,
        };
      }
      if (command.action === "set-parameter") {
        return {
          script: setParameter(source, script, command),
          summary: `Changed conic parameter ${command.parameter_id} and recomputed the Playbook.`,
        };
      }
      if (command.action !== "slow-current-segment") {
        throw new InteractionEngineError("Unsupported conic Follow-up operation");
      }
      return {
        script: slowCurrentSegment(script, command),
        summary: `Slowed conic step ${command.step_id} by ${command.factor}×.`,
      };
    },
  };
}

function primarySemanticRole(step: MetaStep): string | undefined {
  if (step.snapshot.kind !== "math_scene") return undefined;
  const objects = [
    ...(step.snapshot.points ?? []),
    ...(step.snapshot.segments ?? []),
    ...(step.snapshot.curves ?? []),
    ...(step.snapshot.regions ?? []),
  ];
  return objects.find((item) => item.emphasis === "accent")?.semantic_role
    ?? objects.find((item) => item.emphasis === "primary")?.semantic_role
    ?? objects.find((item) => item.semantic_role)?.semantic_role;
}

function alternateExplanation(
  step: MetaStep,
  existing: readonly TemplatePreviewQuestion[],
): string {
  const caption = step.snapshot.kind === "math_scene" ? step.snapshot.caption?.trim() : "";
  const candidate = caption || existing[0]?.answer.trim() || step.voiceover_text.trim();
  return candidate === step.voiceover_text.trim() ? `换个角度看：${candidate}` : candidate;
}

function nextParameterPreset(
  source: ConicFollowupSource,
  script: PlaybookScript,
  stepIndex: number,
): { control: TemplatePreviewControl; value: number | string } {
  const controls = source.parameterSchema?.controls ?? [];
  const control = controls[stepIndex % controls.length];
  if (!control) {
    throw new InteractionEngineError("Conic Follow-up requires a declared parameter");
  }
  const current = paramsFromScript(source, script)[control.id];
  if (control.kind === "select") {
    const index = control.options.findIndex((option) => option.value === String(current));
    return {
      control,
      value: control.options[(index + 1 + control.options.length) % control.options.length].value,
    };
  }
  const numeric = Number(current);
  const next = numeric + control.step <= control.max
    ? numeric + control.step
    : numeric - control.step >= control.min
      ? numeric - control.step
      : numeric;
  return { control, value: Number(next.toFixed(12)) };
}

function preset(
  stepId: string,
  suffix: string,
  question: string,
  answer: string,
  operation: ConicFollowupCommand,
): TemplatePreviewQuestion {
  return { id: `${stepId}-${suffix}`, question, answer, operation };
}

export function buildConicFollowupPresets(
  source: ConicFollowupSource,
  script: PlaybookScript,
  existing: TemplatePreviewFollowups,
): TemplatePreviewFollowups {
  return Object.fromEntries(script.steps.map((step, stepIndex) => {
    const current = existing[step.step_id] ?? [];
    const reason = current[1]?.answer.trim()
      || `当前结论直接由「${step.title}」中的几何关系得到。`;
    const explanation = alternateExplanation(step, current);
    const clarification = current[2]?.answer.trim()
      || `本步只补充「${step.title}」所需的局部说明。`;
    const parameter = nextParameterPreset(source, script, stepIndex);
    const prefix = `step:${step.step_id}`;
    return [step.step_id, [
      preset(step.step_id, "slow", `放慢「${step.title}」`, "已只延长当前讲解段，后续时间连续顺延。", {
        adapter_id: ADAPTER_ID,
        step_id: step.step_id,
        target_id: `${prefix}:slow-current-segment`,
        action: "slow-current-segment",
        factor: 1.5,
      }),
      preset(step.step_id, "explain", "换一种方式解释", explanation, {
        adapter_id: ADAPTER_ID,
        step_id: step.step_id,
        target_id: `${prefix}:change-explanation`,
        action: "change-explanation",
        explanation,
      }),
      preset(step.step_id, "why", "强调结论为什么成立", reason, {
        adapter_id: ADAPTER_ID,
        step_id: step.step_id,
        target_id: `${prefix}:emphasize-conclusion`,
        action: "emphasize-conclusion",
        reason,
        semantic_role: primarySemanticRole(step),
      }),
      preset(step.step_id, "parameter", `调整 ${parameter.control.label}`, `已在有效范围内调整 ${parameter.control.label}，并重算完整 Playbook。`, {
        adapter_id: ADAPTER_ID,
        step_id: step.step_id,
        target_id: `${prefix}:set-parameter`,
        action: "set-parameter",
        parameter_id: parameter.control.id,
        value: parameter.value,
      }),
      preset(step.step_id, "current", "只补充当前这一步", clarification, {
        adapter_id: ADAPTER_ID,
        step_id: step.step_id,
        target_id: `${prefix}:clarify-current-step`,
        action: "clarify-current-step",
        clarification,
      }),
    ]];
  }));
}
