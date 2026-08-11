import { describe, expect, it } from "vitest";

import {
  buildMetaViewPrompt,
  buildTeachingDeck,
  DEFAULT_TEACHING_DECK_INPUT,
  validateTeachingDeck,
} from "./buildTeachingDeck";

describe("teaching deck planner", () => {
  it("builds the ellipse MVP as an eleven-slide lesson with two MetaView pages", () => {
    const project = buildTeachingDeck(
      DEFAULT_TEACHING_DECK_INPUT,
      new Date("2026-08-10T12:00:00.000Z"),
    );

    expect(project.schemaVersion).toBe("0.1.0");
    expect(project.slides).toHaveLength(11);
    expect(project.slides.map((slide) => slide.order)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11,
    ]);
    expect(project.slides.filter((slide) => slide.renderer === "metaview")).toHaveLength(2);
    expect(project.slides[4].visualStrategy).toBe("moving_point_with_distance_lines");
    expect(project.slides[6].title).toContain("标准方程");
    expect(validateTeachingDeck(project)).toEqual([]);
  });

  it("uses a generic but editable teaching arc for other topics", () => {
    const project = buildTeachingDeck(
      {
        topic: "二分查找",
        grade: "大学一年级",
        durationMinutes: 20,
        teachingGoals: "理解搜索区间缩小过程\n能够写出循环不变量",
        sourceMaterial: "课程材料强调左闭右闭区间。",
      },
      new Date("2026-08-10T12:00:00.000Z"),
    );

    expect(project.title).toBe("二分查找 教学课件");
    expect(project.slides).toHaveLength(11);
    expect(project.slides[1].points).toEqual([
      "理解搜索区间缩小过程",
      "能够写出循环不变量",
    ]);
    expect(project.slides[2].points.join(" ")).toContain("左闭右闭区间");
    expect(project.slides.filter((slide) => slide.renderer === "metaview")).toHaveLength(2);
  });

  it("builds a bounded prompt for one dynamic slide instead of the whole deck", () => {
    const project = buildTeachingDeck(
      DEFAULT_TEACHING_DECK_INPUT,
      new Date("2026-08-10T12:00:00.000Z"),
    );
    const prompt = buildMetaViewPrompt(project, project.slides[4]);

    expect(prompt).toContain("第 5 页，共 11 页");
    expect(prompt).toContain("绳长法：椭圆如何形成");
    expect(prompt).toContain("只生成这一页的动态讲解");
    expect(prompt).not.toContain("生成整套 PPT");
  });
});
