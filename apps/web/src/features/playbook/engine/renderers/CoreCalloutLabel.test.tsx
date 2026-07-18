import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { CoreCalloutLabel } from "./CoreCalloutLabel";

describe("CoreCalloutLabel", () => {
  it("renders a native callout leader and label", () => {
    const markup = renderToStaticMarkup(
      <svg>
        <CoreCalloutLabel
          id="dna-callout"
          targetId="nucleus"
          label="stores DNA"
          rendererKind="bio_cell_scene"
          anchor={{ x1: 44, y1: 42, x2: 10, y2: 34, textAnchor: "end" }}
        />
      </svg>,
    );

    expect(markup).toContain('data-semantic-role="callout"');
    expect(markup).toContain('data-target-id="nucleus"');
    expect(markup).toContain(">stores DNA</text>");
  });
});
