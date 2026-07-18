import { describe, expect, it } from "vitest";

import { createVisualLessonPrompt } from "./createVisualLesson";

describe("createVisualLessonPrompt", () => {
  it("keeps external agents on the controlled MetaView pipeline", () => {
    const prompt = createVisualLessonPrompt({
      topic: "东亚季风",
      subject: "geography",
      audience: "middle_school",
      duration_seconds: 45,
    });

    expect(prompt.messages).toHaveLength(1);
    expect(prompt.messages[0].content.text).toContain("metaview.compile_scene_blueprint");
    expect(prompt.messages[0].content.text).toContain("metaview://kits/geography-earth-basic/manifest");
    expect(prompt.messages[0].content.text).toContain("Do not hand-author SVG");
    expect(prompt.messages[0].content.text).toContain("PlaybookScript");
  });
});
