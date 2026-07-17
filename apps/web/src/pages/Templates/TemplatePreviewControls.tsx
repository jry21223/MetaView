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
}

export function TemplatePreviewControls({
  previewCase,
  params,
  onChange,
  onReset,
}: TemplatePreviewControlsProps) {
  return (
    <div className="mv-template-params" aria-label="案例参数">
      {previewCase.controls.map((control) => {
        const inputId = `template-param-${previewCase.id}-${control.id}`;
        const value = params[control.id] ?? previewCase.defaultParams[control.id];
        return (
          <label className="mv-template-param" htmlFor={inputId} key={control.id}>
            <span className="mv-template-param__head">
              <strong>{control.label}</strong>
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
