import fs from "node:fs";
import path from "node:path";

import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { PlaybookScript } from "../features/playbook/engine/types";
import { PlaybookPlayer } from "../features/playbook/engine/player/PlaybookPlayer";
import { IntakeScreen } from "../features/studio-editor/ui/IntakeScreen";

vi.mock("@remotion/player", async () => {
  const React = await import("react");
  return {
    Player: React.forwardRef(function MockPlayer(
      _props: unknown,
      ref: React.ForwardedRef<unknown>,
    ) {
      React.useImperativeHandle(ref, () => ({
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        pause: vi.fn(),
        play: vi.fn(),
        seekTo: vi.fn(),
      }));
      return <div data-testid="mock-remotion-player" />;
    }),
  };
});

vi.mock("../features/playbook/engine/player/useTTS", () => ({
  AUTO_VOICE: "auto",
  OPENAI_VOICES: [],
  resolveVoice: () => "auto",
  useTTS: () => ({
    enabled: false,
    supported: true,
    speaking: false,
    config: { backend: "system", voice: "auto", rate: 1 },
    setDomain: vi.fn(),
    toggle: vi.fn(),
    speak: vi.fn(),
    updateConfig: vi.fn(),
  }),
}));

function readTextForCssContract(filePath: string): string {
  return fs.readFileSync(filePath, "utf8").replace(/\r\n/g, "\n");
}

const phoneViewports = [
  { width: 375, height: 667, label: "iPhone SE" },
  { width: 390, height: 844, label: "iPhone 14" },
  { width: 430, height: 932, label: "Pro Max" },
] as const;

const requiredViewports = [
  ...phoneViewports,
  { width: 768, height: 1024, label: "iPad portrait" },
] as const;

function setViewport(width: number, height: number) {
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    value: width,
  });
  Object.defineProperty(window, "innerHeight", {
    configurable: true,
    value: height,
  });
  window.dispatchEvent(new Event("resize"));
}

function script(): PlaybookScript {
  return {
    fps: 30,
    total_frames: 90,
    domain: "algorithm",
    title: "Mobile smoke lesson",
    summary: "Mobile smoke test",
    parameter_controls: [],
    steps: [
      {
        step_id: "s1",
        end_frame: 90,
        title: "Trace active line",
        voiceover_text: "Narration stays readable on mobile.",
        snapshot: {
          kind: "algorithm_array",
          array_values: ["3", "1", "2"],
          active_indices: [1],
          swap_indices: [],
          sorted_indices: [],
          pointers: {},
        },
        code_highlight: {
          language: "python",
          lines: ["def solve():", "    items.sort()", "    return items"],
          active_line: 1,
          active_lines: [1],
          variables: {},
        },
        tokens: [],
      },
    ],
  };
}

describe("mobile web smoke", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it.each(requiredViewports)(
    "keeps the intake shell renderable at $width x $height ($label)",
    ({ width, height }) => {
      setViewport(width, height);
      const { container } = render(<IntakeScreen onSubmit={vi.fn()} />);

      expect(container.querySelector(".mv-intake-hero")).toBeTruthy();
      expect(container.querySelector(".mv-intake-composer")).toBeTruthy();
      expect(container.querySelector(".mv-intake-send")).toBeTruthy();
      expect(container.querySelectorAll(".mv-intake-example")).toHaveLength(3);
      expect(
        container.querySelector<HTMLInputElement>('input[type="file"]')?.accept,
      ).toContain(".py");
      expect(container.textContent).not.toMatch(/截图|PDF|课件|翻译|英语/);
    },
  );

  it.each(phoneViewports)(
    "keeps portrait player essentials visible at $width x $height ($label)",
    ({ width, height }) => {
      setViewport(width, height);
      const { container } = render(
        <PlaybookPlayer
          script={script()}
          theme="light"
          layoutMode="portrait"
          onOpenExport={vi.fn()}
          followupSlot={<textarea aria-label="follow-up" />}
        />,
      );

      expect(container.querySelector(".playbook-player--portrait")).toBeTruthy();
      expect(container.querySelector(".playbook-player__stage")).toBeTruthy();
      expect(container.querySelector(".playbook-player__controls")).toBeTruthy();
      expect(container.querySelector(".playbook-player__caption--mobile")).toBeNull();
      expect(container.querySelector(".playbook-player__mobile-narration")?.textContent).toContain(
        "Narration",
      );
      expect(container.querySelector(".playbook-player__export-btn")).toBeTruthy();
      expect(container.querySelector(".playbook-player__mobile-more-btn")).toBeTruthy();
      expect(container.querySelectorAll(".playbook-player__mobile-tabs button")).toHaveLength(4);
      expect(
        Array.from(container.querySelectorAll(".playbook-player__mobile-tabs button")).some(
          (tab) => tab.textContent?.includes("参数"),
        ),
      ).toBe(false);
      expect(container.querySelector(".playbook-player__console")).toBeNull();
    },
  );

  it("keeps mobile shell, safe-area, reduced-motion, and overflow CSS contracts", () => {
    const webRoot = path.resolve(__dirname, "..", "..");
    const html = readTextForCssContract(path.join(webRoot, "index.html"));
    const globalCss = readTextForCssContract(path.join(webRoot, "src/styles/global.css"));
    const layoutCss = readTextForCssContract(path.join(webRoot, "src/styles/layout.css"));
    const playbookCss = readTextForCssContract(
      path.join(webRoot, "src/styles/pages/playbook.css"),
    );
    const studioCss = readTextForCssContract(
      path.join(webRoot, "src/styles/pages/studio.css"),
    );

    expect(html).toContain("viewport-fit=cover");
    expect(globalCss).toContain("--mv-safe-top: env(safe-area-inset-top, 0px);");
    expect(globalCss).toContain("--mv-vvh: 100vh;");
    expect(globalCss).toContain("html,\nbody,\n#root");
    expect(globalCss).toContain("overflow-x: hidden;");
    expect(globalCss).toContain("pre {\n  overflow-x: auto;");
    expect(layoutCss).toContain("var(--mv-safe-top)");
    expect(playbookCss).toContain(".playbook-player--portrait");
    expect(playbookCss).toContain(".playbook-player__mobile-tabs");
    expect(playbookCss).toContain(".playbook-player__mobile-sheet");
    expect(playbookCss).toContain("max-height: min(72vh, calc(var(--mv-vvh, 100vh) * 0.72));");
    expect(playbookCss).toContain("-webkit-overflow-scrolling: touch;");
    expect(studioCss).toContain("grid-template-columns: repeat(4, minmax(0, 1fr));");
    expect(studioCss).not.toContain(".mv-nav-item:nth-child(4)");
    expect(studioCss).toContain(".mv-meta-particle__canvas-node.is-mobile-hidden");
    expect(studioCss).toContain("@media (prefers-reduced-motion: reduce)");
  });
});
