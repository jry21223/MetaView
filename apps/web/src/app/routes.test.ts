import { describe, expect, it } from "vitest";

import { pathToStage, stageToPath } from "./routes";

describe("app route helpers", () => {
  it("maps app-shell stages to shareable paths", () => {
    expect(stageToPath("intake")).toBe("/create");
    expect(stageToPath("workbench", "run-1")).toBe("/run/run-1");
    expect(stageToPath("history")).toBe("/history");
    expect(stageToPath("templates")).toBe("/templates");
    expect(stageToPath("settings")).toBe("/settings");
  });

  it("falls back to create when workbench has no run id", () => {
    expect(stageToPath("workbench")).toBe("/create");
  });

  it("derives the active app stage from location pathnames", () => {
    expect(pathToStage("/create")).toBe("intake");
    expect(pathToStage("/create/")).toBe("intake");
    expect(pathToStage("/run/run-1")).toBe("workbench");
    expect(pathToStage("/run/run-1/")).toBe("workbench");
    expect(pathToStage("/history")).toBe("history");
    expect(pathToStage("/templates")).toBe("templates");
    expect(pathToStage("/templates/bfs-tree")).toBe("templates");
    expect(pathToStage("/settings")).toBe("settings");
  });

  it("treats unknown shell paths as intake for navigation state", () => {
    expect(pathToStage("/")).toBe("intake");
    expect(pathToStage("/nope")).toBe("intake");
    expect(pathToStage("/run")).toBe("intake");
  });
});
