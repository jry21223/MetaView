import { describe, expect, it } from "vitest";

import { PlaybookEmitter } from "../src/state/playbookEmitter.js";
import { makeDrawingTools } from "../src/tools/drawing.js";

interface ArraySchema {
  minItems?: number;
  maxItems?: number;
}

interface ToolObjectSchema {
  properties?: Record<string, ArraySchema>;
}

describe("Drawing CLI model-visible contracts", () => {
  const tools = makeDrawingTools({ emitter: new PlaybookEmitter() });

  it("allows plan_outline step_titles from 3 through 12", () => {
    const tool = tools.find((candidate) => candidate.name === "plan_outline");
    const schema = tool?.parameters as ToolObjectSchema | undefined;

    expect(tool?.description).toContain("通常生成 4–8 个步骤");
    expect(schema?.properties?.step_titles?.minItems).toBe(3);
    expect(schema?.properties?.step_titles?.maxItems).toBe(12);
    expect(tool?.description).not.toMatch(/8\s*[-–]\s*14/i);
  });

  it("treats narration entries as 1 through 4 natural subtitle segments", () => {
    const tool = tools.find((candidate) => candidate.name === "set_narration");
    const schema = tool?.parameters as ToolObjectSchema | undefined;

    expect(tool?.description).toContain("自然字幕片段");
    expect(tool?.description).toContain("优先使用 1–2 个片段");
    expect(schema?.properties?.text?.minItems).toBe(1);
    expect(schema?.properties?.text?.maxItems).toBe(4);
    expect(tool?.description).not.toContain("为什么 → 做什么 → 学到了什么");
  });
});
