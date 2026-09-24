import { cleanup, render, screen } from "@testing-library/react";
import React from "react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import { TemplatePreviewPage } from "./TemplatePreviewPage";
import { getTemplatePreviewCase } from "./templatePreviewCases";
import { RETIRED_TEMPLATE_REDIRECTS, TEMPLATES } from "./templates";

function LocationProbe() {
  const location = useLocation();
  return <output aria-label="current-path">{location.pathname}</output>;
}

describe("TemplatePreviewPage retired links", () => {
  afterEach(() => {
    cleanup();
  });

  it("redirects the retired redox-electron link to the galvanic cell case", () => {
    render(
      <MemoryRouter initialEntries={["/templates/redox-electron"]}>
        <Routes>
          <Route path="/templates/galvanic-cell" element={<LocationProbe />} />
          <Route
            path="/templates/:templateId"
            element={<TemplatePreviewPage theme="light" topbarCollapsed={false} onToggleTopbar={() => undefined} />}
          />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByLabelText("current-path").textContent).toBe("/templates/galvanic-cell");
  });

  it("only retires ids that left the catalog, and only redirects to playable cases", () => {
    const catalogIds = new Set(TEMPLATES.map((template) => template.id));
    for (const [retired, target] of Object.entries(RETIRED_TEMPLATE_REDIRECTS)) {
      expect(catalogIds.has(retired), `${retired} is retired but still in TEMPLATES`).toBe(false);
      expect(catalogIds.has(target), `${retired} → ${target} is not in TEMPLATES`).toBe(true);
      expect(getTemplatePreviewCase(target), `${retired} → ${target} has no preview case`).toBeTruthy();
    }
  });
});
