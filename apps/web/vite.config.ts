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
    setupFiles: ["src/mocks/setup.ts"],
    coverage: {
      // Issue #66 — opt-in (run via ``npm run test:coverage``) so day-to-day
      // ``vitest run`` stays as quick as before. Numbers are intentionally
      // modest first-pass thresholds; raise as new code lands.
      provider: "v8",
      reporter: ["text-summary", "html", "lcov"],
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "src/**/*.test.{ts,tsx}",
        "src/mocks/**",
        "src/main.tsx",
        "src/remotion/**",
      ],
      // Thresholds pinned at the current baseline (May 2026: ~50% lines,
      // ~78% branches, ~76% functions) so any regression is loud; bump
      // these up as new tests land. Issue #66.
      //
      // Issue #73 — long-term we want:
      //   1. per-module overrides (``"src/shared/**": { lines: 80, ... }``)
      //      so cross-cutting utilities stay tightly tested even when the
      //      whole-tree average sags.
      //   2. diff-coverage in CI (run ``diff-cover coverage/lcov.info
      //      --compare-branch=origin/main --fail-under=80`` after this
      //      job) so PRs only have to clear the bar for the lines they
      //      actually touched.
      //   3. a baseline-bumping commit (``ci(coverage): raise floor``) any
      //      time global coverage holds above the new bar for a sprint.
      // (1) is blocked on the v8 coverage / DOMPurify ESM interop bug
      // breaking ``vitest --coverage`` for the math-scene renderers — fix
      // that first, then turn the overrides on.
      thresholds: {
        statements: 50,
        branches: 70,
        functions: 70,
        lines: 50,
      },
    },
  },
});
