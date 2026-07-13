import { createTheme } from "@mui/material/styles";

import {
  TWEAK_DEFAULTS,
  themeVars,
} from "../../features/studio-editor/hooks/useTweaks";

export const OPS_THEME_VARS = themeVars({
  ...TWEAK_DEFAULTS,
  density: "compact",
});

export const opsDashboardTheme = createTheme({
  palette: {
    mode: "light",
    primary: {
      main: OPS_THEME_VARS["--accent"],
      contrastText: OPS_THEME_VARS["--accent-contrast"],
    },
    warning: { main: OPS_THEME_VARS["--warn"] },
    background: {
      default: OPS_THEME_VARS["--bg"],
      paper: OPS_THEME_VARS["--surface"],
    },
    text: {
      primary: OPS_THEME_VARS["--ink"],
      secondary: OPS_THEME_VARS["--ink-2"],
    },
    divider: OPS_THEME_VARS["--line"],
  },
  shape: {
    borderRadius: Number.parseFloat(OPS_THEME_VARS["--radius-sm"]),
  },
  typography: {
    fontFamily: [
      "Inter",
      "-apple-system",
      "BlinkMacSystemFont",
      "PingFang SC",
      "Noto Sans SC",
      "sans-serif",
    ].join(","),
    button: {
      textTransform: "none",
      fontWeight: 650,
    },
  },
  components: {
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: {
          minHeight: 36,
          borderRadius: "var(--radius-sm)",
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          borderRadius: 4,
          fontWeight: 650,
        },
      },
    },
    MuiIconButton: {
      styleOverrides: {
        root: {
          borderRadius: "var(--radius-sm)",
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: "none",
        },
      },
    },
    MuiTab: {
      styleOverrides: {
        root: {
          minHeight: 36,
          minWidth: 58,
          padding: "6px 12px",
          textTransform: "none",
          fontSize: 12,
          fontWeight: 650,
        },
      },
    },
    MuiToggleButton: {
      styleOverrides: {
        root: {
          minHeight: 36,
          paddingInline: 12,
          borderColor: "var(--line)",
          color: "var(--ink-2)",
          fontSize: 12,
          fontWeight: 650,
          textTransform: "none",
          "&.Mui-selected": {
            borderColor: "color-mix(in srgb, var(--accent) 28%, var(--line))",
            backgroundColor: "var(--accent-soft)",
            color: "var(--ink)",
          },
          "&.Mui-selected:hover": {
            backgroundColor: "color-mix(in srgb, var(--accent) 20%, transparent)",
          },
        },
      },
    },
  },
});
