import { describe, expect, it } from "vitest";

import catalogDocument from "../../../../../contracts/conic-archetypes.json";
import {
  createConicArchetypeCatalog,
  resolveConicArchetype,
} from "./conicArchetypeCatalog";

describe("conic archetype catalog", () => {
  it("rejects duplicate archetype IDs", () => {
    const duplicate = structuredClone(catalogDocument);
    duplicate.archetypes.push(structuredClone(duplicate.archetypes[0]));

    expect(() => createConicArchetypeCatalog(duplicate)).toThrow(
      "duplicate conic archetype ID",
    );
  });

  it("rejects unknown archetype IDs", () => {
    expect(() => resolveConicArchetype("conic.unknown")).toThrow(
      "Unknown conic archetype",
    );
  });

  it("enforces the same strict catalog fields as the API loader", () => {
    const invalidTolerance = structuredClone(catalogDocument);
    invalidTolerance.archetypes[0].expectedFacts[0].tolerance = -1;
    expect(() => createConicArchetypeCatalog(invalidTolerance)).toThrow("tolerance");

    const invalidArchetype = structuredClone(catalogDocument);
    invalidArchetype.archetypes[0].archetypeId = "ellipse.focus-definition";
    expect(() => createConicArchetypeCatalog(invalidArchetype)).toThrow("archetypeId");

    const extraField = structuredClone(catalogDocument);
    (extraField.archetypes[0] as Record<string, unknown>).unexpected = true;
    expect(() => createConicArchetypeCatalog(extraField)).toThrow("unexpected");
  });
});
