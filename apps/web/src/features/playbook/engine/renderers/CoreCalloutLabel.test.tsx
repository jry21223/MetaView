import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { CoreCalloutLabel } from "./CoreCalloutLabel";

describe("CoreCalloutLabel", () => {
  it("masks decorative callout strokes behind label text", () => {
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

    expect(markup).toContain('data-callout-text-mask="true"');
    expect(markup).toContain(">stores DNA</text>");
  });
});
