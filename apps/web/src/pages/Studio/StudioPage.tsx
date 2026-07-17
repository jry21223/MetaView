import React, { useEffect, useMemo, useRef, useState } from "react";
import { TweakValues } from "../../features/studio-editor/hooks/useTweaks";
import { usePipelinePoller } from "../../features/pipeline/hooks/usePipelinePoller";
import { PlaybookPlayer } from "../../features/playbook/engine/player/PlaybookPlayer";
import type { Stage } from "../../shared/ui/GlobalTopbar";
import type { ProviderSettings } from "../../features/providers/hooks/useProviderSettings";
import type {
  DirectorScript,
  PlaybookScript,
} from "../../features/playbook/engine/types";
import { ExportModal } from "../../features/export/ui/ExportModal";
import { PipelineErrorCard } from "../../features/pipeline/ui/PipelineErrorCard";
import { PipelineSkeleton } from "../../features/pipeline/ui/PipelineSkeleton";
import { createAssetAttributionReportForScript } from "../../features/playbook/engine/assets/assetAttributionSummary";
import {
  applyRunInteractionVersion,
  InteractionVersionRequestError,
  listRunFollowUps,
  restoreRunVersion,
  submitRunFollowUp,
  type RunVersionRecord,
} from "../../features/followups/api/followupApi";
import { FollowupCommitLog } from "../../features/followups/ui/FollowupCommitLog";
import type {
  InteractionEvent,
  InteractionFollowUpContext,
} from "../../features/playbook/interaction/types";

// ── Domain mapping ────────────────────────────────────────────────────────

const DOMAIN_SUGGESTIONS: Record<string, string[]> = {
  algorithm: ["下一步会访问谁？", "当前不变量是什么？", "为什么这样更新状态？"],
  math: ["你能指出关键量吗？", "这一步用了哪个性质？", "先说说几何意义"],
  physics: ["这一步用了哪个定律？", "力应该怎样分解？", "单位说明了什么？"],
  code: ["下一行会改变什么？", "当前变量值是多少？", "返回值从哪里来？"],
  chemistry: ["守恒量是什么？", "转换因子是哪一个？", "哪一步决定比例？"],
  biology: ["这一格怎么填？", "性状由什么决定？", "下一阶段变了什么？"],
  geography: ["主要驱动力是什么？", "风向为什么改变？", "这个区域有何差异？"],
};

const FALLBACK_SUGGESTIONS = ["先抓哪个关键点？", "这一步为什么必要？", "我来复述一遍"];

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
    versionId?: string | null,
  ) => void;
  activeVersionId?: string | null;
  children: (slots: {
    followupSlot: React.ReactNode;
    relatedSlot: React.ReactNode;
    onExplainInteraction?: (context: InteractionFollowUpContext) => Promise<void>;
    onApplyInteractionVersion?: (events: InteractionEvent[]) => Promise<void>;
    interactionActionPending: boolean;
    interactionSessionKey: string;
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
  activeVersionId = null,
  children,
}: ChatPanelProps) {
  const [msgs, setMsgs] = useState<ChatMessage[]>([]);
  const [versions, setVersions] = useState<RunVersionRecord[]>([]);
  const [headVersionId, setHeadVersionId] = useState<string | null | undefined>(undefined);
  const [historyReady, setHistoryReady] = useState(false);
  const [interactionEpoch, setInteractionEpoch] = useState(0);
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
    setHeadVersionId(undefined);
    setHistoryReady(false);
    setInteractionEpoch(0);
    setPending(false);
    if (!runId) return;
    const controller = new AbortController();
    abortRef.current = controller;
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
        setHeadVersionId(data.versions.find((version) => version.is_head)?.version_id ?? null);
        setHistoryReady(true);
      })
      .catch((err) => {
        if ((err as Error).name !== "AbortError") {
          setMsgs([{ from: "ai", text: formatChatError(err), error: true }]);
          setHistoryReady(true);
        }
      })
      .finally(() => {
        if (abortRef.current === controller) abortRef.current = null;
      });
    return () => {
      controller.abort();
      if (abortRef.current === controller) abortRef.current = null;
    };
  }, [runId]);

  const domain = playbook?.domain ?? "";
  const suggestions = DOMAIN_SUGGESTIONS[domain] ?? FALLBACK_SUGGESTIONS;
  const canModify = !!runId && !!playbook;

  const send = async (
    text?: string,
    interactionContext?: InteractionFollowUpContext,
  ) => {
    const userText = (text ?? input).trim();
    if (!userText || pending || !canModify || !historyReady) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const nextMsgs: ChatMessage[] = [...msgs, { from: "user", text: userText }];
      setMsgs([...nextMsgs, { from: "ai", text: "回复中…", pending: true }]);
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
        controller.signal,
        activeVersionId,
        interactionContext,
      );
      if (result.kind === "patch" && result.playbook) {
        onPlaybookPatched(result.playbook, result.director, result.version_id);
        setHeadVersionId(result.version_id);
        setInteractionEpoch((current) => current + 1);
      }
      setMsgs([
        ...nextMsgs,
        {
          from: "ai",
          text: result.reply.trim() || "已更新当前 Playbook。",
          changeSummary: result.change_summary,
          versionId: result.version_id,
        },
      ]);
      if (result.kind === "patch") {
        try {
          const data = await listRunFollowUps(runId!, controller.signal);
          setVersions(data.versions);
          setHeadVersionId(
            data.versions.find((version) => version.is_head)?.version_id
              ?? result.version_id,
          );
        } catch (historyError) {
          if ((historyError as Error).name === "AbortError") throw historyError;
        }
      }
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      setMsgs([
        ...nextMsgs,
        { from: "ai", text: formatChatError(err), error: true },
      ]);
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
        setPending(false);
      }
    }
  };

  const restore = async (versionId: string) => {
    if (!runId || pending) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setPending(true);
    try {
      const result = await restoreRunVersion(runId, versionId, controller.signal);
      onPlaybookPatched(result.playbook, result.director, result.version_id);
      setHeadVersionId(result.version_id);
      setInteractionEpoch((current) => current + 1);
      setMsgs((current) => [
        ...current,
        {
          from: "ai",
          text: "已切换到选中的历史版本。",
          versionId: result.version_id,
        },
      ]);
      try {
        const data = await listRunFollowUps(runId, controller.signal);
        setVersions(data.versions);
        setHeadVersionId(
          data.versions.find((version) => version.is_head)?.version_id ?? result.version_id,
        );
      } catch (historyError) {
        if ((historyError as Error).name === "AbortError") throw historyError;
        setMsgs((current) => [
          ...current,
          {
            from: "ai",
            text: "版本已恢复，但版本列表暂时无法刷新。",
            error: true,
          },
        ]);
      }
    } catch (err) {
      if ((err as Error).name === "AbortError") throw err;
      setMsgs((current) => [
        ...current,
        { from: "ai", text: formatChatError(err), error: true },
      ]);
      throw err;
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
        setPending(false);
      }
    }
  };

  const shouldCollapseEmptyProvider =
    appEdition === "self" && !isProviderConfigured && msgs.length === 0;

  const followupSlot = shouldCollapseEmptyProvider ? (
    <div className="mv-followup-compact">
      <span>配置本地 Provider 后可继续追问和调整当前讲解。</span>
      {onOpenProviderSettings && (
        <button
          type="button"
          className="mv-chip mv-chip-primary"
          onClick={onOpenProviderSettings}
        >
          配置本地 Provider
        </button>
      )}
    </div>
  ) : (
    <div className="mv-followup-panel">
      <div className="mv-chat-stream" ref={scrollRef}>
        {msgs.length === 0 && !historyReady && (
          <div style={{ fontSize: 12, color: "var(--ink-3)" }}>
            正在加载对话与版本记录…
          </div>
        )}
        {msgs.length === 0 && historyReady && !isProviderConfigured && (
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
              可以继续提问，也可以要求调整当前讲解；未配置本地 Provider 时将使用服务器模型。
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
        {msgs.length === 0 && historyReady && isProviderConfigured && canModify && (
          <div style={{ fontSize: 12, color: "var(--ink-3)" }}>
            可以继续提问，也可以要求调整当前讲解。
          </div>
        )}
        {msgs.length === 0 && historyReady && !canModify && (
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
            disabled={pending || !canModify || !historyReady}
          >
            {s}
          </button>
        ))}
      </div>

      <div className="mv-chat-input-wrap">
        <textarea
          rows={1}
          className="mv-chat-input"
          placeholder={
            !historyReady ? "正在加载记录" : canModify ? "还有什么想问的" : "等待真实任务"
          }
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          disabled={!canModify || !historyReady}
        />
        <div className="mv-chat-actions">
          <div className="mv-spacer" />
          <button
            className="mv-send"
            onClick={() => send()}
            disabled={pending || !input.trim() || !canModify || !historyReady}
          >
            {pending ? "回复中…" : "发送 ↵"}
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

  const onExplainInteraction = canModify && historyReady
    ? (context: InteractionFollowUpContext) => send("请解释我刚才的操作", context)
    : undefined;

  const onApplyInteractionVersion = canModify && headVersionId !== undefined
    ? async (events: InteractionEvent[]) => {
      if (pending || events.length === 0) return;
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setPending(true);
      try {
        const result = await applyRunInteractionVersion(
          runId!,
          events,
          headVersionId,
          controller.signal,
        );
        onPlaybookPatched(result.playbook, result.director);
        setHeadVersionId(result.version_id);
        setInteractionEpoch((current) => current + 1);
        setMsgs((current) => [
          ...current,
          {
            from: "ai",
            text: `已将沙盒操作应用为新版本（${result.version_id.slice(0, 8)}）。`,
            changeSummary: result.summary,
            versionId: result.version_id,
          },
        ]);
        try {
          const data = await listRunFollowUps(runId!, controller.signal);
          setVersions(data.versions);
          setHeadVersionId(
            data.versions.find((version) => version.is_head)?.version_id
              ?? result.version_id,
          );
        } catch (err) {
          if ((err as Error).name === "AbortError") throw err;
          setMsgs((current) => [
            ...current,
            {
              from: "ai",
              text: "新版本已保存，但版本列表暂时无法刷新。",
              error: true,
            },
          ]);
        }
      } catch (err) {
        if ((err as Error).name === "AbortError") throw err;
        if (err instanceof InteractionVersionRequestError && err.status === 409) {
          setHeadVersionId(undefined);
          try {
            const history = await listRunFollowUps(runId!, controller.signal);
            setVersions(history.versions);
            setHeadVersionId(
              history.versions.find((version) => version.is_head)?.version_id ?? null,
            );
            setMsgs((current) => [
              ...current,
              {
                from: "ai",
                text: `（版本冲突：${err.message}。已同步最新版本基线，请再次应用当前沙盒操作。）`,
                error: true,
              },
            ]);
            throw new Error("已同步最新版本基线，请再次应用当前沙盒操作。");
          } catch (refreshError) {
            if ((refreshError as Error).name === "AbortError") throw refreshError;
            if (
              refreshError instanceof Error &&
              refreshError.message === "已加载最新版本，请重新执行沙盒操作。"
            ) {
              throw refreshError;
            }
            setMsgs((current) => [
              ...current,
              {
                from: "ai",
                text: `（版本冲突：${err.message}。请刷新页面后重新操作。）`,
                error: true,
              },
            ]);
            throw new Error("版本冲突，请刷新页面后重新操作。");
          }
        }
        setMsgs((current) => [
          ...current,
          { from: "ai", text: formatChatError(err), error: true },
        ]);
        throw err;
      } finally {
        if (abortRef.current === controller) {
          abortRef.current = null;
          setPending(false);
        }
      }
    }
    : undefined;

  return <>{children({
    followupSlot,
    relatedSlot,
    onExplainInteraction,
    onApplyInteractionVersion,
    interactionActionPending: pending,
    interactionSessionKey: `${runId ?? "no-run"}:${interactionEpoch}`,
  })}</>;
}

// ── StudioPage ────────────────────────────────────────────────────────────

export interface StudioPageProps {
  appEdition?: "self" | "ops";
  runId: string | null;
  t: TweakValues;
  onNavigate: (stage: Stage) => void;
  isProviderConfigured: boolean;
  providerSettings?: ProviderSettings | null;
  onOpenProviderSettings?: () => void;
  /** Resubmit the failed run's prompt as a brand-new run. */
  onResubmitPrompt?: (prompt: string) => void;
  /** Return to intake with the failed run's prompt prefilled. */
  onEditPrompt?: (prompt: string) => void;
  topbarCollapsed?: boolean;
  onToggleTopbar?: () => void;
}

export function StudioPage({
  appEdition = "self",
  runId,
  t,
  onNavigate,
  isProviderConfigured,
  providerSettings = null,
  onOpenProviderSettings,
  onResubmitPrompt,
  onEditPrompt,
  topbarCollapsed = false,
  onToggleTopbar,
}: StudioPageProps) {
  const isDark = t.theme === "dark";
  const {
    playbook,
    director,
    error,
    errorKind,
    prompt,
    createdAt,
    isLoading,
    status,
    retry,
  } = usePipelinePoller(runId);

  const [exportOpen, setExportOpen] = useState(false);
  const [patchedPlaybook, setPatchedPlaybook] = useState<{
    runId: string;
    playbook: PlaybookScript;
    director?: DirectorScript | null;
    versionId?: string | null;
  } | null>(null);
  const activePatchedRun =
    patchedPlaybook?.runId === runId ? patchedPlaybook : null;
  const activePlaybook = activePatchedRun?.playbook ?? playbook;
  const activeDirector = activePatchedRun
    ? (activePatchedRun.director ?? null)
    : director;
  const activeVersionId = activePatchedRun?.versionId ?? null;
  const hasUnpersistedPreview =
    activePatchedRun !== null && activePatchedRun.versionId == null;
  const canExport = !!playbook && !!runId;
  const exportAssetReport = useMemo(
    () => (activePlaybook ? createAssetAttributionReportForScript(activePlaybook) : null),
    [activePlaybook],
  );

  const handleBackToIntake = () => {
    if (prompt && onEditPrompt) {
      onEditPrompt(prompt);
      return;
    }
    onNavigate("intake");
  };

  return (
    <>
      {exportOpen && (
        <ExportModal
          runId={runId}
          versionId={activeVersionId}
          hasUnpersistedPreview={hasUnpersistedPreview}
          isDark={isDark}
          previewTitle={
            activePlaybook?.steps?.[0]?.title ?? activePlaybook?.title ?? null
          }
          accentColor={t.accent}
          assetReport={exportAssetReport}
          onClose={() => setExportOpen(false)}
        />
      )}
      <main className="mv-main mv-main--player">
        <section className="mv-right">
          {error && errorKind ? (
            <PipelineErrorCard
              errorKind={errorKind}
              message={error}
              onRetryPolling={retry}
              onResubmit={
                errorKind === "run_failed" && prompt && onResubmitPrompt
                  ? () => onResubmitPrompt(prompt)
                  : null
              }
              onBackToIntake={handleBackToIntake}
            />
          ) : activePlaybook ? (
            <ChatPanel
              appEdition={appEdition}
              runId={runId}
              playbook={activePlaybook}
              isProviderConfigured={isProviderConfigured}
              providerSettings={providerSettings}
              onOpenProviderSettings={onOpenProviderSettings}
              activeVersionId={activeVersionId}
              onPlaybookPatched={(next, nextDirector, versionId) => {
                if (runId) {
                  setPatchedPlaybook({
                    runId,
                    playbook: next,
                    director: nextDirector ?? null,
                    versionId: versionId ?? null,
                  });
                }
              }}
            >
              {({
                followupSlot,
                relatedSlot,
                onExplainInteraction,
                onApplyInteractionVersion,
                interactionActionPending,
                interactionSessionKey,
              }) => (
                <PlaybookPlayer
                  script={activePlaybook}
                  director={activeDirector}
                  theme={isDark ? "dark" : "light"}
                  enableInteractionSandbox
                  onExplainInteraction={onExplainInteraction}
                  onApplyInteractionVersion={onApplyInteractionVersion}
                  interactionActionPending={interactionActionPending}
                  interactionSessionKey={interactionSessionKey}
                  swapDurationFrames={t.swapFrames}
                  onOpenExport={canExport ? () => setExportOpen(true) : undefined}
                  topbarCollapsed={topbarCollapsed}
                  onToggleTopbar={onToggleTopbar}
                  followupSlot={followupSlot}
                  relatedSlot={relatedSlot}
                />
              )}
            </ChatPanel>
          ) : isLoading ? (
            <PipelineSkeleton status={status} createdAt={createdAt} />
          ) : (
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
          )}
        </section>
      </main>
    </>
  );
}
