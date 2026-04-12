import { CodeAdapterPanel } from "../../components/CodeAdapterPanel";
import { HighlightedCode } from "../../components/HighlightedCode";
import { HtmlDebugPanel } from "../../components/HtmlDebugPanel";
import { PromptReferenceTool } from "../../components/PromptReferenceTool";
import { ProviderManager } from "../../components/ProviderManager";
import { ToolsDebugOverview } from "../../components/ToolsDebugOverview";
import { ToolsSidebar } from "../../components/ToolsSidebar";
import { TTSSettingsPanel } from "../../components/TTSSettingsPanel";
import { usePipelineStats } from "../../hooks/features/usePipelineStats";
import type { CustomProviderUpsertRequest, PipelineResponse, PipelineRunSummary, RuntimeCatalog, SkillDescriptor } from "../../types";

export interface ToolsPageProps {
  debugToolsOpen: boolean;
  setDebugToolsOpen: (open: boolean) => void;
  result: PipelineResponse | null;
  runtimeCatalog: RuntimeCatalog;
  prompt: string;
  sourceCode: string;
  detectedSourceLanguage: string;
  selectedRunId: string | null;
  resolvedPreviewHtmlUrl: string | null;
  resolvedPreviewVideoUrl: string | null;
  activeSkill: SkillDescriptor | null;
  runs: readonly PipelineRunSummary[];

  handleExportCurrent: () => void;
  handleCreateProvider: (payload: CustomProviderUpsertRequest) => Promise<void>;
  handleDeleteProvider: (name: string) => Promise<void>;
  handleUpdateRuntimeSettings: (payload: { mock_provider_enabled: boolean; tts: { enabled: boolean; backend: "auto" | "system" | "openai_compatible"; model: string; base_url?: string | null; api_key?: string | null; voice: string; rate_wpm: number; speed: number; max_chars: number; timeout_s?: number | null; } }) => Promise<void>;
}

export function ToolsPage({
  debugToolsOpen,
  setDebugToolsOpen,
  result,
  runtimeCatalog,
  prompt,
  sourceCode,
  detectedSourceLanguage,
  selectedRunId,
  resolvedPreviewHtmlUrl,
  resolvedPreviewVideoUrl,
  activeSkill,
  runs,
  handleExportCurrent,
  handleCreateProvider,
  handleDeleteProvider,
  handleUpdateRuntimeSettings,
}: ToolsPageProps) {
  const stats = usePipelineStats(runs);

  return (
    <section className="page-shell" id="tools">
      <div className="page-header">
        <span className="panel-kicker">Tools</span>
        <h2>工具与调试</h2>
        <p>生成脚本、原始返回、Provider 管理、Prompt 工具都集中在这里，采用浅色 Stitch 风格对齐。</p>
      </div>

      <div className="bento-grid" style={{ marginTop: "32px" }}>
        <section className="bento-card-xl" style={{ display: "flex", flexDirection: "column", gap: "16px", boxShadow: "none", background: "transparent" }}>
          <details
            className="accordion-item"
            open={debugToolsOpen}
            onToggle={(event) => {
              setDebugToolsOpen((event.currentTarget as HTMLDetailsElement).open);
            }}
          >
            <summary className="accordion-trigger">
              <div className="accordion-trigger-left">
                <div className="accordion-icon secondary">
                  <span className="material-symbols-outlined">terminal</span>
                </div>
                <div>
                  <div className="accordion-label">调试与生成脚本</div>
                  <div className="accordion-hint">执行本地系统健康检查</div>
                </div>
              </div>
              <span className="material-symbols-outlined accordion-arrow">expand_more</span>
            </summary>
            {debugToolsOpen ? (
              <div className="accordion-content">
                <div className="tools-dual-panel-grid">
                  <section className="bento-card tools-card-section">
                    <div style={{ fontSize: "0.625rem", fontWeight: 700, letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: "16px" }}>
                      运行诊断
                    </div>
                    {result ? (
                      <ul className="trace-list">
                        {result.runtime.agent_traces.map((trace) => (
                          <li key={`${trace.agent}-${trace.summary}`}>
                            <strong>{trace.agent}</strong>
                            <span>{trace.summary}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <div style={{ color: "var(--on-surface-variant)", fontSize: "0.875rem" }}>
                        生成任务后显示诊断信息
                      </div>
                    )}
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      style={{ marginTop: "16px" }}
                      onClick={handleExportCurrent}
                      disabled={!result}
                    >
                      导出当前任务 JSON
                    </button>
                  </section>

                  <section className="bento-card tools-card-section">
                    <div style={{ fontSize: "0.625rem", fontWeight: 700, letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: "16px" }}>
                      {result?.preview_html_url ? "生成的 HTML 脚本" : "生成的 Manim 脚本"}
                    </div>
                    {result?.renderer_script ? (
                      <div style={{ maxHeight: "200px", overflow: "auto" }}>
                        <HighlightedCode
                          code={result.renderer_script}
                          language={result.preview_html_url ? "html" : "python"}
                          className="highlighted-code-surface"
                        />
                      </div>
                    ) : (
                      <div style={{ color: "var(--on-surface-variant)", fontSize: "0.875rem" }}>
                        生成任务后显示脚本
                      </div>
                    )}
                  </section>
                </div>

                <ToolsDebugOverview
                  result={result}
                  prompt={prompt}
                  sourceCode={sourceCode}
                  sourceCodeLanguage={detectedSourceLanguage}
                  selectedRunId={selectedRunId}
                  resolvedPreviewHtmlUrl={resolvedPreviewHtmlUrl}
                  resolvedPreviewVideoUrl={resolvedPreviewVideoUrl}
                />
              </div>
            ) : null}
          </details>

          <details className="accordion-item" open>
            <summary className="accordion-trigger">
              <div className="accordion-trigger-left">
                <div className="accordion-icon primary">
                  <span className="material-symbols-outlined">code_blocks</span>
                </div>
                <div>
                  <div className="accordion-label">HTML 调试面板</div>
                  <div className="accordion-hint">直接输入 HTML 源码并在页内预览</div>
                </div>
              </div>
              <span className="material-symbols-outlined accordion-arrow">expand_more</span>
            </summary>
            <div className="accordion-content">
              <HtmlDebugPanel />
            </div>
          </details>

          <details className="accordion-item">
            <summary className="accordion-trigger">
              <div className="accordion-trigger-left">
                <div className="accordion-icon tertiary">
                  <span className="material-symbols-outlined">data_object</span>
                </div>
                <div>
                  <div className="accordion-label">代码转换测试</div>
                  <div className="accordion-hint">验证架构转换</div>
                </div>
              </div>
              <span className="material-symbols-outlined accordion-arrow">expand_more</span>
            </summary>
            <div className="accordion-content">
              <CodeAdapterPanel />
            </div>
          </details>

          <details className="accordion-item">
            <summary className="accordion-trigger">
              <div className="accordion-trigger-left">
                <div className="accordion-icon primary">
                  <span className="material-symbols-outlined">hub</span>
                </div>
                <div>
                  <div className="accordion-label">Provider 管理</div>
                  <div className="accordion-hint">{runtimeCatalog.providers.length} 个活动端点监控中</div>
                </div>
              </div>
              <span className="material-symbols-outlined accordion-arrow">expand_more</span>
            </summary>
            <div className="accordion-content">
              <div className="tools-dual-panel-grid">
                <ProviderManager
                  providers={runtimeCatalog.providers}
                  onCreateProvider={handleCreateProvider}
                  onDeleteProvider={handleDeleteProvider}
                />
                <TTSSettingsPanel
                  settings={runtimeCatalog.settings}
                  onSave={handleUpdateRuntimeSettings}
                />
              </div>
            </div>
          </details>

          <details className="accordion-item">
            <summary className="accordion-trigger">
              <div className="accordion-trigger-left">
                <div className="accordion-icon secondary">
                  <span className="material-symbols-outlined">psychology_alt</span>
                </div>
                <div>
                  <div className="accordion-label">Prompt 工具</div>
                  <div className="accordion-hint">A/B 测试大模型指令</div>
                </div>
              </div>
              <span className="material-symbols-outlined accordion-arrow">expand_more</span>
            </summary>
            <div className="accordion-content">
              <PromptReferenceTool
                providers={runtimeCatalog.providers}
                defaultProvider={runtimeCatalog.default_generation_provider}
              />
            </div>
          </details>
        </section>

        <ToolsSidebar activeSkill={activeSkill} stats={stats} />
      </div>
    </section>
  );
}
