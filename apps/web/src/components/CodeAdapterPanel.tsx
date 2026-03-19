import { useState } from "react";

import { prepareManimScript, renderManimScript } from "../api/client";
import type {
  ManimScriptPrepareResponse,
  ManimScriptRenderResponse,
} from "../types";

const defaultSource = `\`\`\`python
def construct(self):
    title = Text("Bubble Sort")
    self.play(Write(title))
\`\`\``;

export function CodeAdapterPanel() {
  const [source, setSource] = useState(defaultSource);
  const [sceneClassName, setSceneClassName] = useState("GeneratedScene");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ManimScriptPrepareResponse | null>(null);
  const [renderResult, setRenderResult] = useState<ManimScriptRenderResponse | null>(null);

  function resolveMediaUrl(url: string): string {
    if (/^https?:\/\//.test(url)) {
      return url;
    }
    const apiBaseUrl = String(import.meta.env.VITE_API_BASE_URL ?? "").trim();
    if (!apiBaseUrl) {
      return url;
    }
    return new URL(url, `${apiBaseUrl.replace(/\/$/, "")}/`).toString();
  }

  async function handlePrepare() {
    setLoading(true);
    setError(null);

    try {
      const prepared = await prepareManimScript(source, sceneClassName);
      setResult(prepared);
      setRenderResult(null);
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : "代码转换失败",
      );
      setResult(null);
      setRenderResult(null);
    } finally {
      setLoading(false);
    }
  }

  async function handleRender() {
    setLoading(true);
    setError(null);

    try {
      const rendered = await renderManimScript(source, sceneClassName, true);
      setResult(rendered);
      setRenderResult(rendered);
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : "代码渲染失败",
      );
      setRenderResult(null);
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="panel panel-code-adapter panel-nested">
      <div className="panel-header">
        <span className="panel-kicker">Code Test</span>
        <h3>自定义代码转换测试</h3>
        <p>贴入原始文本或代码块，调用后端脚本转换成可运行的 Python Manim 场景。</p>
      </div>

      <div className="prompt-form">
        <label>
          <span>原始输入</span>
          <textarea
            rows={10}
            value={source}
            onChange={(event) => setSource(event.target.value)}
            placeholder="可粘贴 LLM 返回、Markdown 代码块或不完整的 construct() 片段。"
          />
        </label>

        <label>
          <span>Scene 类名</span>
          <input
            value={sceneClassName}
            onChange={(event) => setSceneClassName(event.target.value)}
          />
        </label>

        <div className="form-actions">
          <button
            type="button"
            onClick={handlePrepare}
            disabled={loading || source.trim().length === 0}
          >
            {loading ? "转换中..." : "转换为 Manim 脚本"}
          </button>
          <button
            type="button"
            className="ghost-button"
            onClick={handleRender}
            disabled={loading || source.trim().length === 0}
          >
            {loading ? "渲染中..." : "转换并真实渲染"}
          </button>
        </div>
      </div>

      {error ? <p className="error-text">{error}</p> : null}
      {result ? (
        <div className="code-adapter-result">
          <div className="runtime-summary compact-runtime-summary">
            <div>
              <span>Scene</span>
              <strong>{result.scene_class_name}</strong>
              <small>{result.is_runnable ? "runnable" : "not ready"}</small>
            </div>
          </div>
          <ul className="diagnostic-list">
            {result.diagnostics.map((diagnostic, index) => (
              <li key={`prepare-${index}`}>
                <strong>prepare</strong>
                <span>{diagnostic}</span>
              </li>
            ))}
          </ul>
          {renderResult ? (
            <div className="preview-video-shell preview-video-shell-compact">
              <video
                className="preview-video"
                src={resolveMediaUrl(renderResult.preview_video_url)}
                controls
                playsInline
              />
            </div>
          ) : null}
          <pre>{result.code}</pre>
        </div>
      ) : null}
    </section>
  );
}
