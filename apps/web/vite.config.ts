/// <reference types="vitest" />
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

/**
 * KaTeX ships its CSS with ``font-display: block`` which produces a FOIT
 * (flash of invisible text) for ~3s while the woff2 fonts load — an awkward
 * blank space where the rendered formula should be. Override every KaTeX
 * @font-face to ``font-display: swap`` so users see the system fallback
 * immediately and the math glyphs swap in once the fonts arrive. Issue #45.
 */
function katexFontDisplaySwap(): Plugin {
  return {
    name: "katex-font-display-swap",
    enforce: "pre",
    transform(code, id) {
      if (!id.includes("/katex/dist/katex") || !id.endsWith(".css")) return null;
      const next = code.replace(/font-display:\s*block/g, "font-display:swap");
      return next === code ? null : next;
    },
  };
}

export default defineConfig({
  plugins: [katexFontDisplaySwap(), react()],
  // Mafs declares a `react >= 18` peer; npm hoisted a stray React 18 alongside
  // it at the workspace root while apps/web pins React 19. Force a single
  // React (and react-dom) instance so hooks share one dispatcher.
  resolve: {
    dedupe: ["react", "react-dom"],
  },
  server: {
    port: 5173,
    proxy: {
      "/api": "http://127.0.0.1:8000",
      "/health": "http://127.0.0.1:8000",
      "/media": "http://127.0.0.1:8000",
    },
  },
  test: {
    environment: "happy-dom",
    globals: false,
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
