import type { SkillDescriptor } from "../types";
import type { PipelineStats } from "../hooks/features/usePipelineStats";

interface ToolsSidebarProps {
  activeSkill: SkillDescriptor | null;
  stats: PipelineStats;
}

export function ToolsSidebar({ activeSkill, stats }: ToolsSidebarProps) {
  return (
    <>
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
