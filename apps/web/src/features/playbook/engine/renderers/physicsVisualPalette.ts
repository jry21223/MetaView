export interface PhysicsVisualPalette {
  trajectory: string;
  velocity: string;
  acceleration: string;
  force: string;
}

export type PhysicsVisualRole = keyof PhysicsVisualPalette;

/**
 * Subject-local colors for physics diagrams.
 *
 * These values encode physical meaning, not camera focus or teaching emphasis.
 * DirectorScript and RenderPlan remain responsible for visibility and focus.
 */
export const PHYSICS_VISUAL_PALETTE: Record<"light" | "dark", PhysicsVisualPalette> = {
  light: {
    trajectory: "#2f3431",
    velocity: "#356b5c",
    acceleration: "#8a5a00",
    force: "#2f3431",
  },
  dark: {
    trajectory: "#d7ddd8",
    velocity: "#8fc5b1",
    acceleration: "#e5b45b",
    force: "#d7ddd8",
  },
};

const PHYSICS_ROLE_VARS: Record<PhysicsVisualRole, string> = {
  trajectory: "--physics-trajectory",
  velocity: "--physics-velocity",
  acceleration: "--physics-acceleration",
  force: "--physics-force",
};

export function physicsVisualColor(
  role: PhysicsVisualRole,
  theme: "light" | "dark",
): string {
  return `var(${PHYSICS_ROLE_VARS[role]}, ${PHYSICS_VISUAL_PALETTE[theme][role]})`;
}
