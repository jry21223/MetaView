import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";

import { SUBJECT_VISUAL_BLUEPRINT_IDS, subjectVisualBlueprints } from "../fixtures/subjectVisualBlueprints";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function readPublicJson<T>(assetPath: string): T {
  return JSON.parse(readFileSync(path.resolve(__dirname, "../../../../../public", `.${assetPath}`), "utf8")) as T;
}

describe("sceneBlueprint schema", () => {
  it("validates every subject visual fixture blueprint", () => {
    const schema = readPublicJson<unknown>("/schemas/scene-blueprint.schema.json");
    const ajv = new Ajv2020({ allErrors: true, strict: false });
    addFormats(ajv);
    const validate = ajv.compile(schema);

    for (const id of SUBJECT_VISUAL_BLUEPRINT_IDS) {
      expect(validate(subjectVisualBlueprints[id]), `${id}: ${ajv.errorsText(validate.errors)}`).toBe(true);
    }
  });

  it("requires the visual compiler contract fields", () => {
    const schema = readPublicJson<{
      required: string[];
      properties: {
        subject: { enum: string[] };
        sceneType: { enum: string[] };
      };
    }>("/schemas/scene-blueprint.schema.json");

    expect(schema.required).toEqual(expect.arrayContaining(["subject", "sceneType", "title", "visualIntent"]));
    expect(schema.properties.subject.enum).toEqual(
      expect.arrayContaining(["algorithm", "biology", "chemistry", "geography", "math", "physics"]),
    );
    expect(schema.properties.sceneType.enum).toEqual(
      expect.arrayContaining([
        "east_asia_monsoon",
        "projectile_motion",
        "cell_structure",
        "dna_replication",
        "molecule_2d_water",
        "molecule_2d_methane",
        "reaction_synthesis_water",
        "derivative_tangent",
        "bfs_graph",
        "recursion_stack",
        "binary_search",
      ]),
    );
  });
});
