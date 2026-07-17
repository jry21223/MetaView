import { useMemo, type ReactNode } from "react";
import { Link, NavLink } from "react-router-dom";
import {
  TWEAK_DEFAULTS,
  themeMode,
  themeVars,
  useTweaks,
} from "../../studio-editor/hooks/useTweaks";
import { THEME_PALETTE } from "../../../shared/config/themePalette";
import { publicShowcaseThemeContext } from "./publicShowcaseTheme";

export function PublicShowcaseLayout({ children }: { children: ReactNode }) {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const mode = themeMode(t);
  const css = useMemo(
    () =>
      themeVars({
        ...t,
        theme: mode,
        accent: THEME_PALETTE[mode].accent,
      }),
    [mode, t],
  );

  return (
    <div
      className={`mv-root mv-${mode} mv-theme-${mode} mv-density-${t.density} mv-public-showcase`}
      data-theme={mode}
      style={css}
    >
      <header className="mv-public-showcase__header">
        <Link className="mv-public-showcase__brand" to="/" aria-label="MetaView 首页">
          <span className="mv-brand-strip" aria-hidden="true" />
          <span>
            <strong>MetaView</strong>
            <small>THEORETICAL CANVAS</small>
          </span>
        </Link>
        <nav className="mv-public-showcase__nav" aria-label="精选案例导航">
          <NavLink
            to="/cases"
            className={({ isActive }) => (isActive ? "is-active" : undefined)}
          >
            精选案例
          </NavLink>
          <Link className="mv-public-showcase__create" to="/create">
            开始创建
          </Link>
          <button
            type="button"
            className="mv-public-showcase__theme"
            aria-label={mode === "dark" ? "切换浅色主题" : "切换深色主题"}
            onClick={() => setTweak("theme", mode === "dark" ? "light" : "dark")}
          >
            {mode === "dark" ? "浅色" : "深色"}
          </button>
        </nav>
      </header>
      <publicShowcaseThemeContext.Provider value={mode}>{children}</publicShowcaseThemeContext.Provider>
    </div>
  );
}
