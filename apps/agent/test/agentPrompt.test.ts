import { describe, expect, it, vi } from "vitest";

vi.mock("@earendil-works/pi-agent-core", () => ({
  Agent: class MockAgent {},
}));
vi.mock("@earendil-works/pi-ai", () => {
  const schemaFactory = (): Record<string, never> => ({});
  return {
    getModel: vi.fn(),
    Type: new Proxy({}, { get: () => schemaFactory }),
  };
});

import {
  SYSTEM_PROMPT,
  buildAgentPrompt,
  buildAgentSelfRepairPrompt,
} from "../src/agent.js";
import type { PlaybookOutput } from "../src/state/types.js";

function fallbackPlaybook(): PlaybookOutput {
  const snapshot = {
    kind: "algorithm_array",
    array_values: ["land", "ocean"],
    active_indices: [0],
    swap_indices: [],
    sorted_indices: [],
    pointers: {},
  };
  const steps = Array.from({ length: 8 }, (_, index) => ({
    step_id: `step_${index + 1}`,
    title: "East Asia monsoon fallback",
    end_frame: (index + 1) * 240,
    narration_template: ["Do not use an array for this geography scene."],
    voiceover_text: "Do not use an array for this geography scene.",
    tokens: [],
    code_highlight: null,
    snapshot,
    layers: [
      {
        timing: {
          enter_at: 0,
          exit_at: 1,
          appear_anim: "fade" as const,
          z_order: 0,
        },
        body: { ...snapshot },
      },
    ],
  }));
  return {
    fps: 30,
    total_frames: steps.at(-1)?.end_frame ?? 0,
    domain: "geography",
    title: "East Asia monsoon",
    summary: "Explain East Asia monsoon with a map.",
    parameter_controls: [],
    steps,
  };
}

function lessonPlan(): Record<string, unknown> {
  return {
    schema_version: "1.0.0",
    domain: "geography",
    title: "LESSON_PLAN_ONLY_MARKER",
    learning_objectives: ["Explain the monsoon mechanism."],
    prerequisites: ["Know that land and ocean heat at different rates."],
    misconceptions: ["The wind direction never changes by season."],
    expected_conclusion: "Seasonal pressure differences drive the monsoon.",
    lesson_arc: "state_transition",
    scenes: [
      {
        scene_id: "monsoon_mechanism",
        teaching_goal: "Connect thermal contrast to pressure and wind.",
        strategy: "state_transition",
        required_fact_ids: ["land_ocean_heating"],
        required_visual_roles: ["land", "ocean", "flow"],
        preferred_scene_type: "east_asia_monsoon",
        narration_goal: "Explain the causal sequence without renderer details.",
      },
    ],
  };
}

function coverageDecision(): Record<string, unknown> {
  return {
    mode: "experimental",
    domain: "geography",
    confidence: 0.68,
    matched_skill_ids: [],
    available_tool_ids: ["scene_blueprint.compile"],
    missing_capabilities: ["validator:geography.monsoon"],
    fallback_policy: "limited_visual",
    reason: "The visual template exists but the fact validator is missing.",
  };
}

describe("agent prompt contracts", () => {
  it("hands the LessonPlan to the initial prompt as read-only context", () => {
    const prompt = buildAgentPrompt(
      "讲解东亚季风",
      { destination: "agent", domain: "geography" },
      lessonPlan(),
      coverageDecision(),
    );

    expect(prompt).toContain("[MetaView LessonPlan]");
    expect(prompt).toContain("BINDING read-only teaching contract");
    expect(prompt).toContain("cover every required fact");
    expect(prompt).toContain("LESSON_PLAN_ONLY_MARKER");
    expect(prompt).toContain("[MetaView route decision]");
    expect(prompt).toContain("[MetaView coverage decision]");
    expect(prompt).toContain("validator:geography.monsoon");
    expect(prompt).toContain("available_tool_ids records relevant capability evidence");
    expect(prompt).toContain("[user prompt]");
  });

  it("steers subject visual scenes through SceneBlueprint and semantic renderer paths", () => {
    expect(SYSTEM_PROMPT).toContain("BINDING");
    expect(SYSTEM_PROMPT).toMatch(/SceneIntents in\s+order/);
    expect(SYSTEM_PROMPT).toContain("SceneBlueprint");
    expect(SYSTEM_PROMPT).toContain("scene_blueprint.compile");
    expect(SYSTEM_PROMPT).toContain("SkillPack runtime tool");
    expect(SYSTEM_PROMPT).toContain("geo_map_scene");
    expect(SYSTEM_PROMPT).toContain("physics_force_scene");
    expect(SYSTEM_PROMPT).toContain("bio_cell_scene");
    expect(SYSTEM_PROMPT).toContain("bio_process_scene");
    expect(SYSTEM_PROMPT).toContain("molecule_2d_scene");
    expect(SYSTEM_PROMPT).toContain("reaction_scene");
    expect(SYSTEM_PROMPT).toContain("Do not use algorithm_array");
  });

  it("requires surviving math parameters to stay bound to visible curves", () => {
    expect(SYSTEM_PROMPT).toContain("remain free after");
    expect(SYSTEM_PROMPT).toContain("add_parameter_control");
    expect(SYSTEM_PROMPT).toMatch(/Never replace a\s+surviving parameter/);
    expect(SYSTEM_PROMPT).toContain("decorative slider");
  });

  it("gives specific repair guidance for subject visual array fallbacks", () => {
    const prompt = buildAgentSelfRepairPrompt({
      originalPrompt: "讲解东亚夏季风的海陆热力差异",
      coverageDecision: coverageDecision(),
      lessonPlan: lessonPlan(),
      previousPlaybook: fallbackPlaybook(),
      repairAttempt: 1,
      report: {
        status: "blocked",
        issues: [
          {
            code: "snapshot.domain_fallback",
            severity: "error",
            path: "steps[0].snapshot.kind",
            message:
              "geography playbooks must not fall back to algorithm_array.",
            suggestion: "Use a SceneBlueprint or subject semantic renderer.",
          },
        ],
      },
    });

    expect(prompt).toContain("snapshot.domain_fallback");
    expect(prompt).toContain("LESSON_PLAN_ONLY_MARKER");
    expect(prompt).toContain('"lesson_plan"');
    expect(prompt).toContain('"coverage_decision"');
    expect(prompt).toContain("Treat coverage_decision as binding");
    expect(prompt).toContain("Treat lesson_plan as binding");
    expect(prompt).toContain("matching SkillPack runtime tool");
    expect(prompt).toContain("SceneBlueprint");
    expect(prompt).toContain("geo_map_scene");
    expect(prompt).toContain("Do not repair this by renaming algorithm_array");
  });

  it("gives specific repair guidance for hardcoded math parameters", () => {
    const previous = fallbackPlaybook();
    previous.domain = "math";
    const prompt = buildAgentSelfRepairPrompt({
      originalPrompt:
        "The moving line y=kx+t has a determined intercept and passes through a fixed point.",
      previousPlaybook: previous,
      repairAttempt: 1,
      report: {
        status: "blocked",
        issues: [
          {
            code: "math.parameter_hardcoded",
            severity: "error",
            path: "steps",
            message: "The surviving slope k was baked into a numeric curve.",
            suggestion: "Keep k symbolic and add a matching control.",
          },
        ],
      },
    });

    expect(prompt).toContain("math.parameter_hardcoded");
    expect(prompt).toContain("add_parameter_control");
    expect(prompt).toContain("one-to-one binding");
    expect(prompt).toContain("Parameters fixed by the derivation must stay fixed");
  });
});
