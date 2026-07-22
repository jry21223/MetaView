import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { useInteractionSandbox } from "../../../features/playbook/interaction/useInteractionSandbox";
import { PUBLIC_GOLD_TEMPLATES } from "./publicGoldTemplates";

describe("conic Follow-up sandbox integration", () => {
  it("records a local semantic event while accepting the operation's valid timeline", () => {
    const manifest = PUBLIC_GOLD_TEMPLATES.find(
      (item) => item.caseId === "ellipse-focus-definition",
    )!;
    const params = manifest.parameterSchema!.defaults;
    const base = manifest.buildPublicPlaybook(params);
    const presets = manifest.buildFollowups(params, base)[base.steps[1].step_id];
    const slow = presets.find((preset) => preset.operation?.action === "slow-current-segment")!;
    const { result } = renderHook(() => useInteractionSandbox(
      base,
      manifest.caseId,
      [manifest.interactionAdapter],
    ));

    act(() => result.current.apply(slow.operation!));

    expect(result.current.lastError).toBeNull();
    expect(result.current.events).toEqual([{ ...slow.operation, sequence: 1 }]);
    expect(result.current.previewScript.total_frames).toBeGreaterThan(base.total_frames);
    expect(result.current.previewScript.total_frames)
      .toBe(result.current.previewScript.steps.at(-1)?.end_frame);
  });
});
