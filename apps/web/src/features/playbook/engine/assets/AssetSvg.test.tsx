import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { AssetSvg } from "./AssetSvg";

describe("AssetSvg", () => {
  it("renders deterministic missing-asset fallback with explicit marker", () => {
    const markup = renderToStaticMarkup(
      <svg viewBox="0 0 20 20">
        <AssetSvg
          assetId="missing-projectile"
          packId="physics-basic"
          x={2}
          y={3}
          width={10}
          height={10}
          fallbackShape="circle"
        />
      </svg>,
    );

    expect(markup).toContain('data-asset-id="missing-projectile"');
    expect(markup).toContain('data-missing-asset="true"');
    expect(markup).toContain("<circle");
    expect(markup).not.toContain("<image");
  });
});
