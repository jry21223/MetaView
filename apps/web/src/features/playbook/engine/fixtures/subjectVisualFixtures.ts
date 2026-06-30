import { compileSceneBlueprintToPlaybookScript } from "../compiler/sceneBlueprintCompiler";
import type { PlaybookScript } from "../types";
import {
  SUBJECT_VISUAL_BLUEPRINT_IDS,
  getSubjectVisualBlueprint,
  type SubjectVisualFixtureId,
} from "./subjectVisualBlueprints";

export type { SubjectVisualFixtureId } from "./subjectVisualBlueprints";

export const subjectVisualFixtures: Record<SubjectVisualFixtureId, PlaybookScript> = Object.fromEntries(
  SUBJECT_VISUAL_BLUEPRINT_IDS.map((id) => [
    id,
    compileSceneBlueprintToPlaybookScript(getSubjectVisualBlueprint(id)),
  ]),
) as Record<SubjectVisualFixtureId, PlaybookScript>;

export function getSubjectVisualFixture(id: SubjectVisualFixtureId): PlaybookScript {
  return subjectVisualFixtures[id];
}
