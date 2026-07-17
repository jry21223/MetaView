import { resolveAssetById, resolveAssetByRole, resolveAssetForRenderer } from "../../assets/assetResolver";
import type { SubjectVisualKitSubject } from "../../assets/assetRegistry";
import type { PhysicsForceSceneSnapshot, PhysicsSceneVector } from "../../types";

export interface PhysicsObjectLayoutInput {
  id?: string;
  label?: string;
  semanticRole?: "projectile" | "object" | "block" | string;
  assetId?: string;
  x?: number;
  y?: number;
  radius?: number;
}

export interface PhysicsVectorLayoutInput {
  id?: string;
  target?: string;
  semanticRole: "force" | "velocity" | "acceleration" | string;
  dx: number;
  dy: number;
  label?: string;
  magnitude?: string;
}

export interface PhysicsForceLayoutInput {
  packId: string;
  object?: PhysicsObjectLayoutInput;
  vectors?: PhysicsVectorLayoutInput[];
  trajectory?: Array<[number, number]>;
  formulaLatex?: string;
  caption?: string;
}

function resolveAssetIdByRole(
  rendererKind: string,
  subject: SubjectVisualKitSubject,
  packId: string,
  semanticRole: string,
  fallbacks: string[] = [],
): string | undefined {
  for (const role of [semanticRole, ...fallbacks]) {
    const asset =
      resolveAssetForRenderer(rendererKind, role, packId) ??
      resolveAssetByRole(subject, role, packId) ??
      resolveAssetForRenderer(rendererKind, role) ??
      resolveAssetByRole(subject, role);
    if (asset) return asset.id;
  }
  return undefined;
}

function roundToOneDecimal(value: number): number {
  return Math.round(value * 10) / 10;
}

function compileProjectileTrajectory(): Array<[number, number]> {
  return Array.from({ length: 5 }, (_, index) => {
    const t = index / 4;
    return [roundToOneDecimal(18 + 54 * t), roundToOneDecimal(34 + 44 * t * t)];
  });
}

function defaultPhysicsVectors(targetId: string): PhysicsSceneVector[] {
  return [
    { id: "vx", target: targetId, semantic_role: "velocity", dx: 28, dy: 0, label: "v_x" },
    { id: "vy", target: targetId, semantic_role: "velocity", dx: 0, dy: 18, label: "v_y" },
    { id: "g", target: targetId, semantic_role: "acceleration", dx: 0, dy: 24, label: "g" },
    { id: "force", target: targetId, semantic_role: "force", dx: -16, dy: 8, label: "F" },
  ];
}

function compilePhysicsVectors(vectors: PhysicsVectorLayoutInput[] | undefined, targetId: string): PhysicsSceneVector[] {
  if (!vectors?.length) return defaultPhysicsVectors(targetId);
  return vectors.map((vector, index) => ({
    id: vector.id ?? `${vector.semanticRole}-${index + 1}`,
    target: vector.target ?? targetId,
    semantic_role: vector.semanticRole,
    dx: vector.dx,
    dy: vector.dy,
    label: vector.label,
    magnitude: vector.magnitude,
  }));
}

export function compilePhysicsForceLayout(input: PhysicsForceLayoutInput): PhysicsForceSceneSnapshot {
  const objectIntent = input.object ?? {};
  const objectId = objectIntent.id ?? "body";
  const objectRole = objectIntent.semanticRole ?? "projectile";
  const explicitAsset = objectIntent.assetId ? resolveAssetById(input.packId, objectIntent.assetId) : undefined;
  const objectAssetId =
    objectIntent.assetId ??
    explicitAsset?.id ??
    resolveAssetIdByRole("physics_force_scene", "physics", input.packId, objectRole, ["object"]);

  return {
    kind: "physics_force_scene",
    pack_id: input.packId,
    objects: [
      {
        id: objectId,
        label: objectIntent.label ?? "projectile",
        x: objectIntent.x ?? 30,
        y: objectIntent.y ?? 42,
        asset_id: objectAssetId,
        radius: objectIntent.radius,
      },
    ],
    vectors: compilePhysicsVectors(input.vectors, objectId),
    trajectory: input.trajectory ?? compileProjectileTrajectory(),
    formula_latex: input.formulaLatex ?? "x=v_0t,\\quad y=\\frac12gt^2",
    caption:
      input.caption ??
      "Horizontal velocity stays constant while vertical acceleration bends the path.",
  };
}
