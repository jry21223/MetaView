import React from "react";

import { CodeHighlightRenderer } from "../renderers/CodeHighlightRenderer";
import type { ClippedCodeOverlay } from "./mobileCodeOverlay";

export type MobileTabKey = "narration" | "code" | "params" | "followup" | "more";

const MOBILE_TABS: Array<{ key: MobileTabKey; label: string }> = [
  { key: "narration", label: "讲解" },
  { key: "code", label: "代码" },
  { key: "params", label: "参数" },
  { key: "followup", label: "追问" },
  { key: "more", label: "更多" },
];

interface MobileTabPanelProps {
  activeTab: MobileTabKey;
  currentNarration: string;
  currentStepTitle: string;
  safeStepIndex: number;
  stepCount: number;
  mobileCodeOverlay: ClippedCodeOverlay | null;
  theme: "dark" | "light";
  hasDomainPanel: boolean;
  paramsContent: React.ReactNode;
  onOpenSheet: (sheet: MobileTabKey) => void;
}

function MobileTabPanel({
  activeTab,
  currentNarration,
  currentStepTitle,
  safeStepIndex,
  stepCount,
  mobileCodeOverlay,
  theme,
  hasDomainPanel,
  paramsContent,
  onOpenSheet,
}: MobileTabPanelProps) {
  if (activeTab === "code") {
    return (
      <div className="playbook-player__mobile-panel playbook-player__mobile-code-panel">
        {mobileCodeOverlay ? (
          <>
            <div className="playbook-player__mobile-panel-head">
              <span>
                Lines {mobileCodeOverlay.fromLine}-{mobileCodeOverlay.toLine} / {mobileCodeOverlay.totalLines}
              </span>
              <button type="button" onClick={() => onOpenSheet("code")}>
                查看全部代码
              </button>
            </div>
            <div className="playbook-player__mobile-code-snippet">
              <CodeHighlightRenderer
                overlay={mobileCodeOverlay.overlay}
                theme={theme}
                lineNumberOffset={mobileCodeOverlay.lineNumberOffset}
              />
            </div>
          </>
        ) : (
          <div className="playbook-player__mobile-empty">当前步骤没有代码同步片段。</div>
        )}
      </div>
    );
  }

  if (activeTab === "params") {
    return (
      <div className="playbook-player__mobile-panel">
        {hasDomainPanel ? (
          <div className="playbook-player__mobile-param-panel">{paramsContent}</div>
        ) : (
          <div className="playbook-player__mobile-empty">当前步骤没有可调参数。</div>
        )}
      </div>
    );
  }

  if (activeTab === "followup") {
    return (
      <div className="playbook-player__mobile-panel">
        <button
          type="button"
          className="playbook-player__mobile-open-sheet"
          onClick={() => onOpenSheet("followup")}
        >
          打开追问面板
        </button>
      </div>
    );
  }

  if (activeTab === "more") {
    return (
      <div className="playbook-player__mobile-panel">
        <button
          type="button"
          className="playbook-player__mobile-open-sheet"
          onClick={() => onOpenSheet("more")}
        >
          打开更多操作
        </button>
      </div>
    );
  }

  return (
    <div className="playbook-player__mobile-panel playbook-player__mobile-narration">
      <span>步骤 {safeStepIndex + 1} / {stepCount}</span>
      <p>{currentNarration || currentStepTitle}</p>
    </div>
  );
}

interface PlaybookPortraitShellProps {
  domain: string;
  title: string;
  currentStepTitle: string;
  currentNarration: string;
  safeStepIndex: number;
  stepCount: number;
  theme: "dark" | "light";
  topbarAction?: React.ReactNode;
  exportAction?: React.ReactNode;
  moreAction?: React.ReactNode;
  stageSlot: React.ReactNode;
  controlsSlot: React.ReactNode;
  showMobileConsole: boolean;
  activeTab: MobileTabKey;
  onSelectTab: (tab: MobileTabKey) => void;
  onOpenSheet: (sheet: MobileTabKey) => void;
  mobileCodeOverlay: ClippedCodeOverlay | null;
  hasDomainPanel: boolean;
  paramsContent: React.ReactNode;
}

export function PlaybookPortraitShell({
  domain,
  title,
  currentStepTitle,
  currentNarration,
  safeStepIndex,
  stepCount,
  theme,
  topbarAction,
  exportAction,
  moreAction,
  stageSlot,
  controlsSlot,
  showMobileConsole,
  activeTab,
  onSelectTab,
  onOpenSheet,
  mobileCodeOverlay,
  hasDomainPanel,
  paramsContent,
}: PlaybookPortraitShellProps) {
  return (
    <div className="playbook-player__workspace">
      <header className="playbook-player__header">
        <div className="playbook-player__brand">
          <span className="playbook-player__brand-mark" aria-hidden="true" />
          <span>MetaView</span>
        </div>
        <div className="playbook-player__lesson-title">
          <span>{domain}</span>
          <strong>{title}</strong>
        </div>
        <div className="playbook-player__header-actions">
          {topbarAction}
          {exportAction}
          {moreAction}
        </div>
      </header>

      <div className="playbook-player__mobile-step">
        <span>步骤 {safeStepIndex + 1} / {stepCount}</span>
        <strong>{currentStepTitle}</strong>
      </div>

      {stageSlot}
      {controlsSlot}

      {showMobileConsole && (
        <section className="playbook-player__mobile-console" aria-label="移动学习面板">
          <div className="playbook-player__mobile-tabs" role="tablist" aria-label="移动学习面板">
            {MOBILE_TABS.map((tab) => (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={activeTab === tab.key}
                className={activeTab === tab.key ? "is-active" : ""}
                onClick={() => {
                  onSelectTab(tab.key);
                  if (tab.key === "followup" || tab.key === "more") {
                    onOpenSheet(tab.key);
                  }
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <MobileTabPanel
            activeTab={activeTab}
            currentNarration={currentNarration}
            currentStepTitle={currentStepTitle}
            safeStepIndex={safeStepIndex}
            stepCount={stepCount}
            mobileCodeOverlay={mobileCodeOverlay}
            theme={theme}
            hasDomainPanel={hasDomainPanel}
            paramsContent={paramsContent}
            onOpenSheet={onOpenSheet}
          />
        </section>
      )}
    </div>
  );
}
