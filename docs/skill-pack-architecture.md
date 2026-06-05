# Skill Pack Architecture

MetaView uses Director as the bridge between specialized problem solvers and renderer-specific execution.

The target flow is:

```text
SkillPack -> ProblemSpec -> PlaybookScript -> DirectorScript -> DirectorFramePlan -> RendererAdapter
```

## Responsibilities

- `SkillPack` detects and normalizes a problem family, such as solid geometry or force analysis.
- `ProblemSpec` stores structured inputs that a domain kernel can validate and solve.
- `PlaybookScript` remains the persistent visual and narration script.
- `DirectorScript` stores persistent high-level shot intent, such as `focus_target`, `intent`, and `camera_motion`.
- `DirectorFramePlan` resolves the current beat and chooses the renderer adapter for the current frame.
- Renderer adapters execute the same intent through renderer-native camera systems.

## Renderer Execution

- MathScene adapter maps focused or newly added objects to a Mafs `viewBox`.
- Stage adapter maps push, pull, and pan motion to conservative CSS transforms.
- Future Three adapter can map `focus_target` to camera position and target.
- Future Canvas/SVG adapters can map `focus_target` to viewport transforms.

## Future Skill Pack Contract

A solid geometry skill pack can eventually emit a beat like:

```json
{
  "beat_id": "beat_02",
  "step_id": "step_02",
  "start_frame": 60,
  "end_frame": 120,
  "intent": "focus",
  "shot_type": "close",
  "camera_motion": "focus_target",
  "pacing": "normal",
  "focus_target": "segment:Line_BE",
  "emphasis_terms": ["Line_BE"]
}
```

The Director does not decide how the camera is moved. It only names the intent. The selected renderer adapter owns concrete execution.

## Solid Geometry V1

The first concrete skill pack using this bridge is documented in
[`solid-geometry-skill.md`](./solid-geometry-skill.md). It adds a small
SymPy-backed kernel and an SVG `solid_geometry_scene` renderer, while keeping
the existing `PlaybookScript -> DirectorScript -> Renderer` boundary.

Still out of scope for the shared skill-pack bridge: a physics solver,
Canvas/WebGL renderers, Three.js camera execution, or an editor UI.
