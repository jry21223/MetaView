import { describe, expect, it } from "vitest";

import {
  buildTeachingDeck,
  DEFAULT_TEACHING_DECK_INPUT,
} from "../model/buildTeachingDeck";
import {
  buildTeachingDeckPptx,
  teachingDeckPptxFilename,
} from "./pptx";

describe("teaching deck PPTX export", () => {
  it("creates an editable OOXML presentation with one slide part per intent", () => {
    const project = buildTeachingDeck(
      DEFAULT_TEACHING_DECK_INPUT,
      new Date("2026-08-10T12:00:00.000Z"),
    );
    project.slides[4] = {
      ...project.slides[4],
      metaViewRunId: "run-ellipse-demo",
      dynamicState: "ready",
    };

    const bytes = buildTeachingDeckPptx(project, {
      runUrlBase: "https://metaview.example",
      generatedAt: new Date("2026-08-10T12:30:00.000Z"),
    });
    const packageText = new TextDecoder().decode(bytes);

    expect(Array.from(bytes.slice(0, 4))).toEqual([0x50, 0x4b, 0x03, 0x04]);
    expect(packageText).toContain("ppt/presentation.xml");
    expect(packageText).toContain("ppt/slides/slide11.xml");
    expect(packageText).toContain("椭圆及其标准方程");
    expect(packageText).toContain("run-ellipse-demo");
    expect(packageText).toContain("https://metaview.example/run/run-ellipse-demo");
    expect(packageText).toContain("screen16x9");
  });

  it("uses a safe Chinese filename", () => {
    const project = buildTeachingDeck(
      { ...DEFAULT_TEACHING_DECK_INPUT, topic: '椭圆：定义/方程?*' },
      new Date("2026-08-10T12:00:00.000Z"),
    );

    expect(teachingDeckPptxFilename(project)).toBe("椭圆-定义-方程---教学课件.pptx");
  });
});
