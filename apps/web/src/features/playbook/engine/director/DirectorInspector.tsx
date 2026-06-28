import type { DirectorBeat, DirectorScript } from "./types";

interface DirectorInspectorProps {
  director?: DirectorScript | null;
  currentStepId?: string | null;
}

function findCurrentBeat(
  director: DirectorScript,
  currentStepId: string | null | undefined,
): DirectorBeat | null {
  if (!currentStepId) return director.beats[0] ?? null;
  return director.beats.find((beat) => beat.step_id === currentStepId) ?? null;
}

function Field({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <div className="director-inspector__field">
      <dt>{label}</dt>
      <dd>{value === null || value === undefined || value === "" ? "none" : value}</dd>
    </div>
  );
}

export function DirectorInspector({
  director = null,
  currentStepId = null,
}: DirectorInspectorProps) {
  if (!director) {
    return (
      <section className="director-inspector" aria-label="Director inspector">
        <div className="director-inspector__empty">No DirectorScript available.</div>
      </section>
    );
  }

  const beat = findCurrentBeat(director, currentStepId);
  const emphasisTerms = beat?.emphasis_terms?.length
    ? beat.emphasis_terms.join(", ")
    : "none";
  const frameRange = beat ? `${beat.start_frame}-${beat.end_frame}` : "none";

  return (
    <section className="director-inspector" aria-label="Director inspector">
      <div className="director-inspector__summary">
        <span>source</span>
        <strong>{director.source}</strong>
        <span>beats</span>
        <strong>{director.beats.length}</strong>
      </div>

      {beat ? (
        <dl className="director-inspector__grid">
          <Field label="beat" value={beat.beat_id} />
          <Field label="step" value={beat.step_id} />
          <Field label="intent" value={beat.intent} />
          <Field label="shot" value={beat.shot_type} />
          <Field label="camera" value={beat.camera_motion} />
          <Field label="pacing" value={beat.pacing} />
          <Field label="focus" value={beat.focus_target} />
          <Field label="emphasis" value={emphasisTerms} />
          <Field label="frames" value={frameRange} />
        </dl>
      ) : (
        <div className="director-inspector__empty">No beat for current step.</div>
      )}
    </section>
  );
}
