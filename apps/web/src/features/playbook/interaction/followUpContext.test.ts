import { describe, expect, it } from "vitest";

import type { InteractionEvent } from "./types";
import {
  buildInteractionFollowUpContext,
  describeInteractionEvent,
} from "./followUpContext";

function event(sequence: number): InteractionEvent {
  return {
    adapter_id: "math.derivative-tangent",
    step_id: "plot",
    target_id: "step:plot:marker-x",
    action: "set-value",
    value: sequence / 10,
    sequence,
  };
}

describe("interaction follow-up context", () => {
  it("returns null until the learner commits an interaction", () => {
    expect(buildInteractionFollowUpContext([])).toBeNull();
  });

  it("copies only the latest twenty normalized events", () => {
    const events = Array.from({ length: 25 }, (_, index) => event(index + 1));
    const context = buildInteractionFollowUpContext(events);

    expect(context?.manifest_version).toBe("1");
    expect(context?.events).toHaveLength(20);
    expect(context?.events[0].sequence).toBe(6);
    expect(context?.events.at(-1)?.sequence).toBe(25);
    expect(context?.events[0]).not.toBe(events[5]);
  });

  it("describes allowlisted derivative and BFS events for the visible summary", () => {
    expect(describeInteractionEvent(event(20))).toBe("把切点 x 调到 2");
    expect(describeInteractionEvent({
      adapter_id: "algorithm.bfs",
      step_id: "graph",
      target_id: "step:graph:start-node",
      action: "select",
      value: "C",
      sequence: 1,
    })).toBe("把 BFS 起点选为 C");
  });

  it("describes local conic Follow-up events without flattening their semantic intent", () => {
    expect(describeInteractionEvent({
      adapter_id: "math.conic-followup",
      step_id: "ellipse-distance-sum",
      target_id: "step:ellipse-distance-sum:slow-current-segment",
      action: "slow-current-segment",
      factor: 1.5,
      sequence: 1,
    })).toBe("把步骤 ellipse-distance-sum 放慢到 1.5 倍时长");
  });
});
