import { describe, expect, it } from "vitest";

import {
  findAssetByRole,
  getAssetPack,
  listAssetPacks,
} from "./assetRegistry";

describe("assetRegistry", () => {
  it("registers geography and physics starter visual kits", () => {
    const packs = listAssetPacks().map((pack) => pack.packId);

    expect(packs).toContain("geography-basic");
    expect(packs).toContain("physics-basic");
  });

  it("finds subject assets by semantic role", () => {
    expect(getAssetPack("geography-basic")?.subject).toBe("geography");
    expect(findAssetByRole("geography", "wind")?.id).toBe("monsoon-wind-arrow");
    expect(findAssetByRole("physics", "force")?.id).toBe("force-vector-arrow");
  });
});
