import type {
  TemplatePreviewCase,
  TemplatePreviewParamValue,
  TemplatePreviewParams,
} from "./templatePreviewCases";

interface TemplatePreviewControlsProps {
  previewCase: TemplatePreviewCase;
  params: TemplatePreviewParams;
  onChange: (id: string, value: TemplatePreviewParamValue, resetPlayback: boolean) => void;
  onReset: () => void;
  /** Current step id from the player; enables per-step effect badges. */
  currentStepId?: string;
}

export function TemplatePreviewControls({
  previewCase,
  params,
  onChange,
  onReset,
  currentStepId,
}: TemplatePreviewControlsProps) {
  // A control without a declared step scope applies everywhere and stays
  // badge-free (existing templates keep their current look).
  const controlActive = (steps?: readonly string[]) =>
    !steps || (currentStepId != null && steps.includes(currentStepId));
  const scopedControls = previewCase.controls.filter((control) => control.steps);
  const frozenStep =
    currentStepId != null &&
    scopedControls.length === previewCase.controls.length &&
    previewCase.controls.length > 0 &&
    previewCase.controls.every((control) => !controlActive(control.steps));

  return (
    <div className="mv-template-params" aria-label="案例参数">
      {frozenStep && (
        <p className="mv-template-params__frozen" role="status">
          当前步骤不可调参——本步是固定画面（真实数据或结论场景），参数会在标出的步骤生效。
        </p>
      )}
      {previewCase.controls.map((control) => {
        const inputId = `template-param-${previewCase.id}-${control.id}`;
        const value = params[control.id] ?? previewCase.defaultParams[control.id];
        const scoped = Boolean(control.steps);
        const active = controlActive(control.steps);
        const stateClass = scoped
          ? active
            ? " mv-template-param--step-active"
            : " mv-template-param--step-inactive"
          : "";
        return (
          <label className={`mv-template-param${stateClass}`} htmlFor={inputId} key={control.id}>
            <span className="mv-template-param__head">
              <strong>{control.label}</strong>
              {scoped && (
                <em
                  className={`mv-template-param__badge${active ? " is-active" : ""}`}
                  aria-label={active ? "此参数在当前步骤生效" : "此参数在当前步骤不生效"}
                >
                  {active ? "本步可调" : "本步不生效"}
                </em>
              )}
              <output htmlFor={inputId}>{String(value)}</output>
            </span>
            {control.kind === "select" ? (
              <select
                id={inputId}
                value={String(value)}
                onChange={(event) => onChange(control.id, event.target.value, control.resetPlayback)}
              >
                {control.options.map((option) => (
                  <option value={option.value} key={option.value}>{option.label}</option>
                ))}
              </select>
            ) : (
              <input
                id={inputId}
                type={control.kind}
                min={control.min}
                max={control.max}
                step={control.step}
                value={Number(value)}
                onChange={(event) => onChange(control.id, Number(event.target.value), control.resetPlayback)}
              />
            )}
            <small>{control.description}</small>
          </label>
        );
      })}
      <button type="button" className="mv-template-params__reset" onClick={onReset}>
        恢复默认参数
      </button>
    </div>
  );
}
