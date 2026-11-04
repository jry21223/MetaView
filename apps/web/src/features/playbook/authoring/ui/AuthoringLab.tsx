import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from "react";
import { flushSync } from "react-dom";
import { Player } from "@remotion/player";
import { createExplorationSession, type ElementRef, type ExplorationSession } from "../../../../shared/playbook";
import { AUTHORING_PREVIEW_VARS } from "../../../../shared/config/authoringPreviewTheme";
import { PlaybookComposition } from "../../engine/composition/PlaybookComposition";
import { exampleCatalog, exampleRegistry, type AuthoringExample } from "../exampleCatalog";
import { compileAuthoringScript } from "../renderBridge";
import type { AuthoringFrame, AuthoringPrimitive } from "../types";
import { includeEndNodes, placePanel } from "./panelPlacement";
import "./authoringLab.css";

type Session = ExplorationSession<AuthoringFrame>;
type View = ReturnType<Session["read"]>;
const lightTheme = AUTHORING_PREVIEW_VARS as CSSProperties;
function openExample(example: AuthoringExample) {
  const session = createExplorationSession(example.document, exampleRegistry, example.provider);
  const target = session.read().work.elements.find((entry) => entry.id === example.defaultElementId);
  if (target) session.runtime().dispatch({ type: "select", elements: [target.ref] });
  return session;
}
function outputs(view: View) { return view.work.components.flatMap((component) => component.output ? [{ id: component.id, frame: component.output }] : []); }
function selectFocus(session: Session) {
  const view = session.read();
  const focus = outputs(view).find(({ frame }) => frame.focusElementId);
  const target = view.work.elements.find((element) => element.ref.componentId === focus?.id && element.id === focus.frame.focusElementId);
  if (target) session.runtime().dispatch({ type: "select", elements: [target.ref] });
}
function seek(session: Session, frame: number) {
  const previous = session.read().work.state;
  const next = session.runtime().dispatch({ type: "seek", sceneId: previous.sceneId, frame });
  const selection = previous.selection.filter((ref) => next.elements.some((element) => element.ref.componentId === ref.componentId && element.ref.elementId === ref.elementId));
  if (selection.length) session.runtime().dispatch({ type: "select", elements: selection });
}
async function changeWork(update: () => void) {
  if (!document.startViewTransition || matchMedia("(prefers-reduced-motion: reduce)").matches) { update(); return; }
  const transition = document.startViewTransition(() => flushSync(update));
  await transition.finished.catch(() => undefined);
}
function HitShape({ mark, picking = false }: { mark: AuthoringPrimitive; picking?: boolean }) {
  switch (mark.shape) {
    case "circle": return <circle cx={mark.x} cy={mark.y} r={mark.r + (picking ? 5 : 0)} />;
    case "ellipse": return <ellipse cx={mark.x} cy={mark.y} rx={mark.rx} ry={mark.ry} transform={`rotate(${mark.rotation ?? 0} ${mark.x} ${mark.y})`} />;
    case "line": return <line x1={mark.x} y1={mark.y} x2={mark.x2} y2={mark.y2} />;
    case "polygon": return <polygon points={mark.points.map((point) => point.join(",")).join(" ")} />;
    case "text": {
      const size = mark.fontSize ?? 16;
      const width = Array.from(mark.text).reduce((sum, char) => sum + size * (char.charCodeAt(0) > 127 ? 1 : .6), 0);
      const x = mark.x;
      return <rect x={x - 3} y={mark.y - size} width={width + 6} height={size * 1.5} rx={3} />;
    }
  }
}
function WorkCanvas({ view, onSelect, disabled }: { view: View; onSelect(ref: ElementRef): void; disabled: boolean }) {
  const script = useMemo(() => compileAuthoringScript(view.work, view.document.title), [view]);
  const selection = view.work.state.selection[0];
  return <div className="authoring-stage" aria-label="交互作品画布">
    <Player component={PlaybookComposition} inputProps={{ script, theme: "light" as const, showSubtitles: false, showDiagnostics: false }} durationInFrames={script.total_frames} compositionWidth={1000} compositionHeight={560} fps={30} initialFrame={30} controls={false} clickToPlay={false} doubleClickToFullscreen={false} style={{ width: "100%", height: "100%" }} />
    <svg className="authoring-hit-surface" viewBox="0 0 1000 560" aria-label="选择画布元素">
      {outputs(view).flatMap(({ id, frame }) => frame.primitives.map((mark) => {
        const element = view.work.elements.find((entry) => entry.ref.componentId === id && entry.id === mark.elementId);
        if (!element) return null;
        const active = selection?.componentId === id && selection.elementId === mark.elementId;
        return <g key={`${id}:${mark.elementId}`} role="button" tabIndex={disabled ? -1 : 0} aria-label={`选择${element.label}${element.role === "text" ? "文字" : ""}`} aria-pressed={active} aria-disabled={disabled} className={`authoring-hit ${active ? "is-selected" : ""} ${mark.shape === "ellipse" || mark.shape === "line" ? "is-hollow" : ""}`} style={active ? { viewTransitionName: "exploration-focus" } : undefined} onClick={() => !disabled && onSelect(element.ref)} onKeyDown={(event) => { if (!disabled && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); onSelect(element.ref); } }}>
          {active && <g className="authoring-selection-glow" aria-hidden="true"><HitShape mark={mark} /></g>}
          <g className="authoring-interaction-outline" aria-hidden="true"><HitShape mark={mark} /></g>
          <HitShape mark={mark} picking />
        </g>;
      }))}
    </svg>
  </div>;
}
export function AuthoringLab({ initialExampleId }: { initialExampleId?: string }) {
  const initial = exampleCatalog.find((entry) => entry.id === initialExampleId) ?? exampleCatalog[0];
  const [example, setExample] = useState(initial);
  const [session, setSession] = useState(() => openExample(initial));
  const [view, setView] = useState(() => session.read());
  const [text, setText] = useState("");
  const [proposalOpen, setProposalOpen] = useState(false);
  const [working, setWorking] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState("");
  const operation = useRef(0);
  const paperRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const [panelOpen, setPanelOpen] = useState(true);
  const child = view.ancestors.length > 0;
  const turn = view.turns.at(-1);
  const frames = outputs(view);
  const selectedRef = view.work.state.selection[0];
  const selected = view.work.elements.find((element) => element.ref.componentId === selectedRef?.componentId && element.id === selectedRef?.elementId);
  useLayoutEffect(() => {
    const paper = paperRef.current;
    const panel = panelRef.current;
    if (!paper || !panel) return;
    const shape = paper.querySelector(".authoring-hit.is-selected > :last-child");
    function position() {
      if (!paper || !panel || !shape) return;
      const bounds = paper.getBoundingClientRect();
      const rect = shape.getBoundingClientRect();
      let extent = { left: rect.left, right: rect.right };
      if (typeof SVGLineElement !== "undefined" && shape instanceof SVGLineElement) {
        const matrix = shape.getScreenCTM();
        if (matrix) {
          const endpoints = [
            [shape.x1.baseVal.value, shape.y1.baseVal.value],
            [shape.x2.baseVal.value, shape.y2.baseVal.value],
          ].map(([x, y]) => ({ x: matrix.a * x + matrix.c * y + matrix.e, y: matrix.b * x + matrix.d * y + matrix.f }));
          const nodes = Array.from(paper.querySelectorAll(".authoring-hit > circle:last-child"), (node) => node.getBoundingClientRect());
          extent = includeEndNodes(rect, endpoints, nodes);
        }
      }
      const { x, y } = placePanel(bounds, panel.getBoundingClientRect(), {
        left: extent.left - bounds.left, right: extent.right - bounds.left,
        centerY: (rect.top + rect.bottom) / 2 - bounds.top,
      });
      panel.style.setProperty("--panel-x", `${x}px`);
      panel.style.setProperty("--panel-y", `${y}px`);
    }
    position();
    const observer = new ResizeObserver(position);
    observer.observe(paper);
    observer.observe(panel);
    return () => observer.disconnect();
  }, [view, panelOpen]);
  function closePanel() {
    setPanelOpen(false);
    paperRef.current?.querySelector<SVGGElement>(".authoring-hit.is-selected")?.focus();
  }
  useEffect(() => () => session.cancel(), [session]);
  useEffect(() => {
    if (!playing || working) return;
    let handle = 0;
    let last = 0;
    const tick = (time: number) => {
      if (time - last >= 1000 / 30) {
        seek(session, session.read().work.state.frame + 1);
        setView(session.read()); last = time;
      }
      handle = requestAnimationFrame(tick);
    };
    handle = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(handle);
  }, [session, playing, working]);
  function pick(ref: ElementRef) {
    setPanelOpen(true); setPlaying(false); session.runtime().dispatch({ type: "select", elements: [ref] });
    setView(session.read()); setText(""); setProposalOpen(false); setError("");
  }
  function switchExample(id: string) {
    const next = exampleCatalog.find((entry) => entry.id === id);
    if (!next) return;
    operation.current++; session.cancel(); const fresh = openExample(next);
    setPanelOpen(true); setExample(next); setSession(fresh); setView(fresh.read());
    setText(""); setProposalOpen(false); setPlaying(false); setError("");
  }
  async function ask(event: FormEvent) {
    event.preventDefault(); if (!text.trim() || working) return;
    const current = ++operation.current;
    setPlaying(false); setWorking(true); setError("");
    try { await session.ask({ id: `ask-${current}`, prompt: text.trim() }); if (current === operation.current) { setView(session.read()); setText(""); setProposalOpen(false); } }
    catch (reason) { if (current === operation.current) setError(reason instanceof Error ? reason.message : "无法准备回复"); }
    finally { if (current === operation.current) setWorking(false); }
  }
  async function explore() {
    if (!turn?.reply.proposal || working) return;
    const current = ++operation.current;
    setPlaying(false); setWorking(true); setError("");
    try {
      await session.explore({ id: `explore-${current}`, proposalId: turn.reply.proposal.id });
      selectFocus(session);
      if (current === operation.current) await changeWork(() => { setView(session.read()); setProposalOpen(false); setText(""); });
    } catch (reason) { if (current === operation.current) setError(reason instanceof Error ? reason.message : "无法打开探索作品"); }
    finally { if (current === operation.current) setWorking(false); }
  }
  async function back() {
    if (working) return;
    setPlaying(false); setWorking(true); setError("");
    try { session.back(); setPanelOpen(true); await changeWork(() => { setView(session.read()); setProposalOpen(false); setText(""); }); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "无法返回作品"); }
    finally { setWorking(false); }
  }
  return <main className="authoring-lab" style={lightTheme}>
    <header className="authoring-top"><span className="authoring-brand">MetaView</span><span className="authoring-slogan">探索你想看的世界</span><label className="authoring-example-label">示例作品<select aria-label="示例作品" value={example.id} onChange={(event) => switchExample(event.target.value)} disabled={working}>{exampleCatalog.map((entry) => <option key={entry.id} value={entry.id}>{entry.title}</option>)}</select></label></header>
    <section className="authoring-work-heading"><div>{child && <button aria-label="返回父作品" onClick={() => void back()} disabled={working}>← {view.ancestors.at(-1)?.title}</button>}<span className="authoring-breadcrumb">{child ? "/" : "我的作品 /"}</span><h1>{view.document.title}</h1><span className="authoring-draft">草稿</span></div><span className="authoring-local">本地探索预览</span></section>
    <section className="authoring-workspace">
      <div className="authoring-canvas-copy"><h2>{frames.find(({ frame }) => frame.description)?.frame.description ?? view.document.title}</h2></div>
      <div className="authoring-body" ref={paperRef}>
        <WorkCanvas view={view} disabled={working} onSelect={pick} />
        {panelOpen && <aside ref={panelRef} className="authoring-panel" aria-label="元素对话与探索" onKeyDown={(event) => { if (event.key === "Escape" && !working) closePanel(); }}>
          <div className="authoring-reference"><i /><strong>{selected?.label ?? "当前作品"}</strong><button className="authoring-close" aria-label="收起提问框" onClick={closePanel} disabled={working}>×</button></div>
          {child && <div className="authoring-observation"><span className="authoring-eyebrow">观察与实验</span>{frames.flatMap(({ id, frame }) => frame.info.map((line, index) => <p key={`${id}:${index}`}>{line}</p>))}</div>}
          {turn && <div className="authoring-conversation" data-testid="conversation"><div className="authoring-user-question"><small>你 · 针对{turn.request.elements.map((element) => element.label).join("、") || "当前作品"}</small><p>{turn.request.prompt}</p></div><strong className="authoring-answer-name">MetaView</strong>{turn.reply.paragraphs.map((paragraph, index) => <p key={index}>{paragraph}</p>)}{turn.reply.references?.map((reference) => <a key={reference.url} href={reference.url} target="_blank" rel="noreferrer">{reference.label} ↗</a>)}
            {turn.reply.proposal && (!proposalOpen ? <button className="authoring-explore-invite" aria-label="查看探索提案" onClick={() => { setPlaying(false); setProposalOpen(true); }}>＋ 把它做成一个交互探索 <span>→</span></button> : <section className="authoring-proposal"><span className="authoring-eyebrow">新的探索作品</span><h3>{turn.reply.proposal.title}</h3><p>{turn.reply.proposal.summary}</p><ul>{turn.reply.proposal.capabilities.map((capability) => <li key={capability}>{capability}</li>)}</ul><button className="authoring-primary" aria-label="创建探索作品" onClick={() => void explore()} disabled={working}>创建探索作品 <span>↗</span></button><button className="authoring-cancel" onClick={() => setProposalOpen(false)} disabled={working}>先留在这里</button></section>)}
          </div>}
          {!proposalOpen && <form className="authoring-prompt" onSubmit={(event) => void ask(event)}><textarea id="authoring-prompt" aria-label="问题或修改要求" placeholder={turn ? "继续追问或修改…" : "你想了解或改变什么？"} value={text} onChange={(event) => setText(event.target.value)} disabled={working} /><div className="authoring-send-row"><button type="submit" aria-label="发送问题" disabled={working || !text.trim()}>↑</button></div></form>}
          {!turn && !child && <div className="authoring-hints">{example.hints.slice(0, 2).map((hint) => <button key={hint} aria-label={hint} onClick={() => setText(hint)} disabled={working}>{hint}<span>↗</span></button>)}</div>}
          {error && <p className="authoring-error" role="alert">{error}</p>}
          {working && <span className="authoring-busy" role="status">正在准备探索内容…</span>}
        </aside>}
      </div>
      <footer className="authoring-controls"><button aria-label={playing ? "暂停探索" : "播放探索"} onClick={() => setPlaying(!playing)} disabled={working}>{playing ? "Ⅱ" : "▷"}</button><span>{playing ? "播放中" : "已暂停"}</span>{frames.flatMap(({ frame }) => frame.controls.map((control) => <label key={`${control.componentId}:${control.portId}`}>{control.label}<input aria-label={control.label} type="range" value={control.value} min={control.min} max={control.max} step={control.step} disabled={working} onChange={(event) => { session.runtime().dispatch({ type: "emit", componentId: control.componentId, portId: control.portId, value: Number(event.target.value) }); setView(session.read()); }} /><output>{control.value}</output></label>))}<span className="authoring-frame-note">点击元素继续探索</span></footer>
    </section>
    <footer className="authoring-foot"><span>{child && `来自：${view.ancestors.at(-1)?.title}`}</span><span>预置内容 · 未连接真实 AI</span></footer>
  </main>;
}
