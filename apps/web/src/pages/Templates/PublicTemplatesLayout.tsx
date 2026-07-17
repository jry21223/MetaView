import { useMemo, type ReactNode } from "react";
import { Link, NavLink } from "react-router-dom";
import {
  TWEAK_DEFAULTS,
  themeMode,
  themeVars,
  useTweaks,
} from "../../features/studio-editor/hooks/useTweaks";
import { THEME_PALETTE } from "../../shared/config/themePalette";
import { publicTemplatesThemeContext } from "./publicTemplatesTheme";

export function PublicTemplatesLayout({
  children,
  player = false,
}: {
  children: ReactNode;
  player?: boolean;
}) {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const mode = themeMode(t);
  const css = useMemo(
    () => themeVars({ ...t, theme: mode, accent: THEME_PALETTE[mode].accent }),
    [mode, t],
  );

  return (
    <div
      className={`mv-root mv-${mode} mv-theme-${mode} mv-density-${t.density} mv-public-templates${player ? " is-player" : ""}`}
      data-theme={mode}
      style={css}
    >
      <header className="mv-public-templates__header">
        <Link className="mv-public-templates__brand" to="/" aria-label="MetaView 首页">
          <img className="mv-brand-strip" src="/brand/metaview-mark.svg" alt="" />
          <span>
            <strong>MetaView</strong>
            <small>THEORETICAL CANVAS</small>
          </span>
        </Link>
        <nav className="mv-public-templates__nav" aria-label="模板导航">
          <NavLink to="/templates" className={({ isActive }) => isActive ? "is-active" : undefined}>
            模板
          </NavLink>
          <Link className="mv-public-templates__create" to="/create">开始创建</Link>
          <button
            type="button"
            aria-label={mode === "dark" ? "切换浅色主题" : "切换深色主题"}
            onClick={() => setTweak("theme", mode === "dark" ? "light" : "dark")}
          >
            {mode === "dark" ? "浅色" : "深色"}
          </button>
        </nav>
      </header>
      <publicTemplatesThemeContext.Provider value={mode}>{children}</publicTemplatesThemeContext.Provider>
    </div>
  );
}
