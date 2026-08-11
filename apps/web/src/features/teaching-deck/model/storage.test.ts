import { beforeEach, describe, expect, it } from "vitest";

import { buildTeachingDeck, DEFAULT_TEACHING_DECK_INPUT } from "./buildTeachingDeck";
import {
  loadTeachingDeckProject,
  saveTeachingDeckProject,
} from "./storage";

beforeEach(() => {
  window.localStorage.clear();
});

describe("teaching deck browser persistence", () => {
  it("persists ordinary drafts without source material", () => {
    const project = buildTeachingDeck(
      { ...DEFAULT_TEACHING_DECK_INPUT, sourceMaterial: "" },
      new Date("2026-08-11T00:00:00Z"),
    );

    saveTeachingDeckProject(project);

    expect(loadTeachingDeckProject()?.id).toBe(project.id);
  });

  it("keeps source-backed drafts session-only, including derived excerpts", () => {
    const ordinary = buildTeachingDeck(
      { ...DEFAULT_TEACHING_DECK_INPUT, sourceMaterial: "" },
      new Date("2026-08-11T00:00:00Z"),
    );
    saveTeachingDeckProject(ordinary);
    expect(loadTeachingDeckProject()).not.toBeNull();

    const sourceBacked = buildTeachingDeck(
      {
        ...DEFAULT_TEACHING_DECK_INPUT,
        sourceMaterial: "这是尚未公开的教师内部材料。",
      },
      new Date("2026-08-11T00:01:00Z"),
    );
    expect(sourceBacked.slides.some((slide) =>
      slide.points.some((point) => point.includes("尚未公开")),
    )).toBe(true);

    saveTeachingDeckProject(sourceBacked);

    expect(loadTeachingDeckProject()).toBeNull();
  });
});
