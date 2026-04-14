interface AppChromeProps {
  activePage: "studio" | "history" | "tools";
  theme: "dark" | "light";
  setTheme: (updater: (current: "dark" | "light") => "dark" | "light") => void;
  onPageChange: (page: "studio" | "history" | "tools") => void;
}

const navigationItems = [
  { page: "studio", icon: "dashboard", mobileIcon: "workspaces", label: "工作台" },
  { page: "history", icon: "inventory_2", mobileIcon: "history", label: "任务历史" },
  { page: "tools", icon: "settings", mobileIcon: "tune", label: "设置" },
] as const;

export function AppChrome({ activePage, theme, setTheme, onPageChange }: AppChromeProps) {
  return (
    <>
      {/* Compact topbar — only shown when sidebar is hidden (≤1024px) */}
      <header className="mobile-topbar">
        <div className="topbar-brand" style={{ padding: 0 }}>
          <span className="topbar-neon-strip" />
          <div className="brand-text-group">
            <span className="topbar-brand-text">MetaView</span>
            <span className="topbar-brand-subtitle">THEORETICAL CANVAS</span>
          </div>
        </div>
        <div className="topbar-actions">
          <button
            type="button"
            className="topbar-icon-btn"
            onClick={() => setTheme((current) => (current === "dark" ? "light" : "dark"))}
            title={theme === "dark" ? "切换到浅色模式" : "切换到深色模式"}
          >
            <span className="material-symbols-outlined">
              {theme === "dark" ? "light_mode" : "dark_mode"}
            </span>
          </button>
          <div className="topbar-avatar">MV</div>
        </div>
      </header>

      <aside className="sidebar">
        <div className="sidebar-brand">
          <div className="topbar-brand" style={{ padding: 0 }}>
            <span className="topbar-neon-strip" />
            <div className="brand-text-group">
              <span className="topbar-brand-text">MetaView</span>
              <span className="topbar-brand-subtitle">THEORETICAL CANVAS</span>
            </div>
          </div>
        </div>

        <nav className="sidebar-nav">
          {navigationItems.map((item) => (
            <button
              key={item.page}
              type="button"
              className={`sidebar-nav-item ${activePage === item.page ? "is-active" : ""}`}
              onClick={() => onPageChange(item.page)}
            >
              <span className="material-symbols-outlined">{item.icon}</span>
              {item.label}
            </button>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-status">
            <span className="sidebar-status-dot" />
            <span className="sidebar-status-text">Core Nodes Online</span>
          </div>
          <div className="sidebar-progress">
            <div className="sidebar-progress-bar" style={{ width: "88%" }} />
          </div>
        </div>
      </aside>

      <div className="floating-actions">
        <button
          type="button"
          className="topbar-icon-btn"
          onClick={() => setTheme((current) => (current === "dark" ? "light" : "dark"))}
          title={theme === "dark" ? "切换到浅色模式" : "切换到深色模式"}
        >
          <span className="material-symbols-outlined">
            {theme === "dark" ? "light_mode" : "dark_mode"}
          </span>
        </button>
        <div className="topbar-avatar">MV</div>
      </div>

      <nav className="mobile-nav">
        {navigationItems.map((item) => (
          <button
            key={item.page}
            type="button"
            className={`mobile-nav-item ${activePage === item.page ? "is-active" : ""}`}
            onClick={() => onPageChange(item.page)}
          >
            <span className="material-symbols-outlined">{item.mobileIcon}</span>
            {item.page === "history" ? "历史" : item.label}
          </button>
        ))}
      </nav>
    </>
  );
}
