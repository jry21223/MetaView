import { useEffect, useMemo, useState } from "react";
import type {
  TeachingDeckInput,
  TeachingDeckProject,
  TeachingDeckRenderer,
  TeachingDeckSlide,
  TeachingDeckSlideKind,
} from "../../entities/teaching-deck/types";
import {
  buildMetaViewPrompt,
  buildTeachingDeck,
  createBlankTeachingDeckSlide,
  DEFAULT_TEACHING_DECK_INPUT,
  normalizeTeachingDeckSlideOrder,
  TEACHING_DECK_RENDERER_LABELS,
  TEACHING_DECK_SLIDE_KIND_LABELS,
  validateTeachingDeck,
} from "../../features/teaching-deck/model/buildTeachingDeck";
import {
  clearTeachingDeckProject,
  loadTeachingDeckProject,
  saveTeachingDeckProject,
} from "../../features/teaching-deck/model/storage";
import {
  buildTeachingDeckPptx,
  teachingDeckPptxFilename,
} from "../../features/teaching-deck/lib/pptx";

interface TeachingDeckPageProps {
  onGenerateDynamicSlide: (prompt: string) => Promise<string>;
  onOpenRun: (runId: string) => void;
  canGenerateDynamic?: boolean;
  onRequireLogin?: () => void;
}

const SLIDE_KINDS = Object.keys(TEACHING_DECK_SLIDE_KIND_LABELS) as TeachingDeckSlideKind[];
const RENDERERS = Object.keys(TEACHING_DECK_RENDERER_LABELS) as TeachingDeckRenderer[];

export function TeachingDeckPage({
  onGenerateDynamicSlide,
  onOpenRun,
  canGenerateDynamic = true,
  onRequireLogin,
}: TeachingDeckPageProps) {
  const [project, setProject] = useState<TeachingDeckProject | null>(() => loadTeachingDeckProject());
  const [input, setInput] = useState<TeachingDeckInput>(() => project?.input ?? DEFAULT_TEACHING_DECK_INPUT);
  const [selectedSlideId, setSelectedSlideId] = useState<string | null>(() => project?.slides[0]?.id ?? null);
  const [actionError, setActionError] = useState<string | null>(null);

  const selectedSlide = project?.slides.find((slide) => slide.id === selectedSlideId)
    ?? project?.slides[0]
    ?? null;
  const validationIssues = useMemo(() => project ? validateTeachingDeck(project) : [], [project]);
  const dynamicCount = project?.slides.filter((slide) => slide.renderer === "metaview").length ?? 0;
  const readyDynamicCount = project?.slides.filter((slide) => slide.renderer === "metaview" && slide.dynamicState === "ready").length ?? 0;

  useEffect(() => {
    if (project) saveTeachingDeckProject(project);
  }, [project]);

  const updateProject = (mutator: (current: TeachingDeckProject) => TeachingDeckProject) => {
    setProject((current) => current ? { ...mutator(current), updatedAt: new Date().toISOString() } : current);
  };

  const planDeck = () => {
    const next = buildTeachingDeck(input);
    setProject(next);
    setSelectedSlideId(next.slides[0]?.id ?? null);
    setActionError(null);
  };

  const resetDeck = () => {
    clearTeachingDeckProject();
    setProject(null);
    setSelectedSlideId(null);
    setActionError(null);
  };

  const updateSlide = (patch: Partial<TeachingDeckSlide>) => {
    if (!selectedSlide) return;
    updateProject((current) => ({
      ...current,
      slides: current.slides.map((slide) => slide.id === selectedSlide.id ? { ...slide, ...patch } : slide),
    }));
  };

  const moveSelected = (delta: -1 | 1) => {
    if (!project || !selectedSlide) return;
    const index = project.slides.findIndex((slide) => slide.id === selectedSlide.id);
    const target = index + delta;
    if (index < 0 || target < 0 || target >= project.slides.length) return;
    const slides = [...project.slides];
    [slides[index], slides[target]] = [slides[target], slides[index]];
    updateProject((current) => ({ ...current, slides: normalizeTeachingDeckSlideOrder(slides) }));
  };

  const addSlide = () => {
    if (!project) return;
    const index = selectedSlide ? project.slides.findIndex((slide) => slide.id === selectedSlide.id) : project.slides.length - 1;
    const next = createBlankTeachingDeckSlide(project.id, project.slides.length + 1);
    const slides = [...project.slides];
    slides.splice(index + 1, 0, next);
    updateProject((current) => ({ ...current, slides: normalizeTeachingDeckSlideOrder(slides) }));
    setSelectedSlideId(next.id);
  };

  const deleteSelected = () => {
    if (!project || !selectedSlide || project.slides.length <= 1) return;
    const index = project.slides.findIndex((slide) => slide.id === selectedSlide.id);
    const slides = normalizeTeachingDeckSlideOrder(project.slides.filter((slide) => slide.id !== selectedSlide.id));
    updateProject((current) => ({ ...current, slides }));
    setSelectedSlideId(slides[Math.min(index, slides.length - 1)]?.id ?? null);
  };

  const generateDynamic = async () => {
    if (!project || !selectedSlide || selectedSlide.renderer !== "metaview") return;
    if (!canGenerateDynamic) {
      onRequireLogin?.();
      return;
    }
    setActionError(null);
    updateSlide({ dynamicState: "generating", dynamicError: null });
    try {
      const runId = await onGenerateDynamicSlide(buildMetaViewPrompt(project, selectedSlide));
      updateProject((current) => ({
        ...current,
        slides: current.slides.map((slide) => slide.id === selectedSlide.id
          ? { ...slide, metaViewRunId: runId, dynamicState: "ready", dynamicError: null }
          : slide),
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : "动态页生成失败";
      setActionError(message);
      updateSlide({ dynamicState: "failed", dynamicError: message });
    }
  };

  const exportPptx = () => {
    if (!project || validationIssues.length > 0) return;
    const bytes = buildTeachingDeckPptx(project, {
      runUrlBase: typeof window === "undefined" ? undefined : window.location.origin,
    });
    const blob = new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.presentationml.presentation" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = teachingDeckPptxFilename(project);
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  if (!project) {
    return (
      <main className="mv-teaching-body">
        <section className="mv-teaching-intake" aria-labelledby="teaching-deck-title">
          <p className="mv-eyebrow-mini">TEACHING DECK MVP 0.1</p>
          <h1 id="teaching-deck-title">把 MetaView 动态讲解编进一整堂课</h1>
          <p>先生成可确认的大纲。普通页保持可编辑 PPT，只有需要过程演绎的页面才交给 MetaView。</p>
          <div className="mv-teaching-intake__grid">
            <label>课程主题<input value={input.topic} onChange={(event) => setInput({ ...input, topic: event.target.value })} /></label>
            <label>学段年级<input value={input.grade} onChange={(event) => setInput({ ...input, grade: event.target.value })} /></label>
            <label>课时（分钟）<input type="number" min={10} max={90} value={input.durationMinutes} onChange={(event) => setInput({ ...input, durationMinutes: Number(event.target.value) })} /></label>
            <label className="mv-teaching-field--wide">教学目标<textarea rows={4} value={input.teachingGoals} onChange={(event) => setInput({ ...input, teachingGoals: event.target.value })} /></label>
            <label className="mv-teaching-field--wide">材料摘录（可选）<textarea rows={5} value={input.sourceMaterial} onChange={(event) => setInput({ ...input, sourceMaterial: event.target.value })} placeholder="MVP 先支持粘贴文字；该字段不会自动写入 localStorage。" /></label>
          </div>
          <div className="mv-teaching-intake__actions">
            <button type="button" className="mv-teaching-primary" onClick={planDeck}>生成课件大纲</button>
            <a href="/create" className="mv-teaching-secondary">返回 MetaView 工作台</a>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="mv-teaching-body" aria-label="教学课件编辑器">
      <header className="mv-teaching-header">
        <div>
          <p className="mv-eyebrow-mini">TEACHING DECK · {project.input.durationMinutes} MIN</p>
          <h1>{project.title}</h1>
          <p>{project.slides.length} 页 · {dynamicCount} 个动态页 · {readyDynamicCount} 个已生成</p>
        </div>
        <div className="mv-teaching-header__actions">
          <button type="button" className="mv-teaching-secondary" onClick={resetDeck}>重新规划</button>
          <button type="button" className="mv-teaching-primary" onClick={exportPptx} disabled={validationIssues.length > 0}>导出 PPTX</button>
        </div>
      </header>

      {validationIssues.length > 0 && (
        <div className="mv-teaching-warning" role="status">导出前还需处理 {validationIssues.length} 个结构问题：{validationIssues[0].message}</div>
      )}
      {actionError && <div className="mv-teaching-warning" role="alert">{actionError}</div>}

      <div className="mv-teaching-editor">
        <aside className="mv-teaching-slides" aria-label="课件页面">
          {project.slides.map((slide) => (
            <button key={slide.id} type="button" className={slide.id === selectedSlide?.id ? "is-active" : ""} aria-label={`第 ${slide.order} 页：${slide.title}`} onClick={() => setSelectedSlideId(slide.id)}>
              <span>{String(slide.order).padStart(2, "0")}</span>
              <strong>{slide.title}</strong>
              <small>{slide.renderer === "metaview" ? "MetaView" : "PPT"}</small>
            </button>
          ))}
        </aside>

        {selectedSlide && (
          <section className="mv-teaching-preview-column">
            <div className="mv-teaching-preview" aria-label={`第 ${selectedSlide.order} 页预览`}>
              <div className="mv-teaching-preview__accent" />
              <p className="mv-teaching-preview__meta">SLIDE {String(selectedSlide.order).padStart(2, "0")} · {selectedSlide.renderer === "metaview" ? "METAVIEW" : "PPTMASTER"}</p>
              <h2>{selectedSlide.title}</h2>
              <p className="mv-teaching-preview__goal">{selectedSlide.teachingGoal}</p>
              <ul>{selectedSlide.points.map((point, index) => <li key={`${selectedSlide.id}-${index}`}>{point}</li>)}</ul>
              {selectedSlide.renderer === "metaview" && (
                <div className="mv-teaching-preview__dynamic">动态策略：{selectedSlide.visualStrategy || "待指定"}</div>
              )}
            </div>
            <div className="mv-teaching-sequence-actions">
              <button type="button" onClick={() => moveSelected(-1)} disabled={selectedSlide.order === 1}>上移</button>
              <button type="button" onClick={() => moveSelected(1)} disabled={selectedSlide.order === project.slides.length}>下移</button>
              <button type="button" onClick={addSlide}>在后面加一页</button>
              <button type="button" onClick={deleteSelected} disabled={project.slides.length <= 1}>删除此页</button>
            </div>
          </section>
        )}

        {selectedSlide && (
          <aside className="mv-teaching-inspector" aria-label="页面设置">
            <h2>页面设置</h2>
            <label>页面标题<input value={selectedSlide.title} onChange={(event) => updateSlide({ title: event.target.value })} /></label>
            <label>教学目标<textarea rows={4} value={selectedSlide.teachingGoal} onChange={(event) => updateSlide({ teachingGoal: event.target.value })} /></label>
            <label>页面类型<select value={selectedSlide.kind} onChange={(event) => updateSlide({ kind: event.target.value as TeachingDeckSlideKind })}>{SLIDE_KINDS.map((kind) => <option key={kind} value={kind}>{TEACHING_DECK_SLIDE_KIND_LABELS[kind]}</option>)}</select></label>
            <label>生成器<select value={selectedSlide.renderer} onChange={(event) => updateSlide({ renderer: event.target.value as TeachingDeckRenderer, metaViewRunId: null, dynamicState: "idle" })}>{RENDERERS.map((renderer) => <option key={renderer} value={renderer}>{TEACHING_DECK_RENDERER_LABELS[renderer]}</option>)}</select></label>
            <label>页面内容<textarea rows={8} value={selectedSlide.points.join("\n")} onChange={(event) => updateSlide({ points: event.target.value.split("\n") })} /></label>

            {selectedSlide.renderer === "metaview" && (
              <div className="mv-teaching-dynamic-settings">
                <label>视觉策略<input value={selectedSlide.visualStrategy ?? ""} onChange={(event) => updateSlide({ visualStrategy: event.target.value })} /></label>
                <label>建议时长（秒）<input type="number" min={8} max={90} value={selectedSlide.durationSeconds ?? 25} onChange={(event) => updateSlide({ durationSeconds: Number(event.target.value) })} /></label>
                <button type="button" className="mv-teaching-primary" onClick={() => void generateDynamic()} disabled={selectedSlide.dynamicState === "generating"}>{selectedSlide.dynamicState === "generating" ? "正在生成…" : "生成此动态页"}</button>
                {selectedSlide.metaViewRunId && (
                  <div className="mv-teaching-run">
                    <code>{selectedSlide.metaViewRunId}</code>
                    <button type="button" onClick={() => onOpenRun(selectedSlide.metaViewRunId as string)}>打开播放器</button>
                  </div>
                )}
              </div>
            )}
          </aside>
        )}
      </div>
    </main>
  );
}
