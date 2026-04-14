import type { ProviderDescriptor, SkillDescriptor } from "../types";
import type { PipelineStats } from "../hooks/features/usePipelineStats";

interface ToolsSidebarProps {
  activeSkill: SkillDescriptor | null;
  stats: PipelineStats;
  providers: ProviderDescriptor[];
}

export function ToolsSidebar({ activeSkill, stats, providers }: ToolsSidebarProps) {
  const configuredProviders = providers.filter((p) => p.configured);

  return (
    <>
      <aside className="bento-card-md tools-side-column" style={{ boxShadow: "none", background: "transparent" }}>
        <div className="resource-sidebar">
          <div className="resource-sidebar-header">Provider 状态</div>
          {providers.length === 0 ? (
            <div className="provider-empty-state">
              <span className="material-symbols-outlined" style={{ fontSize: 32, color: "var(--outline)" }}>hub</span>
              <div className="provider-empty-state-text">尚未配置任何 Provider</div>
              <div className="provider-empty-state-hint">请在下方 Provider 管理中添加至少一个模型端点。</div>
            </div>
          ) : (
            <>
              <div className="resource-sidebar-value">
                <span className="resource-sidebar-number">{configuredProviders.length}</span>
                <span className="resource-sidebar-unit"> / {providers.length}</span>
              </div>
              <div className="resource-sidebar-desc">已配置</div>
              <div className="provider-status-list">
                {providers.map((provider) => (
                  <div key={provider.name} className="provider-status-item">
                    <span className={`provider-status-dot ${provider.configured ? "is-active" : ""}`} />
                    <span className="provider-status-label">{provider.label}</span>
                    <span className="provider-status-model">{provider.model}</span>
                  </div>
                ))}
              </div>
            </>
          )}
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
    </>
  );
}
