import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { PlaybookPlayer } from "../../features/playbook/engine/player/PlaybookPlayer";
import { TEMPLATES } from "./templates";
import { PublicTemplatesLayout } from "./PublicTemplatesLayout";
import { usePublicTemplatesTheme } from "./publicTemplatesTheme";
import { StaticFollowupPanel } from "./StaticFollowupPanel";
import { TemplatePreviewControls } from "./TemplatePreviewControls";
import {
  getTemplatePreviewCase,
  type TemplatePreviewParamValue,
  type TemplatePreviewParams,
} from "./templatePreviewCases";

export function TemplatePreviewPage() {
  const { templateId = "" } = useParams<{ templateId: string }>();
  const template = TEMPLATES.find((item) => item.id === templateId) ?? null;
  const previewCase = getTemplatePreviewCase(templateId);

  return (
    <PublicTemplatesLayout player={Boolean(previewCase)}>
      {template && previewCase ? (
        <TemplatePreviewContent key={previewCase.id} previewCase={previewCase} />
      ) : (
        <main className="mv-template-unavailable" role="status">
          <span>{template ? "IN PRODUCTION" : "404 / TEMPLATE NOT FOUND"}</span>
          <h1>{template ? `${template.title}案例仍在制作` : "没有找到这个模板"}</h1>
          <p>{template ? "它不会触发生成任务；正式案例完成后才会开放预览。" : "链接可能已经失效。"}</p>
          <Link to="/templates">返回模板目录</Link>
        </main>
      )}
    </PublicTemplatesLayout>
  );
}

function TemplatePreviewContent({
  previewCase,
}: {
  previewCase: NonNullable<ReturnType<typeof getTemplatePreviewCase>>;
}) {
  const theme = usePublicTemplatesTheme();
  const [params, setParams] = useState<TemplatePreviewParams>(() => ({ ...previewCase.defaultParams }));
  const [playbackRevision, setPlaybackRevision] = useState(0);

  const script = useMemo(() => previewCase.buildScript(params), [params, previewCase]);
  const director = useMemo(() => previewCase.buildDirector(script), [previewCase, script]);
  const followups = useMemo(
    () => previewCase.buildFollowups(params, script),
    [params, previewCase, script],
  );

  const updateParam = (id: string, value: TemplatePreviewParamValue, resetPlayback: boolean) => {
    setParams((current) => ({ ...current, [id]: value }));
    if (resetPlayback) setPlaybackRevision((current) => current + 1);
  };

  const resetParams = () => {
    setParams({ ...previewCase.defaultParams });
    setPlaybackRevision((current) => current + 1);
  };

  return (
    <main className="mv-template-player-page">
      <div className="mv-template-player-page__back">
        <Link to="/templates">← 返回模板目录</Link>
        <span>静态案例 · 不调用模型</span>
      </div>
      <div className="mv-template-player-page__player">
        <PlaybookPlayer
          key={`${previewCase.id}:${playbackRevision}`}
          script={script}
          director={director}
          theme={theme}
          parameterSlot={(
            <TemplatePreviewControls
              previewCase={previewCase}
              params={params}
              onChange={updateParam}
              onReset={resetParams}
            />
          )}
          followupSlot={({ currentStepId }) => (
            <StaticFollowupPanel
              key={currentStepId}
              questions={followups[currentStepId] ?? []}
            />
          )}
          enableTTS={false}
          showLearningConsole
        />
      </div>
    </main>
  );
}
