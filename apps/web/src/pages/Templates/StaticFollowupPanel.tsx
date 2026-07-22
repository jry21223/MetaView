import { useState } from "react";
import type { ConicFollowupCommand } from "../../features/playbook/interaction/types";
import type { TemplatePreviewQuestion } from "./templatePreviewCases";

export function StaticFollowupPanel({
  questions,
  onApplyOperation,
}: {
  questions: TemplatePreviewQuestion[];
  onApplyOperation?: (operation: ConicFollowupCommand) => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = questions.find((question) => question.id === selectedId) ?? null;

  return (
    <div className="mv-static-followup">
      <div className="mv-static-followup__stream" aria-live="polite">
        {selected ? (
          <>
            <div className="mv-static-followup__message is-user">{selected.question}</div>
            <div className="mv-static-followup__message is-assistant">{selected.answer}</div>
          </>
        ) : (
          <p>可以继续追问，也可以要求调整当前讲解。</p>
        )}
      </div>
      <div className="mv-static-followup__questions">
        {questions.map((item) => (
          <button
            type="button"
            key={item.id}
            aria-pressed={selectedId === item.id}
            onClick={() => {
              setSelectedId(item.id);
              if (item.operation) onApplyOperation?.(item.operation);
            }}
          >
            {item.question}
          </button>
        ))}
      </div>
      <div className="mv-static-followup__input-row">
        <input
          type="text"
          aria-label="继续追问"
          placeholder="还有什么想问的"
          readOnly
          title="模板案例仅支持上方固定问题"
        />
        <button type="button" disabled aria-label="发送追问">发送 ↵</button>
      </div>
      <small>所有调整都在当前案例本地完成，不会调用模型或消耗额度。</small>
    </div>
  );
}
