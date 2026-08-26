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
  parameterSlot?: React.ReactNode;
  interactionSlot?: React.ReactNode;
  followupSlot?: React.ReactNode;
  relatedSlot?: React.ReactNode;
}

export function PlaybookLearningConsole({
  showCodePanelSlot,
  codeOverlay,
  theme,
  hasDomainPanel,
  baseScript,
  overrides,
  onOverridesChange,
  parameterSlot,
  interactionSlot,
  followupSlot,
  relatedSlot,
}: PlaybookLearningConsoleProps) {
  return (
    <aside className="playbook-player__console" aria-label="学习台">
      {showCodePanelSlot && (
        <section className="playbook-player__console-card playbook-player__code-card">
          <div className="playbook-player__console-head">
            <span>代码同步</span>
            <small>{codeOverlay?.language ?? "源码"}</small>
          </div>
          <div className="playbook-player__code-body">
            {codeOverlay ? (
              <CodeHighlightRenderer
                overlay={codeOverlay}
                theme={theme}
                showLanguageHeader={false}
              />
            ) : (
              <div className="playbook-player__code-empty">
                <span>{"</>"}</span>
                <p>代码高亮会在这里同步。</p>
              </div>
            )}
          </div>
        </section>
      )}

      {(parameterSlot || interactionSlot || hasDomainPanel) && (
        <section className="playbook-player__console-card playbook-player__params-card">
          <div className="playbook-player__console-head">
            <span>{interactionSlot && !parameterSlot ? "探索" : "参数"}</span>
            {interactionSlot && !parameterSlot && <small>实验</small>}
          </div>
          <div className="playbook-player__param-body">
            {parameterSlot}
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
            <span>追问</span>
            <small>当前步骤</small>
          </div>
          <div className="playbook-player__follow-body">{followupSlot}</div>
        </section>
      )}

      {relatedSlot && (
        <section className="playbook-player__related-card" aria-label="相关内容">
          {relatedSlot}
        </section>
      )}
    </aside>
  );
}
