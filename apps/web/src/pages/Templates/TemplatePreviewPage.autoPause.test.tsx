import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TemplatePreviewPage } from "./TemplatePreviewPage";
import { getTemplatePreviewCase } from "./templatePreviewCases";

// The Remotion Player is swapped for a stand-in that plays one frame per
// tick and reports frames the way Remotion 4 does: `frameupdate` for every
// frame, `timeupdate` throttled to one per 250 ms — every eighth frame at
// 30 fps. It draws the real composition at its current frame, so whatever it
// shows once playback stops is the picture a paused viewer is left with.
const timeline = vi.hoisted(() => ({
  frame: 0,
  playing: false,
  tick: (() => {}) as (frames?: number) => void,
}));

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
  const TIMEUPDATE_EVERY_FRAMES = 8;
  type Listener = (event: { detail: unknown }) => void;
  return {
    Player: React.forwardRef(function PlayingPlayer(
      props: {
        component: React.ComponentType<Record<string, unknown>>;
        inputProps: Record<string, unknown>;
        durationInFrames: number;
        initialFrame?: number;
      },
      ref: React.ForwardedRef<unknown>,
    ) {
      const [frame, setFrame] = React.useState(props.initialFrame ?? 0);
      const framesSinceTimeUpdate = React.useRef(0);
      const listeners = React.useRef(new Map<string, Set<Listener>>());
      const emit = (event: string, detail?: unknown) =>
        listeners.current.get(event)?.forEach((listener) => listener({ detail }));
      React.useImperativeHandle(ref, () => ({
        addEventListener: (event: string, listener: Listener) => {
          const registered = listeners.current.get(event) ?? new Set<Listener>();
          listeners.current.set(event, registered.add(listener));
        },
        removeEventListener: (event: string, listener: Listener) => {
          listeners.current.get(event)?.delete(listener);
        },
        // Like Remotion, play and pause only announce an actual change.
        play: () => {
          if (timeline.playing) return;
          timeline.playing = true;
          emit("play");
        },
        pause: () => {
          if (!timeline.playing) return;
          timeline.playing = false;
          emit("pause");
        },
        isPlaying: () => timeline.playing,
        seekTo: setFrame,
        getCurrentFrame: () => frame,
      }), [frame]);
      React.useEffect(() => {
        emit("frameupdate", { frame });
        framesSinceTimeUpdate.current += 1;
        if (framesSinceTimeUpdate.current >= TIMEUPDATE_EVERY_FRAMES) {
          framesSinceTimeUpdate.current = 0;
          emit("timeupdate", { frame });
        }
      }, [frame]);
      timeline.frame = frame;
      // More than one frame per tick stands in for frames the browser dropped.
      timeline.tick = (frames = 1) => {
        if (timeline.playing) setFrame((current) => Math.min(current + frames, props.durationInFrames - 1));
      };
      const Composition = props.component;
      return <Composition {...props.inputProps} />;
    }),
  };
});

// Recorded narration plays through one <audio> element; keep hold of it so a
// test can decide when the current line finishes.
const narration = vi.hoisted(() => ({ audio: null as HTMLMediaElement | null }));

beforeEach(() => {
  timeline.playing = false;
  window.localStorage.clear();
  vi.spyOn(window.HTMLMediaElement.prototype, "play").mockImplementation(async function (
    this: HTMLMediaElement,
  ) {
    narration.audio = this;
  });
  vi.spyOn(window.HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  narration.audio = null;
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

function stepsOf(templateId: string) {
  const previewCase = getTemplatePreviewCase(templateId)!;
  return previewCase.buildScript(previewCase.defaultParams).steps;
}

function switchToStepThrough(): void {
  fireEvent.click(screen.getByRole("button", { name: "播放器设置" }));
  fireEvent.click(screen.getByRole("button", { name: "连播" }));
  expect(screen.getByRole("button", { name: "步进" })).toBeTruthy();
}

function pressPlay(): void {
  fireEvent.click(screen.getByRole("button", { name: "播放" }));
}

/**
 * Let the player run until something pauses it, allowing a little past
 * `stopByFrame`; returns false if it never stopped.
 */
function playUntilPaused(stopByFrame: number): boolean {
  const giveUpAt = stopByFrame + 30;
  // Counting ticks as well as frames keeps a playhead clamped at the last
  // frame from spinning forever.
  for (let ticks = 0; timeline.playing && timeline.frame < giveUpAt && ticks < giveUpAt; ticks += 1) {
    act(() => timeline.tick());
  }
  return !timeline.playing;
}

function expectActiveStep(stepNumber: number): void {
  expect(screen.getByRole("button", { name: new RegExp(`^第 ${stepNumber} 步：`) }).className).toContain(
    "is-active",
  );
}

function expectNothingHalfDrawn(container: HTMLElement, label: string): void {
  const nodes = [...container.querySelectorAll("[data-node-id]")];
  expect(nodes.length, label).toBeGreaterThan(0);
  for (const node of nodes) {
    expect(node.getAttribute("opacity"), `${label}: node ${node.getAttribute("data-node-id")}`).toBe("1");
  }
  for (const panel of container.querySelectorAll('[data-semantic-role="algorithm_state_panel"]')) {
    expect(panel.getAttribute("opacity"), `${label}: state panel`).toBe("1");
  }
}

describe("TemplatePreviewPage auto-pause at step boundaries", () => {
  it("leaves no bfs-tree node partially faded wherever step-through pauses", () => {
    const steps = stepsOf("bfs-tree");
    const { container } = renderTemplate("bfs-tree");
    switchToStepThrough();

    pressPlay();
    for (let finished = 0; finished < steps.length - 1; finished += 1) {
      const label = `pause after step ${finished + 1}`;
      expect(playUntilPaused(steps[finished]!.end_frame), `${label}: playback stopped`).toBe(true);

      // The finished step stays on screen, fully drawn, and stays the
      // current step until the viewer asks for the next one.
      expectNothingHalfDrawn(container, label);
      expectActiveStep(finished + 1);

      pressPlay();
    }
  });

  it("plays on into the next step's first frame after a step-through pause", () => {
    const steps = stepsOf("bfs-tree");
    renderTemplate("bfs-tree");
    switchToStepThrough();
    pressPlay();
    expect(playUntilPaused(steps[0]!.end_frame)).toBe(true);

    pressPlay();
    act(() => timeline.tick());

    // Step 2's entrance starts from its first frame, and the boundary just
    // held does not pause playback a second time.
    expect(timeline.frame).toBe(steps[0]!.end_frame);
    expect(timeline.playing).toBe(true);
    expectActiveStep(2);
  });

  it("returns to the finished step's last frame when dropped frames skip past it", () => {
    const steps = stepsOf("bfs-tree");
    const { container } = renderTemplate("bfs-tree");
    switchToStepThrough();
    pressPlay();
    while (timeline.frame < steps[0]!.end_frame - 3) {
      act(() => timeline.tick());
    }

    // One late frame lands two frames into step 2.
    act(() => timeline.tick(5));

    expect(timeline.playing).toBe(false);
    expect(timeline.frame).toBe(steps[0]!.end_frame - 1);
    expectNothingHalfDrawn(container, "after dropped frames");
    expectActiveStep(1);
  });

  it("holds the finished step's last frame while the narration gate waits", async () => {
    const steps = stepsOf("logistic-growth");
    renderTemplate("logistic-growth");
    // The opening line is recorded and has not finished when step 1 ends.
    await act(async () => undefined);
    expect(narration.audio).not.toBeNull();

    pressPlay();
    expect(playUntilPaused(steps[0]!.end_frame)).toBe(true);

    // The picture is step 1's settled last frame, not the first frames of
    // step 2 with its entrance half faded in. The step index advances as it
    // always has, so step 2's line is what the gate now waits on.
    expect(timeline.frame).toBe(steps[0]!.end_frame - 1);
    expectActiveStep(2);

    act(() => {
      narration.audio!.dispatchEvent(new Event("ended"));
    });
    expect(timeline.playing).toBe(true);
    act(() => timeline.tick());
    expect(timeline.frame).toBe(steps[0]!.end_frame);
  });
});
