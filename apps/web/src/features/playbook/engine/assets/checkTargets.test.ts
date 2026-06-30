import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe("asset check targets", () => {
  it("includes asset:audit in the root make check path", () => {
    const makefile = readFileSync(path.resolve(__dirname, "../../../../../../../Makefile"), "utf8");

    expect(makefile).toMatch(/^asset-audit:/m);
    expect(makefile).toMatch(/^check: .*asset-audit/m);
  });
});
