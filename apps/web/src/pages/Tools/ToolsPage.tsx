import { CodeAdapterPanel } from "../../components/CodeAdapterPanel";
import { HighlightedCode } from "../../components/HighlightedCode";
import { HtmlDebugPanel } from "../../components/HtmlDebugPanel";
import { PromptReferenceTool } from "../../components/PromptReferenceTool";
import { ProviderManager } from "../../components/ProviderManager";
import { TTSSettingsPanel } from "../../components/TTSSettingsPanel";
import { usePipelineStats } from "../../hooks/features/usePipelineStats";
import type { CustomProviderUpsertRequest, PipelineResponse, PipelineRunSummary, RuntimeCatalog } from "../../types";

export interface ToolsPageProps {
  debugToolsOpen: boolean;
  setDebugToolsOpen: (open: boolean) => void;
  result: PipelineResponse | null;
  runtimeCatalog: RuntimeCatalog;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  activeSkill: any | null;
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

        <aside className="bento-card-md tools-side-column" style={{ boxShadow: "none", background: "transparent" }}>
          <div className="resource-sidebar">
            <div className="resource-sidebar-header">资源分配</div>
            <div className="resource-sidebar-value">
              <span className="resource-sidebar-number">84.2</span>
              <span className="resource-sidebar-unit">%</span>
            </div>
            <div className="resource-sidebar-desc">主节点执行效率</div>

            <div className="resource-progress-item">
              <div className="resource-progress-label">
                <span>计算负载</span>
                <span>62%</span>
              </div>
              <div className="resource-progress-bar">
                <div className="resource-progress-fill is-primary" style={{ width: "62%" }} />
              </div>
            </div>

            <div className="resource-progress-item">
              <div className="resource-progress-label">
                <span>内存缓存</span>
                <span>41%</span>
              </div>
              <div className="resource-progress-bar">
                <div className="resource-progress-fill is-secondary" style={{ width: "41%" }} />
              </div>
            </div>
          </div>

          <div className="bento-card tools-skill-card">
            <div style={{ fontSize: "0.625rem", fontWeight: 700, letterSpacing: "0.15em", textTransform: "uppercase", marginBottom: "16px" }}>
              当前 Skill
            </div>
            {activeSkill ? (
              <>
                <strong style={{ color: "var(--on-surface)" }}>{activeSkill.label}</strong>
                <p style={{ margin: "8px 0", fontSize: "0.75rem", color: "var(--on-surface-variant)" }}>
                  {activeSkill.description}
                </p>
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                  <span className="chip chip-outline">{activeSkill.id}</span>
                  <span className="chip chip-outline">{activeSkill.domain}</span>
                  <span className="chip chip-primary">
                    {activeSkill.supports_image_input ? "image" : "text"}
                  </span>
                </div>
              </>
            ) : (
              <div style={{ color: "var(--on-surface-variant)", fontSize: "0.875rem" }}>
                等待模型判断
              </div>
            )}
          </div>
        </aside>
      </div>

      <footer className="tools-footer">
        <div className="tools-footer-stat">
          <span className="tools-footer-label">总运行数</span>
          <span className="tools-footer-value">{stats.totalRuns.toLocaleString()}</span>
        </div>
        <div className="tools-footer-stat">
          <span className="tools-footer-label">错误频率</span>
          <span className="tools-footer-value is-error">{stats.errorRate}</span>
        </div>
        <div className="tools-footer-stat">
          <span className="tools-footer-label">24h 运行数</span>
          <span className="tools-footer-value">{stats.recentRuns}</span>
        </div>
        <div className="tools-footer-stat">
          <span className="tools-footer-label">成功率</span>
          <span className="tools-footer-value is-primary">{stats.successRate}</span>
        </div>
      </footer>
    </section>
  );
}
