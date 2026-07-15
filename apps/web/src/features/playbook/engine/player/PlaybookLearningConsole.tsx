import React from "react";

import type { CodeHighlightOverlay, PlaybookScript } from "../types";
import { CodeHighlightRenderer } from "../renderers/CodeHighlightRenderer";
import type { ScriptOverrides } from "./useResolvedScript";
import { ParamPanelSlot } from "./ParamPanelSlot";

interface PlaybookLearningConsoleProps {
  showCodePanelSlot: boolean;
  codeOverlay: CodeHighlightOverlay | null;
  theme: "dark" | "light";
  hasDomainPanel: boolean;
  baseScript: PlaybookScript;
  overrides: ScriptOverrides;
  onOverridesChange: (next: ScriptOverrides) => void;
  interactionSlot?: React.ReactNode;
  followupSlot?: React.ReactNode;
  relatedSlot?: React.ReactNode;
  relatedAlgorithmId?: string | null;
}

export function PlaybookLearningConsole({
  showCodePanelSlot,
  codeOverlay,
  theme,
  hasDomainPanel,
  baseScript,
  overrides,
  onOverridesChange,
  interactionSlot,
  followupSlot,
  relatedSlot,
  relatedAlgorithmId,
}: PlaybookLearningConsoleProps) {
  return (
    <aside className="playbook-player__console" aria-label="Learning console">
      {showCodePanelSlot && (
        <section className="playbook-player__console-card playbook-player__code-card">
          <div className="playbook-player__console-head">
            <span>Code Sync</span>
            <small>{codeOverlay?.language ?? "source"}</small>
          </div>
          <div className="playbook-player__code-body">
            {codeOverlay ? (
              <CodeHighlightRenderer overlay={codeOverlay} theme={theme} />
            ) : (
              <div className="playbook-player__code-empty">
                <span>{"</>"}</span>
                <p>Code highlights will sync here.</p>
              </div>
            )}
          </div>
        </section>
      )}

      {(interactionSlot || hasDomainPanel) && (
        <section className="playbook-player__console-card playbook-player__params-card">
          <div className="playbook-player__console-head">
            <span>{interactionSlot ? "Explore" : "Params"}</span>
            <small>{interactionSlot ? "Experimental" : baseScript.domain}</small>
          </div>
          <div className="playbook-player__param-body">
            {interactionSlot}
            {hasDomainPanel && (
              <ParamPanelSlot
                domain={baseScript.domain}
                script={baseScript}
                overrides={overrides}
                onOverridesChange={onOverridesChange}
                isDark={theme === "dark"}
              />
            )}
          </div>
        </section>
      )}

      {followupSlot && (
        <section className="playbook-player__console-card playbook-player__follow-card">
          <div className="playbook-player__console-head">
            <span>Follow-up</span>
            <small>current step</small>
          </div>
          <div className="playbook-player__follow-body">{followupSlot}</div>
        </section>
      )}

      {relatedSlot ? (
        <section className="playbook-player__related-card" aria-label="Related study context">
          {relatedSlot}
        </section>
      ) : (
        <section className="playbook-player__related-row" aria-label="Related study context">
          <span>Related</span>
          <strong>{relatedAlgorithmId ?? "Study variants"}</strong>
          <small>›</small>
        </section>
      )}
    </aside>
  );
}
