/// <reference types="vitest" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
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
