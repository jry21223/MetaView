import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { DirectorInspector } from "./DirectorInspector";
import type { DirectorScript } from "./types";

function director(): DirectorScript {
  return {
    schema_version: "1.0.0",
    source: "manual",
    run_id: "run-1",
    beats: [
      {
        beat_id: "beat_01",
        step_id: "step_01",
        start_frame: 0,
        end_frame: 60,
        intent: "hook",
        shot_type: "wide",
        camera_motion: "hold",
        pacing: "normal",
        emphasis_terms: ["顶点"],
        focus_target: "formula",
      },
      {
        beat_id: "beat_02",
        step_id: "step_02",
        start_frame: 60,
        end_frame: 120,
        intent: "focus",
        shot_type: "close",
        camera_motion: "push_in",
        pacing: "slow",
        emphasis_terms: ["对称轴", "x=2"],
        focus_target: "axis",
      },
    ],
  };
}

describe("DirectorInspector", () => {
  afterEach(() => cleanup());

  it("shows an empty state without a director", () => {
    const { getByLabelText, getByText } = render(<DirectorInspector director={null} />);

    expect(getByLabelText("Director inspector")).toBeTruthy();
    expect(getByText("No DirectorScript available.")).toBeTruthy();
  });

  it("shows source, beat count, current beat fields, and frame range", () => {
    const { getAllByText, getByText } = render(
      <DirectorInspector director={director()} currentStepId="step_02" />,
    );

    expect(getByText("manual")).toBeTruthy();
    expect(getByText("2")).toBeTruthy();
    expect(getByText("beat_02")).toBeTruthy();
    expect(getAllByText("focus").length).toBeGreaterThan(0);
    expect(getByText("close")).toBeTruthy();
    expect(getByText("push_in")).toBeTruthy();
    expect(getByText("slow")).toBeTruthy();
    expect(getByText("axis")).toBeTruthy();
    expect(getByText("对称轴, x=2")).toBeTruthy();
    expect(getByText("60-120")).toBeTruthy();
  });
});
