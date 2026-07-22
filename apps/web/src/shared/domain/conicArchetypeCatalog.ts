import catalogDocument from "../../../../../contracts/conic-archetypes.json";

export interface ConicExpectedFactRule {
  readonly id: string;
  readonly description: string;
  readonly anyOf: readonly string[];
  readonly tolerance?: number;
}

export interface ConicVisualInvariant {
  readonly id: string;
  readonly description: string;
  readonly requiredSemanticRoles: readonly string[];
  readonly requiredStateFields: readonly string[];
}

export interface ConicPedagogicalRubric {
  readonly objective: string;
  readonly requiredPhases: readonly string[];
  readonly minimumSteps: number;
}

export interface ConicArchetypeMetadata {
  readonly archetypeId: string;
  readonly publicCaseId: string;
  readonly requiredCapabilities: readonly string[];
  readonly expectedFacts: readonly ConicExpectedFactRule[];
  readonly visualInvariants: readonly ConicVisualInvariant[];
  readonly pedagogicalRubric: ConicPedagogicalRubric;
}

function assertNonBlank(value: unknown, field: string): asserts value is string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${field} must be a non-blank string`);
  }
}

function assertStringList(value: unknown, field: string): asserts value is string[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${field} must be a non-empty list`);
  }
  value.forEach((item, index) => assertNonBlank(item, `${field}[${index}]`));
}

function asRecord(value: unknown, field: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${field} must be an object`);
  }
  return value as Record<string, unknown>;
}

function assertExactFields(
  value: Record<string, unknown>,
  expected: readonly string[],
  field: string,
): void {
  const allowed = new Set(expected);
  const unexpected = Object.keys(value).filter((key) => !allowed.has(key));
  if (unexpected.length > 0) {
    throw new Error(`${field} contains unexpected fields: ${unexpected.join(", ")}`);
  }
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const nested of Object.values(value)) deepFreeze(nested);
  return value;
}

export function createConicArchetypeCatalog(value: unknown): readonly ConicArchetypeMetadata[] {
  const document = asRecord(value, "conic archetype catalog");
  assertExactFields(
    document,
    ["schemaVersion", "subject", "domain", "archetypes"],
    "conic archetype catalog",
  );
  if (document.schemaVersion !== "1.0.0") throw new Error("unsupported conic catalog schema");
  if (document.subject !== "high_school_math" || document.domain !== "conic_sections") {
    throw new Error("conic catalog subject/domain mismatch");
  }
  if (!Array.isArray(document.archetypes) || document.archetypes.length === 0) {
    throw new Error("conic catalog must define archetypes");
  }

  const archetypeIds = new Set<string>();
  const publicCaseIds = new Set<string>();
  for (const [index, rawArchetype] of document.archetypes.entries()) {
    const archetype = asRecord(rawArchetype, `archetypes[${index}]`);
    assertExactFields(
      archetype,
      [
        "archetypeId",
        "publicCaseId",
        "requiredCapabilities",
        "expectedFacts",
        "visualInvariants",
        "pedagogicalRubric",
      ],
      `archetypes[${index}]`,
    );
    assertNonBlank(archetype.archetypeId, `archetypes[${index}].archetypeId`);
    if (!/^conic\./.test(archetype.archetypeId)) {
      throw new Error(`archetypes[${index}].archetypeId must start with conic.`);
    }
    assertNonBlank(archetype.publicCaseId, `archetypes[${index}].publicCaseId`);
    if (archetypeIds.has(archetype.archetypeId)) {
      throw new Error(`duplicate conic archetype ID: ${archetype.archetypeId}`);
    }
    if (publicCaseIds.has(archetype.publicCaseId)) {
      throw new Error(`duplicate conic public case ID: ${archetype.publicCaseId}`);
    }
    archetypeIds.add(archetype.archetypeId);
    publicCaseIds.add(archetype.publicCaseId);

    assertStringList(
      archetype.requiredCapabilities,
      `archetypes[${index}].requiredCapabilities`,
    );
    if (!Array.isArray(archetype.expectedFacts) || archetype.expectedFacts.length === 0) {
      throw new Error(`archetypes[${index}].expectedFacts must be a non-empty list`);
    }
    const factIds = new Set<string>();
    for (const [factIndex, rawFact] of archetype.expectedFacts.entries()) {
      const fact = asRecord(rawFact, `archetypes[${index}].expectedFacts[${factIndex}]`);
      assertExactFields(
        fact,
        ["id", "description", "anyOf", "tolerance"],
        `archetypes[${index}].expectedFacts[${factIndex}]`,
      );
      assertNonBlank(fact.id, `archetypes[${index}].expectedFacts[${factIndex}].id`);
      assertNonBlank(
        fact.description,
        `archetypes[${index}].expectedFacts[${factIndex}].description`,
      );
      assertStringList(fact.anyOf, `archetypes[${index}].expectedFacts[${factIndex}].anyOf`);
      if (
        fact.tolerance !== undefined
        && (typeof fact.tolerance !== "number"
          || !Number.isFinite(fact.tolerance)
          || fact.tolerance <= 0)
      ) {
        throw new Error(
          `archetypes[${index}].expectedFacts[${factIndex}].tolerance must be positive`,
        );
      }
      if (factIds.has(fact.id)) throw new Error(`duplicate conic fact ID: ${fact.id}`);
      factIds.add(fact.id);
    }

    if (!Array.isArray(archetype.visualInvariants) || archetype.visualInvariants.length === 0) {
      throw new Error(`archetypes[${index}].visualInvariants must be a non-empty list`);
    }
    for (const [visualIndex, rawVisual] of archetype.visualInvariants.entries()) {
      const visual = asRecord(
        rawVisual,
        `archetypes[${index}].visualInvariants[${visualIndex}]`,
      );
      assertExactFields(
        visual,
        ["id", "description", "requiredSemanticRoles", "requiredStateFields"],
        `archetypes[${index}].visualInvariants[${visualIndex}]`,
      );
      assertNonBlank(
        visual.id,
        `archetypes[${index}].visualInvariants[${visualIndex}].id`,
      );
      assertNonBlank(
        visual.description,
        `archetypes[${index}].visualInvariants[${visualIndex}].description`,
      );
      assertStringList(
        visual.requiredSemanticRoles,
        `archetypes[${index}].visualInvariants[${visualIndex}].requiredSemanticRoles`,
      );
      assertStringList(
        visual.requiredStateFields,
        `archetypes[${index}].visualInvariants[${visualIndex}].requiredStateFields`,
      );
    }

    const rubric = asRecord(
      archetype.pedagogicalRubric,
      `archetypes[${index}].pedagogicalRubric`,
    );
    assertExactFields(
      rubric,
      ["objective", "requiredPhases", "minimumSteps"],
      `archetypes[${index}].pedagogicalRubric`,
    );
    assertNonBlank(rubric.objective, `archetypes[${index}].pedagogicalRubric.objective`);
    assertStringList(
      rubric.requiredPhases,
      `archetypes[${index}].pedagogicalRubric.requiredPhases`,
    );
    if (!Number.isInteger(rubric.minimumSteps) || Number(rubric.minimumSteps) < 1) {
      throw new Error(`archetypes[${index}].pedagogicalRubric.minimumSteps must be positive`);
    }
  }

  return deepFreeze(document.archetypes as unknown as ConicArchetypeMetadata[]);
}

export const CONIC_ARCHETYPE_CATALOG = createConicArchetypeCatalog(
  catalogDocument,
);

const CONIC_ARCHETYPE_BY_ID = new Map(
  CONIC_ARCHETYPE_CATALOG.map((archetype) => [archetype.archetypeId, archetype]),
);

export function resolveConicArchetype(archetypeId: string): ConicArchetypeMetadata {
  const archetype = CONIC_ARCHETYPE_BY_ID.get(archetypeId);
  if (!archetype) throw new Error(`Unknown conic archetype: ${archetypeId}`);
  return archetype;
}
