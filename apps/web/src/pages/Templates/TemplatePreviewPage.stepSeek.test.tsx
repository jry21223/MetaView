import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TemplatePreviewPage } from "./TemplatePreviewPage";
import { getTemplatePreviewCase } from "./templatePreviewCases";

// The Remotion Player is swapped for a stand-in that never advances on its
// own: it draws the real composition at whatever frame the page last seeked
// to, which is exactly the picture a paused viewer is looking at.
const timeline = vi.hoisted(() => ({ frame: 0 }));

vi.mock("remotion", async () => {
  const actual = await vi.importActual<typeof import("remotion")>("remotion");
  return {
    ...actual,
    useCurrentFrame: () => timeline.frame,
    useVideoConfig: () => ({ fps: 30, width: 1280, height: 720, durationInFrames: 1 }),
  };
});

vi.mock("@remotion/player", async () => {
  const React = await import("react");
  return {
    Player: React.forwardRef(function PausedFramePlayer(
      props: {
        component: React.ComponentType<Record<string, unknown>>;
        inputProps: Record<string, unknown>;
        initialFrame?: number;
      },
      ref: React.ForwardedRef<unknown>,
    ) {
      const [frame, setFrame] = React.useState(props.initialFrame ?? 0);
      const listeners = React.useRef(new Map<string, Set<() => void>>());
      const emit = (event: string) => listeners.current.get(event)?.forEach((listener) => listener());
      React.useImperativeHandle(ref, () => ({
        addEventListener: (event: string, listener: () => void) => {
          const registered = listeners.current.get(event) ?? new Set<() => void>();
          listeners.current.set(event, registered.add(listener));
        },
        removeEventListener: (event: string, listener: () => void) => {
          listeners.current.get(event)?.delete(listener);
        },
        pause: () => emit("pause"),
        play: () => emit("play"),
        seekTo: setFrame,
        getCurrentFrame: () => frame,
      }), [frame]);
      timeline.frame = frame;
      const Composition = props.component;
      return <Composition {...props.inputProps} />;
    }),
  };
});

function renderTemplate(templateId: string) {
  return render(
    <MemoryRouter initialEntries={[`/templates/${templateId}`]}>
      <Routes>
        <Route
          path="/templates/:templateId"
          element={<TemplatePreviewPage theme="light" topbarCollapsed={false} onToggleTopbar={() => undefined} />}
        />
      </Routes>
    </MemoryRouter>,
  );
}

async function jumpToStep(stepNumber: number): Promise<void> {
  const dot = screen.getByRole("button", { name: new RegExp(`^第 ${stepNumber} 步：`) });
  fireEvent.click(dot);
  await waitFor(() => expect(dot.className).toContain("is-active"));
}

function nodes(container: HTMLElement): Element[] {
  return [...container.querySelectorAll("[data-node-id]")];
}

/** bfs-tree step 5 as the bug report expects it: 1–3 visited, 4 current, every node and the state panel drawn. */
function expectBfsStep5Settled(container: HTMLElement): void {
  const drawn = nodes(container);
  expect(drawn.map((node) => node.getAttribute("data-node-id"))).toEqual(["1", "2", "3", "4", "5", "6", "7"]);
  for (const node of drawn) {
    expect(node.getAttribute("opacity"), `node ${node.getAttribute("data-node-id")}`).toBe("1");
  }
  const state = Object.fromEntries(
    drawn.map((node) => [node.getAttribute("data-node-id"), node.getAttribute("data-node-state")]),
  );
  expect(state).toMatchObject({ "1": "visited", "2": "visited", "3": "visited", "4": "current" });

  const panel = container.querySelector('[data-semantic-role="algorithm_state_panel"]');
  expect(panel, "BFS state panel").not.toBeNull();
  expect(panel?.getAttribute("opacity")).toBe("1");
}

describe("TemplatePreviewPage paused step jumps", () => {
  afterEach(() => {
    cleanup();
  });

  it("shows bfs-tree step 5 fully drawn: 1–3 visited, 4 current, state panel present", async () => {
    const { container } = renderTemplate("bfs-tree");

    await jumpToStep(5);

    expectBfsStep5Settled(container);
  });

  it.each([
    ["下一步", 4],
    ["上一步", 6],
  ])("lands %s from step %i on bfs-tree step 5 fully drawn", async (button, fromStep) => {
    const { container } = renderTemplate("bfs-tree");
    await jumpToStep(fromStep);

    fireEvent.click(screen.getByRole("button", { name: button }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /^第 5 步：/ }).className).toContain("is-active"),
    );

    expectBfsStep5Settled(container);
  });

  it("replays the jumped-to step from its first frame when play is pressed", async () => {
    renderTemplate("bfs-tree");
    // Watch a little first, so the page has already spent its one-time
    // rewind of the opening poster frame.
    fireEvent.click(screen.getByRole("button", { name: "播放" }));
    fireEvent.click(screen.getByRole("button", { name: "暂停" }));

    await jumpToStep(5);
    fireEvent.click(screen.getByRole("button", { name: "播放" }));

    const previewCase = getTemplatePreviewCase("bfs-tree")!;
    const steps = previewCase.buildScript(previewCase.defaultParams).steps;
    // Step 5 starts where step 4 ends, so its entrance and narration play in full.
    expect(timeline.frame).toBe(steps[3]!.end_frame);
    expect(screen.getByRole("button", { name: /^第 5 步：/ }).className).toContain("is-active");
  });

  it.each([
    ["dijkstra", 4],
    ["bst-search", 4],
    ["linked-list-reverse", 3],
  ])("draws every node of %s step %i after a paused jump", async (templateId, stepNumber) => {
    const { container } = renderTemplate(templateId);

    await jumpToStep(stepNumber);

    const drawn = nodes(container);
    expect(drawn.length).toBeGreaterThan(0);
    for (const node of drawn) {
      expect(node.getAttribute("opacity"), `node ${node.getAttribute("data-node-id")}`).toBe("1");
    }
    for (const panel of container.querySelectorAll('[data-semantic-role="algorithm_state_panel"]')) {
      expect(panel.getAttribute("opacity")).toBe("1");
    }
  });
});
