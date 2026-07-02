import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe("asset check targets", () => {
  it("includes asset gates in the root make check path", () => {
    const makefile = readFileSync(path.resolve(__dirname, "../../../../../../../Makefile"), "utf8");
    const webPackage = readFileSync(path.resolve(__dirname, "../../../../../package.json"), "utf8");

    expect(makefile).toMatch(/^asset-audit:/m);
    expect(makefile).toMatch(/^asset-showcase:/m);
    expect(makefile).toMatch(/^check: .*asset-audit/m);
    expect(makefile).toMatch(/^check: .*asset-showcase/m);
    expect(webPackage).toContain('"showcase:smoke"');
    expect(webPackage).toContain('"showcase:baseline"');
    expect(webPackage).toContain('"showcase:approve-reference"');
    expect(makefile).toMatch(/npm --workspace apps\/web run showcase:smoke\n\tnpm --workspace apps\/web run showcase:baseline/);
  });
});
