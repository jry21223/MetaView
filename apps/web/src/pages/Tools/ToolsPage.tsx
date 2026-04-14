import { PromptReferenceTool } from "../../components/PromptReferenceTool";
import { ProviderManager } from "../../components/ProviderManager";
import { ToolsSidebar } from "../../components/ToolsSidebar";
import { TTSSettingsPanel } from "../../components/TTSSettingsPanel";
import { usePipelineStats } from "../../hooks/features/usePipelineStats";
import type { CustomProviderUpsertRequest, PipelineRunSummary, RuntimeCatalog, SkillDescriptor } from "../../types";

export interface ToolsPageProps {
  runtimeCatalog: RuntimeCatalog;
  activeSkill: SkillDescriptor | null;
  runs: readonly PipelineRunSummary[];

  handleCreateProvider: (payload: CustomProviderUpsertRequest) => Promise<void>;
  handleDeleteProvider: (name: string) => Promise<void>;
  handleUpdateRuntimeSettings: (payload: { mock_provider_enabled: boolean; tts: { enabled: boolean; backend: "auto" | "system" | "openai_compatible"; model: string; base_url?: string | null; api_key?: string | null; voice: string; rate_wpm: number; speed: number; max_chars: number; timeout_s?: number | null; } }) => Promise<void>;
}

export function ToolsPage({
  runtimeCatalog,
  activeSkill,
  runs,
  handleCreateProvider,
  handleDeleteProvider,
  handleUpdateRuntimeSettings,
}: ToolsPageProps) {
  const stats = usePipelineStats(runs);
  const configuredCount = runtimeCatalog.providers.filter((p) => p.configured).length;

  return (
    <section className="page-shell" id="tools">
      <div className="page-header">
        <span className="panel-kicker">Settings</span>
        <h2>系统设置</h2>
        <p>管理模型 Provider、TTS 配置与 Prompt 实验工具。</p>
      </div>

      <div className="bento-grid" style={{ marginTop: "32px" }}>
        <section className="bento-card-xl" style={{ display: "flex", flexDirection: "column", gap: "16px", boxShadow: "none", background: "transparent" }}>
          <details className="accordion-item" open>
            <summary className="accordion-trigger">
              <div className="accordion-trigger-left">
                <div className="accordion-icon primary">
                  <span className="material-symbols-outlined">hub</span>
                </div>
                <div>
                  <div className="accordion-label">Provider 管理</div>
                  <div className={`accordion-hint ${configuredCount === 0 ? "is-warning" : ""}`}>
                    {configuredCount === 0
                      ? "尚未配置 — 请添加至少一个 Provider"
                      : `${configuredCount} 个 Provider 已配置`}
                  </div>
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

        <ToolsSidebar activeSkill={activeSkill} stats={stats} providers={runtimeCatalog.providers} />
      </div>
    </section>
  );
}
