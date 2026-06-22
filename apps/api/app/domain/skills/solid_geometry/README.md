# Solid Geometry Skill Pack

This directory contains the V1 deterministic solid-geometry SkillPack boundary.

V1 scope:

- Detect prompts that likely need a solid-geometry problem spec.
- Keep the output contract aligned with `PlaybookScript` plus `DirectorScript`.
- Normalize supported text prompts into `SolidGeometryProblemSpec`.
- Use a SymPy-backed kernel for exact coordinates, vectors, plane normals, and answers.
- Emit `solid_geometry_scene` snapshots for the renderer.
- Emit `DirectorBeat.focus_target` values such as `line:SA`.

Out of scope for this pack:

- Full geometry theorem solving beyond the supported V1 cases.
- OCR / image problem recognition.
- Random problem generation.
- Three.js camera execution.
