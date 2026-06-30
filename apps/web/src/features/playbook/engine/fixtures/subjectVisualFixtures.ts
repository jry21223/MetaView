import type { GeoMapSceneSnapshot, PhysicsForceSceneSnapshot, PlaybookScript } from "../types";

export type SubjectVisualFixtureId = "east_asia_monsoon" | "projectile_motion";

function eastAsiaMonsoonSnapshot(): GeoMapSceneSnapshot {
  return {
    kind: "geo_map_scene",
    pack_id: "geography-earth-basic",
    map_region: "east_asia",
    layers: [
      { id: "map", semantic_role: "map_layer", label: "East Asia map", asset_id: "east-asia-land-110m" },
      { id: "land", semantic_role: "land", label: "heated continent" },
      { id: "ocean", semantic_role: "ocean", label: "western Pacific" },
    ],
    flows: [
      {
        id: "summer-monsoon",
        semantic_role: "monsoon_flow",
        from: [78, 68],
        to: [42, 38],
        label: "summer monsoon",
        asset_id: "monsoon-wind-arrow",
        strength: 1.1,
      },
    ],
    pressure_centers: [
      { id: "land-low", kind: "low", x: 38, y: 35, label: "land low" },
      { id: "ocean-high", kind: "high", x: 76, y: 64, label: "ocean high" },
    ],
    particle_preset: "moisture_particles",
    caption: "Land-sea thermal contrast reverses seasonal wind direction.",
  };
}

function projectileMotionSnapshot(): PhysicsForceSceneSnapshot {
  return {
    kind: "physics_force_scene",
    pack_id: "physics-basic",
    objects: [
      { id: "body", label: "projectile", x: 30, y: 42, asset_id: "projectile-body-dot" },
    ],
    vectors: [
      { id: "vx", target: "body", semantic_role: "velocity", dx: 28, dy: 0, label: "v_x" },
      { id: "vy", target: "body", semantic_role: "velocity", dx: 0, dy: 18, label: "v_y" },
      { id: "g", target: "body", semantic_role: "acceleration", dx: 0, dy: 24, label: "g" },
      { id: "force", target: "body", semantic_role: "force", dx: -16, dy: 8, label: "F" },
    ],
    trajectory: [[18, 34], [32, 42], [50, 57], [72, 78]],
    formula_latex: "x=v_0t,\\quad y=\\frac12gt^2",
    caption: "Horizontal velocity stays constant while vertical acceleration bends the path.",
  };
}

function scriptFor(
  id: SubjectVisualFixtureId,
  domain: "geography" | "physics",
  title: string,
  snapshot: GeoMapSceneSnapshot | PhysicsForceSceneSnapshot,
): PlaybookScript {
  return {
    schema_version: "1.0.0",
    fps: 30,
    total_frames: 90,
    domain,
    title,
    summary: title,
    parameter_controls: [],
    steps: [
      {
        step_id: id,
        end_frame: 90,
        title,
        voiceover_text: snapshot.caption ?? title,
        snapshot,
        tokens: [],
      },
    ],
  };
}

export const subjectVisualFixtures: Record<SubjectVisualFixtureId, PlaybookScript> = {
  east_asia_monsoon: scriptFor(
    "east_asia_monsoon",
    "geography",
    "East Asia monsoon",
    eastAsiaMonsoonSnapshot(),
  ),
  projectile_motion: scriptFor(
    "projectile_motion",
    "physics",
    "Projectile motion",
    projectileMotionSnapshot(),
  ),
};

export function getSubjectVisualFixture(id: SubjectVisualFixtureId): PlaybookScript {
  return subjectVisualFixtures[id];
}
