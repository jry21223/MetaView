import { describe, expect, it } from "vitest";
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
  it("injects the binding lesson, coverage, tool, source, and constraint contracts", () => {
    const prompt = buildAgentPrompt({
      prompt: "讲解东亚季风",
      routeDecision: { destination: "agent", domain: "geography" },
      lessonPlan: lessonPlan(),
      coverageDecision: coverageDecision(),
      sourceCode: "const season = 'summer';",
      language: "typescript",
      constraints: { repair_strategy: "path_scoped_patch" },
      availableTools: [
        { name: "scene_blueprint.compile" },
        { name: "geometry.assert_orientation" },
      ],
      apiBaseUrl: "http://api.test",
      defaultProvider: "openai",
      defaultModel: "test",
    });

    expect(prompt).toContain("[MetaView LessonPlan]");
    expect(prompt).toContain("BINDING read-only teaching contract");
    expect(prompt).toContain("LESSON_PLAN_ONLY_MARKER");
    expect(prompt).toContain("[MetaView coverage decision]");
    expect(prompt).toContain("runtime-enforced capability boundary");
    expect(prompt).toContain("scene_sequence_blueprint.compile");
    expect(prompt).toContain("geometry.assert_orientation");
    expect(prompt).toContain("language=typescript");
    expect(prompt).toContain("0000: const season");
    expect(prompt).toContain("path_scoped_patch");
  });

  it("retains the legacy positional prompt-builder signature", () => {
    const prompt = buildAgentPrompt(
      "讲解东亚季风",
      { destination: "agent", domain: "geography" },
      lessonPlan(),
      coverageDecision(),
    );
    expect(prompt).toContain("LESSON_PLAN_ONLY_MARKER");
    expect(prompt).toContain("[user prompt]");
  });

  it("defines executable draft, compiler, and capability rules", () => {
    expect(SYSTEM_PROMPT).toContain("semantic step drafts");
    expect(SYSTEM_PROMPT).toContain("runtime-enforced");
    expect(SYSTEM_PROMPT).toContain("scene_sequence_blueprint.compile");
    expect(SYSTEM_PROMPT).toContain("templates return editable");
    expect(SYSTEM_PROMPT).toContain("animation_tool_expand applies");
    expect(SYSTEM_PROMPT).toContain("set_code_highlight");
    expect(SYSTEM_PROMPT).toContain("finalize_playbook rejects");
    expect(SYSTEM_PROMPT).toContain("Never emit HTML");
  });

  it("builds a repair payload that explicitly forbids full regeneration", () => {
    const prompt = buildAgentSelfRepairPrompt({
      originalPrompt: "讲解东亚夏季风的海陆热力差异",
      routeDecision: { destination: "agent", domain: "geography" },
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
          },
        ],
      },
    });

    expect(prompt).toContain("path-scoped JSON Patch");
    expect(prompt).toContain("do not rebuild the full Playbook");
    expect(prompt).toContain("snapshot.domain_fallback");
    expect(prompt).toContain("LESSON_PLAN_ONLY_MARKER");
    expect(prompt).toContain('"coverage_decision"');
    expect(prompt).toContain('"lesson_plan"');
  });
});
