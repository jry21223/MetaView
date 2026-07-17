import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { PlaybookScript } from "../../playbook/engine/types";

const playbookPlayer = vi.fn((props: { showLearningConsole?: boolean }) => (
  <div data-testid="existing-playbook-player">
    {props.showLearningConsole ? "console" : "static"}
  </div>
));

vi.mock("../../playbook/engine/player/PlaybookPlayer", () => ({
  PlaybookPlayer: (props: { showLearningConsole?: boolean }) => playbookPlayer(props),
}));

const script = {
  fps: 30,
  total_frames: 60,
  domain: "math",
  title: "Derivative",
  summary: "A lesson",
  steps: [],
  parameter_controls: [],
} satisfies PlaybookScript;

describe("ShowcasePlayer", () => {
  it("reuses PlaybookPlayer in static mode without public follow-up/export slots", async () => {
    const { ShowcasePlayer } = await import("./ShowcasePlayer");
    const { container, getByTestId } = render(
      <ShowcasePlayer script={script} theme="light" />,
    );

    expect(getByTestId("existing-playbook-player").textContent).toBe("static");
    expect(container.textContent).not.toContain("导出");
    expect(container.textContent).not.toContain("继续追问");
    expect(container.querySelector("[data-showcase-player='static']")).toBeTruthy();
    expect(playbookPlayer).toHaveBeenCalledWith(
      expect.objectContaining({
        script,
        showLearningConsole: false,
      }),
    );
  });
});
