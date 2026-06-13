import React, { useEffect, useMemo, useRef, useState } from "react";
import { TweakValues } from "../../features/studio-editor/hooks/useTweaks";
import { usePipelinePoller } from "../../features/pipeline/hooks/usePipelinePoller";
import { PlaybookPlayer } from "../../features/playbook/engine/player/PlaybookPlayer";
import { GlobalTopbar, Stage } from "../../shared/ui/GlobalTopbar";
import type { ProviderSettings } from "../../features/providers/hooks/useProviderSettings";
import type {
  DirectorScript,
  PlaybookScript,
} from "../../features/playbook/engine/types";
import { ExportModal } from "../../features/export/ui/ExportModal";
import {
  listRunFollowUps,
  restoreRunVersion,
  submitRunFollowUp,
  type RunVersionRecord,
} from "../../features/followups/api/followupApi";
import { FollowupCommitLog } from "../../features/followups/ui/FollowupCommitLog";

// ── Domain mapping ────────────────────────────────────────────────────────

const DOMAIN_SUGGESTIONS: Record<string, string[]> = {
  algorithm: ["换一组数据", "为什么这个复杂度", "对比其他方法"],
  math: ["改变初始条件", "几何意义", "推导过程"],
  physics: ["改变参数", "加上其他力", "受力分析"],
  code: ["解释这段逻辑", "更好的写法", "边界情况"],
  chemistry: ["换反应物", "反应机理", "平衡条件"],
  biology: ["详细解释步骤", "实际应用", "相关知识点"],
  geography: ["原因分析", "影响因素", "对比其他地区"],
};

const FALLBACK_SUGGESTIONS = ["换个角度讲", "展开第一步", "总结要点"];

type WorkbenchNavIconKind = "home" | "history" | "templates" | "settings";

function WorkbenchNavIcon({ kind }: { kind: WorkbenchNavIconKind }) {
  if (kind === "home") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
        <path d="M4 10.5 12 4l8 6.5V20H5v-7" />
      </svg>
    );
  }
  if (kind === "history") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
        <path d="M12 8v5l3 2" />
        <path d="M4 12a8 8 0 1 0 2.4-5.7" />
        <path d="M4 4v5h5" />
      </svg>
    );
  }
  if (kind === "templates") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
        <path d="M5 4h6v6H5z" />
        <path d="M13 4h6v6h-6z" />
        <path d="M5 14h6v6H5z" />
        <path d="M13 14h6v6h-6z" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <path d="M12 15.5A3.5 3.5 0 1 0 12 8a3.5 3.5 0 0 0 0 7.5Z" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2 3.4-.2-.1a1.7 1.7 0 0 0-2 .1 1.7 1.7 0 0 0-.9 1.7v.2H10v-.2a1.7 1.7 0 0 0-.9-1.7 1.7 1.7 0 0 0-2-.1l-.2.1-2-3.4.1-.1A1.7 1.7 0 0 0 5.3 15a1.7 1.7 0 0 0-1.4-1.1h-.2v-3.8h.2A1.7 1.7 0 0 0 5.3 9a1.7 1.7 0 0 0-.3-1.9L4.9 7l2-3.4.2.1a1.7 1.7 0 0 0 2-.1A1.7 1.7 0 0 0 10 1.9v-.2h4.7v.2a1.7 1.7 0 0 0 .9 1.7 1.7 1.7 0 0 0 2 .1l.2-.1 2 3.4-.1.1A1.7 1.7 0 0 0 19.4 9a1.7 1.7 0 0 0 1.4 1.1h.2v3.8h-.2A1.7 1.7 0 0 0 19.4 15Z" />
    </svg>
  );
}

// ── ChatPanel ─────────────────────────────────────────────────────────────

interface ChatMessage {
  from: "user" | "ai";
  text: string;
  changeSummary?: string;
  versionId?: string | null;
  pending?: boolean;
  error?: boolean;
}

interface ChatPanelProps {
  appEdition: "self" | "ops";
  runId: string | null;
  playbook: PlaybookScript | null;
  isProviderConfigured: boolean;
  providerSettings?: ProviderSettings | null;
  onOpenProviderSettings?: () => void;
  onPlaybookPatched: (
    playbook: PlaybookScript,
    director?: DirectorScript | null,
  ) => void;
  children: (slots: {
    followupSlot: React.ReactNode;
    relatedSlot: React.ReactNode;
  }) => React.ReactNode;
}

function formatChatError(err: unknown): string {
  if (err instanceof Error) {
    return `（请求失败：${err.message}）`;
  }
  return "（接口暂时不可用，稍后再试）";
}

function ChatPanel({
  appEdition,
  runId,
  playbook,
  isProviderConfigured,
  providerSettings,
  onOpenProviderSettings,
  onPlaybookPatched,
  children,
}: ChatPanelProps) {
  const [msgs, setMsgs] = useState<ChatMessage[]>([]);
  const [versions, setVersions] = useState<RunVersionRecord[]>([]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (scrollRef.current)
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [msgs]);

  useEffect(() => () => abortRef.current?.abort(), []);

  useEffect(() => {
    abortRef.current?.abort();
    setMsgs([]);
    setVersions([]);
    if (!runId) return;
    const controller = new AbortController();
    listRunFollowUps(runId, controller.signal)
      .then((data) => {
        const loaded: ChatMessage[] = data.followups.flatMap((item) => [
          { from: "user" as const, text: item.user_message },
          {
            from: "ai" as const,
            text: item.assistant_reply,
            changeSummary: item.change_summary,
            versionId: item.version_id,
          },
        ]);
        setMsgs(loaded);
        setVersions(data.versions);
      })
      .catch((err) => {
        if ((err as Error).name !== "AbortError") {
          setMsgs([{ from: "ai", text: formatChatError(err), error: true }]);
        }
      });
    return () => controller.abort();
  }, [runId]);

  const domain = playbook?.domain ?? "";
  const suggestions = DOMAIN_SUGGESTIONS[domain] ?? FALLBACK_SUGGESTIONS;
  const canModify = !!runId && !!playbook;

  const send = async (text?: string) => {
    const userText = (text ?? input).trim();
    if (!userText || pending || !canModify) return;

    abortRef.current?.abort();
    abortRef.current = new AbortController();

    const nextMsgs: ChatMessage[] = [...msgs, { from: "user", text: userText }];
    setMsgs([...nextMsgs, { from: "ai", text: "思考中…", pending: true }]);
    setInput("");
    setPending(true);

    try {
      const history = msgs
        .filter((m) => !m.pending && !m.error)
        .slice(-12)
        .map((m) => ({
          role: (m.from === "user" ? "user" : "assistant") as
            | "user"
            | "assistant",
          content: m.text,
        }));
      const provider =
        appEdition === "self" && providerSettings?.apiKey.trim().length
          ? providerSettings
          : undefined;
      const result = await submitRunFollowUp(
        runId!,
        userText,
        history,
        provider,
        abortRef.current.signal,
      );
      onPlaybookPatched(result.playbook, result.director);
      setMsgs([
        ...nextMsgs,
        {
          from: "ai",
          text: result.reply.trim() || "已更新当前 Playbook。",
          changeSummary: result.change_summary,
          versionId: result.version_id,
        },
      ]);
      listRunFollowUps(runId!, abortRef.current.signal)
        .then((data) => setVersions(data.versions))
        .catch(() => undefined);
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      setMsgs([
        ...nextMsgs,
        { from: "ai", text: formatChatError(err), error: true },
      ]);
    } finally {
      setPending(false);
    }
  };

  const restore = async (versionId: string) => {
    if (!runId || pending) return;
    const target = versions.find((version) => version.version_id === versionId);
    setPending(true);
    try {
      const result = await restoreRunVersion(runId, versionId);
      onPlaybookPatched(result.playbook, result.director);
      setMsgs((current) => [
        ...current,
        {
          from: "ai",
          text: "已恢复到选中的历史版本。",
          changeSummary: `revert: restore ${target?.short_id ?? versionId.slice(0, 8)}`,
          versionId: result.version_id,
        },
      ]);
      listRunFollowUps(runId)
        .then((data) => setVersions(data.versions))
        .catch(() => undefined);
    } catch (err) {
      setMsgs((current) => [
        ...current,
        { from: "ai", text: formatChatError(err), error: true },
      ]);
    } finally {
      setPending(false);
    }
  };

  const followupSlot = (
    <div className="mv-followup-panel">
      <div className="mv-chat-stream" ref={scrollRef}>
        {msgs.length === 0 && !isProviderConfigured && (
          <div
            style={{
              fontSize: 12,
              color: "var(--ink-3)",
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            <span>
              可以基于当前题目继续修改；未配置本地 Provider 时将使用服务器模型。
            </span>
            {appEdition === "self" && onOpenProviderSettings && (
              <button
                className="mv-chip mv-chip-primary"
                onClick={onOpenProviderSettings}
                style={{ alignSelf: "flex-start" }}
              >
                配置本地 Provider →
              </button>
            )}
          </div>
        )}
        {msgs.length === 0 && isProviderConfigured && canModify && (
          <div style={{ fontSize: 12, color: "var(--ink-3)" }}>
            可以让 MetaView 在当前基础上修改步骤、讲解或画面。
          </div>
        )}
        {msgs.length === 0 && !canModify && (
          <div style={{ fontSize: 12, color: "var(--ink-3)" }}>
            需要真实生成任务后才能保存修改版本。
          </div>
        )}
        {msgs.map((m, i) => (
          <div
            key={i}
            className={`mv-msg mv-msg-${m.from}${m.pending ? " is-pending" : ""}`}
          >
            <div className="mv-msg-meta">
              <span>{m.from === "user" ? "你" : "MetaView"}</span>
            </div>
            <div
              className="mv-msg-bubble"
              style={m.error ? { color: "var(--ink-3)" } : undefined}
            >
              {m.text}
            </div>
            {m.changeSummary && (
              <div className="mv-change-summary">
                <span>{m.changeSummary}</span>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="mv-suggestions">
        {suggestions.map((s) => (
          <button
            key={s}
            className="mv-suggestion"
            onClick={() => send(s)}
            disabled={pending || !canModify}
          >
            {s}
          </button>
        ))}
      </div>

      <div className="mv-chat-input-wrap">
        <textarea
          rows={1}
          className="mv-chat-input"
          placeholder={canModify ? "描述你想怎样修改当前讲解…" : "等待真实任务"}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          disabled={!canModify}
        />
        <div className="mv-chat-actions">
          <div className="mv-spacer" />
          <button
            className="mv-send"
            onClick={() => send()}
            disabled={pending || !input.trim() || !canModify}
          >
            {pending ? "生成中…" : "发送 ↵"}
          </button>
        </div>
      </div>
    </div>
  );
  const relatedSlot =
    versions.length > 0 ? (
      <FollowupCommitLog
        versions={versions}
        pending={pending}
        canModify={canModify}
        onRestore={restore}
      />
    ) : null;

  return <>{children({ followupSlot, relatedSlot })}</>;
}

// ── PipelineSkeleton ──────────────────────────────────────────────────────

type PipelineStatus =
  | "queued"
  | "running"
  | "reviewing"
  | "succeeded"
  | "failed"
  | null;

interface PipelineSkeletonProps {
  status: PipelineStatus;
}

const STAGES: { key: PipelineStatus; label: string }[] = [
  { key: "queued", label: "排队中" },
  { key: "running", label: "脚本生成" },
  { key: "reviewing", label: "审核与修正" },
  { key: "succeeded", label: "渲染完成" },
];

const STATUS_ORDER: Record<NonNullable<PipelineStatus>, number> = {
  queued: 0,
  running: 1,
  reviewing: 2,
  succeeded: 3,
  failed: 3,
};

const STATUS_LOADER_LABEL: Record<NonNullable<PipelineStatus>, string> = {
  queued: "排队等待生成",
  running: "正在生成脚本",
  reviewing: "正在审核与修正",
  succeeded: "渲染完成",
  failed: "生成失败",
};

function PipelineSkeleton({ status }: PipelineSkeletonProps) {
  const currentOrder = status !== null ? STATUS_ORDER[status] : -1;
  const loaderLabel =
    status !== null ? STATUS_LOADER_LABEL[status] : "正在准备生成";

  return (
    <div className="mv-pipeline-skeleton">
      <div className="mv-pipeline-stages">
        {STAGES.map((stage, i) => {
          const stageOrder = STATUS_ORDER[stage.key!]!;
          const isDone = currentOrder > stageOrder;
          const isActive = currentOrder === stageOrder;
          return (
            <React.Fragment key={stage.key}>
              <div
                className={`mv-stage${isActive ? " is-active" : isDone ? " is-done" : ""}`}
              >
                <span className="mv-stage-dot" />
                <span>{stage.label}</span>
              </div>
              {i < STAGES.length - 1 && <div className="mv-stage-line" />}
            </React.Fragment>
          );
        })}
      </div>

      <div className="mv-skeleton-area">
        <div className="mv-pipeline-status" role="status" aria-live="polite">
          {loaderLabel}
        </div>
        <div className="mv-skeleton-bar mv-skeleton-title" />
        <div className="mv-skeleton-cells">
          {Array.from({ length: 8 }, (_, i) => (
            <div
              key={i}
              className="mv-skeleton-bar mv-skeleton-cell"
              style={{ animationDelay: `${i * 0.1}s` }}
            />
          ))}
        </div>
        <div className="mv-skeleton-bar mv-skeleton-narration" />
        <div className="mv-skeleton-bar mv-skeleton-narration-short" />
      </div>
    </div>
  );
}

// ── StudioPage ────────────────────────────────────────────────────────────

export interface StudioPageProps {
  appEdition?: "self" | "ops";
  runId: string | null;
  t: TweakValues;
  setTweak: (
    key: keyof TweakValues,
    value: TweakValues[keyof TweakValues],
  ) => void;
  onNavigate: (stage: Stage) => void;
  isProviderConfigured: boolean;
  providerSettings?: ProviderSettings | null;
  accountBalanceYuan?: string | null;
  accountName?: string | null;
  accountAvatarUrl?: string | null;
  onOpenProviderSettings?: () => void;
}

export function StudioPage({
  appEdition = "self",
  runId,
  t,
  setTweak,
  onNavigate,
  isProviderConfigured,
  providerSettings = null,
  accountBalanceYuan = null,
  accountName = null,
  accountAvatarUrl = null,
  onOpenProviderSettings,
}: StudioPageProps) {
  const isDark = t.theme === "dark";
  const { playbook, director, error, isLoading, status } =
    usePipelinePoller(runId);

  const [exportOpen, setExportOpen] = useState(false);
  const [patchedPlaybook, setPatchedPlaybook] = useState<{
    runId: string;
    playbook: PlaybookScript;
    director?: DirectorScript | null;
  } | null>(null);
  const activePatchedRun =
    patchedPlaybook?.runId === runId ? patchedPlaybook : null;
  const activePlaybook = activePatchedRun?.playbook ?? playbook;
  const activeDirector = activePatchedRun
    ? (activePatchedRun.director ?? null)
    : director;
  const canExport = !!playbook && !!runId;
  const workbenchNavItems = useMemo(
    () => [
      {
        id: "home",
        label: "首页",
        active: true,
        icon: <WorkbenchNavIcon kind="home" />,
        onSelect: () => onNavigate("intake"),
      },
      {
        id: "history",
        label: "任务历史",
        icon: <WorkbenchNavIcon kind="history" />,
        onSelect: () => onNavigate("history"),
      },
      {
        id: "templates",
        label: "模板",
        icon: <WorkbenchNavIcon kind="templates" />,
        onSelect: () => onNavigate("templates"),
      },
      {
        id: "settings",
        label: "设置",
        icon: <WorkbenchNavIcon kind="settings" />,
        onSelect: () => onNavigate("settings"),
      },
    ],
    [onNavigate],
  );

  useEffect(() => {
    if (error) onNavigate("intake");
  }, [error, onNavigate]);

  return (
    <>
      <GlobalTopbar
        stage="workbench"
        appEdition={appEdition}
        isProviderConfigured={isProviderConfigured}
        accountBalanceYuan={accountBalanceYuan}
        accountName={accountName}
        accountAvatarUrl={accountAvatarUrl}
        onNavigate={onNavigate}
        isDark={isDark}
        onToggleTheme={() => setTweak("theme", isDark ? "light" : "dark")}
        onOpenProviderSettings={onOpenProviderSettings}
        onOpenExport={canExport ? () => setExportOpen(true) : undefined}
        exportEnabled={canExport}
        hidePrimaryNav
      />
      {exportOpen && (
        <ExportModal
          runId={runId}
          isDark={isDark}
          previewTitle={
            activePlaybook?.steps?.[0]?.title ?? activePlaybook?.title ?? null
          }
          accentColor={t.accent}
          onClose={() => setExportOpen(false)}
        />
      )}
      <main className="mv-main mv-main--player">
        <section className="mv-right">
          {activePlaybook ? (
            <ChatPanel
              appEdition={appEdition}
              runId={runId}
              playbook={activePlaybook}
              isProviderConfigured={isProviderConfigured}
              providerSettings={providerSettings}
              onOpenProviderSettings={onOpenProviderSettings}
              onPlaybookPatched={(next, nextDirector) => {
                if (runId) {
                  setPatchedPlaybook({
                    runId,
                    playbook: next,
                    director: nextDirector ?? null,
                  });
                }
              }}
            >
              {({ followupSlot, relatedSlot }) => (
                <PlaybookPlayer
                  script={activePlaybook}
                  director={activeDirector}
                  theme={isDark ? "dark" : "light"}
                  swapDurationFrames={t.swapFrames}
                  onOpenExport={canExport ? () => setExportOpen(true) : undefined}
                  workbenchNavItems={workbenchNavItems}
                  followupSlot={followupSlot}
                  relatedSlot={relatedSlot}
                />
              )}
            </ChatPanel>
          ) : isLoading ? (
            <PipelineSkeleton status={status} />
          ) : !error ? (
            <div className="mv-right-placeholder">
              <span>暂无任务</span>
              <button
                className="mv-send"
                type="button"
                onClick={() => onNavigate("intake")}
              >
                先提交一个题目
              </button>
            </div>
          ) : null}
        </section>
      </main>
    </>
  );
}
