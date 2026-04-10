import { useMemo, useState } from "react";

import { HtmlPreviewPanel } from "./HtmlPreviewPanel";
import type { HtmlSandboxLoadState } from "./HtmlSandbox";

type DebugPhase = "idle" | "ready" | "loading" | "loaded" | "error";

const defaultHtml = `<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>HTML 调试面板</title>
    <style>
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        background: linear-gradient(135deg, #0f172a, #1e293b);
        color: #e2e8f0;
        font-family: system-ui, sans-serif;
      }

      .card {
        width: min(520px, calc(100vw - 32px));
        padding: 24px;
        border-radius: 20px;
        background: rgba(15, 23, 42, 0.88);
        border: 1px solid rgba(148, 163, 184, 0.24);
        box-shadow: 0 24px 80px rgba(15, 23, 42, 0.45);
      }

      h1 {
        margin: 0 0 12px;
        font-size: 28px;
      }

      p {
        margin: 0;
        line-height: 1.7;
        color: #cbd5e1;
      }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>HTML 调试面板</h1>
      <p>把你怀疑有问题的 HTML 直接贴到左侧并点击“渲染预览”，就能绕开提示词与后端生成链路，单独检查 HTML 自身是否能正常显示。</p>
    </div>
  </body>
</html>`;

function phaseLabel(phase: DebugPhase): string {
  switch (phase) {
    case "idle":
      return "等待输入";
    case "ready":
      return "可渲染";
    case "loading":
      return "加载中";
    case "loaded":
      return "已加载";
    case "error":
      return "加载失败";
  }
}

export function HtmlDebugPanel() {
  const [htmlInput, setHtmlInput] = useState(defaultHtml);
  const [renderedHtml, setRenderedHtml] = useState(defaultHtml);
  const [phase, setPhase] = useState<DebugPhase>("ready");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [renderKey, setRenderKey] = useState(0);

  const inputLength = useMemo(() => htmlInput.trim().length, [htmlInput]);

  function handleRender() {
    if (inputLength === 0) {
      setPhase("error");
      setErrorMessage("请先输入 HTML 源码，再开始渲染。");
      return;
    }

    setRenderedHtml(htmlInput);
    setPhase("loading");
    setErrorMessage(null);
    setRenderKey((current) => current + 1);
  }

  function handleReset() {
    setHtmlInput(defaultHtml);
    setRenderedHtml(defaultHtml);
    setPhase("ready");
    setErrorMessage(null);
    setRenderKey((current) => current + 1);
  }

  function handleClear() {
    setHtmlInput("");
    setRenderedHtml("");
    setPhase("idle");
    setErrorMessage(null);
  }

  function handleInputChange(value: string) {
    setHtmlInput(value);
    setErrorMessage(null);
    setPhase(value.trim().length > 0 ? "ready" : "idle");
  }

  function handleSandboxStateChange(state: HtmlSandboxLoadState) {
    if (state === "loading") {
      setPhase("loading");
      return;
    }
    if (state === "loaded") {
      setPhase("loaded");
      setErrorMessage(null);
      return;
    }
    setPhase("error");
    setErrorMessage("iframe 已加载但 HTML 仍未正常显示，请优先检查脚本初始化、外链资源或运行时异常。");
  }

  return (
    <section className="html-debug-panel">
      <div className="html-debug-panel__header">
        <div>
          <div className="panel-kicker">HTML Debug</div>
          <h3>HTML 本地调试面板</h3>
          <p>
            这里不会走提示词、Agent 或后端 HTML 生成链路，只会把你输入的 HTML 直接塞进 iframe 渲染。
          </p>
        </div>
        <div className={`html-debug-panel__phase is-${phase}`}>
          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
            code
          </span>
          {phaseLabel(phase)}
        </div>
      </div>

      <div className="html-debug-panel__grid">
        <div className="html-debug-panel__editor">
          <label className="html-debug-panel__label" htmlFor="html-debug-input">
            HTML 源码
          </label>
          <textarea
            id="html-debug-input"
            className="html-debug-panel__textarea"
            value={htmlInput}
            onChange={(event) => handleInputChange(event.target.value)}
            placeholder="把你要排查的 HTML 粘贴到这里"
            spellCheck={false}
          />

          <div className="html-debug-panel__actions">
            <button type="button" className="btn btn-primary" onClick={handleRender}>
              渲染预览
            </button>
            <button type="button" className="btn btn-secondary" onClick={handleReset}>
              恢复示例
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={handleClear}>
              清空
            </button>
          </div>

          <div className="html-debug-panel__hint">
            <strong>排查建议</strong>
            <span>
              这里不会读取共享编辑器 prompt、不会走 Agent，也不会请求后端 HTML 生成接口；右侧 iframe 只加载当前 textarea 里的 HTML（about:blank + srcDoc）。
            </span>
            <span>
              如果这里能正常显示，而 Studio / History 里的 HTML 仍异常，优先检查 `preview_html_url` 指向的后端产物、运行时初始化脚本和 ready 信号。
            </span>
          </div>

          {errorMessage ? <p className="error-text">{errorMessage}</p> : null}
        </div>

        <div className="html-debug-panel__preview">
          {renderedHtml.trim().length > 0 ? (
            <HtmlPreviewPanel
              key={renderKey}
              src="about:blank"
              srcDoc={renderedHtml}
              meta="本地 iframe 调试预览"
              expectReadySignal={false}
              onLoadStateChange={handleSandboxStateChange}
            />
          ) : (
            <div className="html-debug-panel__empty">
              <strong>还没有可渲染的 HTML</strong>
              <span>输入源码后点击“渲染预览”，右侧会直接显示 iframe 结果。</span>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
