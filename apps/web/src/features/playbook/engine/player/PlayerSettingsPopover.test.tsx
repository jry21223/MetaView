import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PlayerSettingsPopover } from "./PlayerSettingsPopover";

describe("PlayerSettingsPopover viewport placement", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("keeps the popup inside a 390px mobile viewport", () => {
    vi.stubGlobal("innerWidth", 390);
    vi.stubGlobal("innerHeight", 844);
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function () {
      if ((this as HTMLElement).classList.contains("playbook-player__settings-anchor")) {
        return { left: 257, right: 291, top: 446, bottom: 480, width: 34, height: 34, x: 257, y: 446, toJSON: () => ({}) };
      }
      if ((this as HTMLElement).classList.contains("playbook-player__settings-popover")) {
        return { left: 0, right: 320, top: 0, bottom: 173, width: 320, height: 173, x: 0, y: 0, toJSON: () => ({}) };
      }
      return { left: 0, right: 0, top: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0, toJSON: () => ({}) };
    });

    const { container } = render(
      <div className="playbook-player__settings-anchor">
        <PlayerSettingsPopover
          playbackRate={1}
          onPlaybackRateChange={() => undefined}
          stepThrough={false}
          onStepThroughChange={() => undefined}
          ttsEnabled={false}
          ttsSupported={false}
          onToggleTTS={() => undefined}
          config={{ enabled: false, backend: "system", voice: "auto", rate: 1 }}
          onUpdate={() => undefined}
          onClose={() => undefined}
          isDark={false}
          onPreview={() => undefined}
          showTTS={false}
        />
      </div>,
    );

    const popup = container.querySelector<HTMLElement>(".playbook-player__settings-popover")!;
    const left = Number.parseFloat(popup.style.left);
    const width = Number.parseFloat(popup.style.width);
    expect(left).toBe(14);
    expect(left + width).toBeLessThanOrEqual(376);
    expect(Number.parseFloat(popup.style.top)).toBeGreaterThanOrEqual(14);
    expect(popup.style.visibility).toBe("visible");
  });
});
