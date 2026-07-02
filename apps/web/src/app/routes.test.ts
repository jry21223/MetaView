import { describe, expect, it } from "vitest";

import { pathToStage, stageToPath } from "./routes";

describe("app route helpers", () => {
  it("maps top-level stages to shareable paths", () => {
    expect(stageToPath("intake")).toBe("/");
    expect(stageToPath("workbench", "run-1")).toBe("/run/run-1");
    expect(stageToPath("history")).toBe("/history");
    expect(stageToPath("templates")).toBe("/templates");
    expect(stageToPath("settings")).toBe("/settings");
  });

  it("falls back to intake when workbench has no run id", () => {
    expect(stageToPath("workbench")).toBe("/");
  });

  it("derives the active stage from location pathnames", () => {
    expect(pathToStage("/")).toBe("intake");
    expect(pathToStage("/run/run-1")).toBe("workbench");
    expect(pathToStage("/run/run-1/")).toBe("workbench");
    expect(pathToStage("/history")).toBe("history");
    expect(pathToStage("/templates")).toBe("templates");
    expect(pathToStage("/settings")).toBe("settings");
  });

  it("treats unknown shell paths as intake for navigation state", () => {
    expect(pathToStage("/nope")).toBe("intake");
    expect(pathToStage("/run")).toBe("intake");
  });
});
