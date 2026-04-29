import React, { useState, useMemo } from 'react';
import { useTweaks, themeVars, TWEAK_DEFAULTS } from '../features/studio-editor/hooks/useTweaks';
import { IntakeScreen, IntakeContext } from '../features/studio-editor/ui/IntakeScreen';
import { TweaksPanel } from '../features/studio-editor/ui/TweaksPanel';
import { StudioPage } from '../pages/Studio/StudioPage';

type Stage = 'intake' | 'workbench';

export function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [stage, setStage] = useState<Stage>('intake');
  const [intakeCtx, setIntakeCtx] = useState<IntakeContext | null>(null);

  const css = useMemo(() => themeVars(t), [t]);

  const subject = (intakeCtx?.subject ?? 'algo') as 'algo' | 'math' | 'phys';

  const handleSubmit = (ctx: IntakeContext) => {
    setIntakeCtx(ctx);
    setStage('workbench');
  };

  return (
    <div
      className={`mv-root mv-${t.theme} mv-density-${t.density} mv-layout-${t.layout}`}
      style={css}
    >
      {stage === 'intake' ? (
        <IntakeScreen onSubmit={handleSubmit} t={t} />
      ) : (
        <StudioPage
          subject={subject}
          t={t}
          setTweak={setTweak}
          onHome={() => setStage('intake')}
        />
      )}

      <TweaksPanel t={t} setTweak={setTweak} />
    </div>
  );
}
