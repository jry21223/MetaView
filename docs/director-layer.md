# Director Layer

Status: Active architecture contract

Director is MetaView's independent video-direction layer. It is not a synonym for `PlaybookScript`, not a UI-only label, and not a generic prompt appendix. Its job is to turn a valid educational playbook into a watchable directed explanation by deciding framing, shot rhythm, emphasis, transitions, and temporal attention.

## Core definition

MetaView should be read as a two-contract generation system:

```text
User input
  -> subject understanding / router / SkillPack / agent
  -> PlaybookScript
  -> DirectorScript
  -> RenderPlan
  -> Remotion preview / export
```

| Layer | Owns | Must not own |
| --- | --- | --- |
| `PlaybookScript` | educational content, steps, snapshots, formulas, visual objects, narration text, renderer-supported scene data | camera grammar, edit rhythm, shot language, presentation pacing |
| `DirectorScript` | beats, framing, camera motion, pacing, focus target, emphasis terms, transition intent, optional voiceover override | subject derivation, math facts, algorithm state, raw visual object schema |
| `RenderPlan` | deterministic conversion from `DirectorScript` to Remotion-friendly animation parameters | LLM decisions or subject reasoning |
| Renderer | frame interpolation, transforms, opacity, timing, export | changing the lesson content |

In product language, Director is the `导演层`. In engineering language, it is the executable shot-planning contract between content generation and rendering.

## Why Director exists

A generated explanation can be factually correct but still hard to watch. Director answers which step is the hook, what the viewer should look at, whether the shot should hold or move, where the rhythm should slow down, which terms should be emphasized, and how the sequence feels as a directed educational video rather than a slide deck.

This is closer to previsualization, storyboarding, camera planning, and edit pacing than to ordinary script generation.

## Current implementation

The backend already has a Director V0/V1 foundation:

- `DirectorScript` 继续使用 `schema_version: "1.0.0"`；本次没有新增 CompositionPlan 或平行镜头数据模型。
- `apps/api/app/domain/models/director.py` defines `DirectorScript` and `DirectorBeat`.
- A beat currently includes `intent`, `shot_type`, `camera_motion`, `pacing`, `voiceover_text`, `emphasis_terms`, and `focus_target`.
- `apps/api/app/domain/services/director_builder.py` builds a rule-based director from a `PlaybookScript`.
- The first beat is treated as a hook with `push_in`; the final beat becomes a slow summary with `pull_out`.
- Director scripts are stored separately through the run director repository and returned with run responses.
- The player includes a read-only Director Inspector showing source, beat count, current beat, intent, shot type, camera motion, pacing, focus target, emphasis terms, and frame range.
- Follow-up can persist DirectorScript patch revisions for camera, pacing, shot, voiceover, emphasis, and focus changes without rewriting PlaybookScript.
- 通用 Stage Adapter 将 `push_in` 映射为 `1.00 → 1.08`，将 `pull_out` 映射为 `1.08 → 1.00`，并将 `pan_left` / `pan_right` 映射为 `0 → ±40px`。这些确定性变换同时供浏览器预览与 Remotion 导出使用。
- `hold` 保持静止；通用 Stage Transform 不会为 `focus_target` 伪造缩放。`focus_target` 仍由能够稳定定位目标的具体 Adapter 逐步支持。

This proves Director is a real architecture layer, but not yet a full director intelligence layer. Current source is usually `rule`; follow-up patches set `source="manual"`. Planner-assisted direction remains future work.

## Correct execution model

```text
PlaybookScript generated and validated
  -> build_default_director(playbook)
  -> validate DirectorScript
  -> persist DirectorScript with run
  -> buildRenderPlan(playbook, director)
  -> Remotion consumes playbook + render plan
```

The renderer should not scatter ad-hoc `director.camera_motion` logic across components. It should consume a deterministic `RenderPlan` produced by one adapter.

## Director vocabulary

| Field | Meaning |
| --- | --- |
| `intent` | pedagogical/editing intent: `hook`, `focus`, `reveal`, `compare`, `summary`, `explain` |
| `shot_type` | framing size: `wide`, `medium`, `close`, `detail` |
| `camera_motion` | virtual camera action: `hold`, `push_in`, `pull_out`, `pan_left`, `pan_right`, `focus_target` |
| `pacing` | local rhythm: `fast`, `normal`, `slow` |
| `emphasis_terms` | words or symbols that should be highlighted in the beat |
| `focus_target` | optional target id or visual object to keep in attention |
| `voiceover_text` | optional director-level narration override; default should remain playbook voiceover |

Renderer-consumed today: `camera_motion`, `pacing`, `voiceover_text` for non-rule directors, and math-scene camera planning via the Director frame plan. Inspector-consumed today: all fields in the table plus frame range and beat metadata. `intent`, `shot_type`, `focus_target`, and `emphasis_terms` are visible and patchable; renderer support for them remains incremental and adapter-specific.

Recommended next field: `transition: cut | fade | reveal | morph | none`.

Do not add a large film-production ontology yet. Add fields only when the renderer or inspector can consume them.

## Boundaries

Director should change how the same content is watched, not what the subject result is.

- It should not regenerate formulas or algorithm states.
- It should not invent unsupported snapshot kinds.
- It should not bypass PlaybookScript validation.
- It should not become a parallel renderer.
- It should not become a dumping ground for arbitrary planning notes.

## Roadmap

### V1: visible rule director

Status: Complete for the MVP loop.

Tasks:

1. Show `director.source` and beat count in the result page.
2. Add a read-only Director Inspector.
3. Display each beat's `intent`, `shot_type`, `camera_motion`, `pacing`, `emphasis_terms`, and frame range.
4. Keep generation unchanged.

Acceptance: a user can open a run and see how the lesson is directed.

### V2: render-impact director

Status: Active. `camera_motion` and light `pacing` are consumed through the Director frame plan / adapter path.

Tasks:

1. Add `buildRenderPlan(playbook, director)` as a pure frontend function.
2. Map `push_in`, `pull_out`, `hold`, and `pacing` to deterministic camera/pacing parameters.
3. Wrap each rendered step in a shot frame that applies the render plan.
4. Keep PlaybookScript schema unchanged.

Acceptance: the same PlaybookScript with different DirectorScripts produces visibly different preview rhythm.

### V3: editable director

Status: Active for follow-up patches. Direct UI editing is not implemented.

Tasks:

1. Add a director patch use case.
2. Allow edits to `camera_motion`, `pacing`, `shot_type`, `voiceover_text`, `emphasis_terms`, and `focus_target`.
3. Reject changes to `run_id`, `schema_version`, `beat_id`, `step_id`, `start_frame`, and `end_frame`.
4. Persist patched director together with the follow-up version used by preview/export.

Acceptance: a user can ask for a slower shot or a stronger summary pull-out and only DirectorScript changes.

### V4: DirectorPlanner

Goal: an LLM or agent generates or repairs DirectorScript only after content is stable.

Input: user prompt, validated PlaybookScript, default DirectorScript, and style preference.

Output: validated DirectorScript or DirectorScript patch.

Fallback: invalid planner output falls back to the rule director.

Acceptance: review actions distinguish `director:source:rule`, `director:source:llm`, `director:source:agent`, and `director:fallback:rule`.

## Immediate guardrails

- Keep `PlaybookScript` as the content contract.
- Keep `DirectorScript` as the direction contract.
- Do not move Director fields into Playbook steps.
- Do not ask the model to hard-code frame transforms; map them in program code.
- Do not add advanced fields until inspector and renderer consume the current ones.
- Treat Director as a first-class product differentiator: content generation explains; director layer makes it watchable.
