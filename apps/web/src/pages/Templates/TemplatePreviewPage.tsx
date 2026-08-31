import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { PlaybookPlayer } from "../../features/playbook/engine/player/PlaybookPlayer";
import type { PlaybookScript } from "../../features/playbook/engine/types";
import { useInteractionSandbox } from "../../features/playbook/interaction/useInteractionSandbox";
import { TEMPLATES } from "./templates";
import { StaticFollowupPanel } from "./StaticFollowupPanel";
import { TemplatePreviewControls } from "./TemplatePreviewControls";
import {
  getTemplatePreviewCase,
  type TemplatePreviewParamValue,
  type TemplatePreviewParams,
} from "./templatePreviewCases";

interface TemplatePreviewPageProps {
  theme: "dark" | "light";
  topbarCollapsed: boolean;
  onToggleTopbar: () => void;
}

export function TemplatePreviewPage({
  theme,
  topbarCollapsed,
  onToggleTopbar,
}: TemplatePreviewPageProps) {
  const { templateId = "" } = useParams<{ templateId: string }>();
  const template = TEMPLATES.find((item) => item.id === templateId) ?? null;
  const previewCase = getTemplatePreviewCase(templateId);

  return template && previewCase ? (
    <TemplatePreviewContent
      key={previewCase.id}
      previewCase={previewCase}
      theme={theme}
      topbarCollapsed={topbarCollapsed}
      onToggleTopbar={onToggleTopbar}
    />
  ) : (
    <main className="mv-template-unavailable" role="status">
      <span>{template ? "IN PRODUCTION" : "404 / TEMPLATE NOT FOUND"}</span>
      <h1>{template ? `${template.title}案例仍在制作` : "没有找到这个模板"}</h1>
      <p>{template ? "正式案例完成后将开放预览。" : "链接可能已经失效。"}</p>
      <Link to="/templates">返回模板目录</Link>
    </main>
  );
}

function TemplatePreviewContent({
  previewCase,
  theme,
  topbarCollapsed,
  onToggleTopbar,
}: {
  previewCase: NonNullable<ReturnType<typeof getTemplatePreviewCase>>;
  theme: "dark" | "light";
  topbarCollapsed: boolean;
  onToggleTopbar: () => void;
}) {
  const [params, setParams] = useState<TemplatePreviewParams>(() => ({ ...previewCase.defaultParams }));
  const [playbackRevision, setPlaybackRevision] = useState(0);

  const baseScript = useMemo(() => previewCase.buildScript(params), [params, previewCase]);
  const sandbox = useInteractionSandbox(
    baseScript,
    previewCase.id,
    previewCase.interactionAdapters,
  );
  const script = sandbox.previewScript;
  const renderedParams = useMemo(
    () => paramsFromScript(previewCase, params, script),
    [params, previewCase, script],
  );
  const followups = useMemo(
    () => previewCase.buildFollowups(renderedParams, script),
    [renderedParams, previewCase, script],
  );
  const settledOpeningFrame = Math.max(0, (script.steps[0]?.end_frame ?? 1) - 1);
  // Rings mark the case's curated hands-on moments (1–3 per template), not
  // every step a parameter merely touches — scarcity keeps the cue readable.
  const parametricStepIds = previewCase.handsOnStepIds;

  const updateParam = (id: string, value: TemplatePreviewParamValue, resetPlayback: boolean) => {
    setParams({ ...renderedParams, [id]: value });
    if (resetPlayback) setPlaybackRevision((current) => current + 1);
  };

  const resetParams = () => {
    setParams({ ...previewCase.defaultParams });
    setPlaybackRevision((current) => current + 1);
  };

  return (
    <main className="mv-template-player-page">
      <div className="mv-template-player-page__player">
        <PlaybookPlayer
          key={`${previewCase.id}:${playbackRevision}`}
          script={script}
          initialFrame={settledOpeningFrame}
          theme={theme}
          parameterSlot={({ currentStepId }) => (
            <TemplatePreviewControls
              previewCase={previewCase}
              params={renderedParams}
              onChange={updateParam}
              onReset={resetParams}
              currentStepId={currentStepId}
            />
          )}
          followupSlot={({ currentStepId }) => (
            <StaticFollowupPanel
              key={currentStepId}
              questions={followups[currentStepId] ?? []}
              onApplyOperation={sandbox.apply}
            />
          )}
          enableTTS={false}
          narrationCaseId={previewCase.id}
          showCapabilityNotice={false}
          parametricStepIds={parametricStepIds}
          showLearningConsole
          topbarCollapsed={topbarCollapsed}
          onToggleTopbar={onToggleTopbar}
        />
      </div>
    </main>
  );
}

function paramsFromScript(
  previewCase: NonNullable<ReturnType<typeof getTemplatePreviewCase>>,
  fallback: TemplatePreviewParams,
  script: PlaybookScript,
): TemplatePreviewParams {
  const scriptValues = new Map(
    script.parameter_controls.map((control) => [control.id, control.value]),
  );
  return Object.fromEntries(previewCase.controls.map((control) => {
    const value = scriptValues.get(control.id) ?? fallback[control.id];
    return [control.id, control.kind === "select" ? String(value) : Number(value)];
  }));
}
