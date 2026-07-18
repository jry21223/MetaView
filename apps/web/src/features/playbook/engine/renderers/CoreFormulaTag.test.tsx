import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { CoreFormulaTag } from "./CoreFormulaTag";

describe("CoreFormulaTag", () => {
  it("renders a native formula card with fitted text", () => {
    const markup = renderToStaticMarkup(
      <svg>
        <CoreFormulaTag
          id="projectile-formula"
          text="x=v_0t, y=1/2gt^2"
          rendererKind="physics_force_scene"
          x={57}
          y={14.5}
          width={37}
          height={9}
          textAnchor="end"
          textX={92}
          textY={20.6}
          fontSize={4.2}
        />
      </svg>,
    );

    expect(markup).toContain('data-semantic-role="formula_card"');
    expect(markup).toContain('data-formula-tag-id="projectile-formula"');
    expect(markup).toContain('data-fitted-font-size="');
    expect(markup).toContain('font-size="2.');
  });
});
