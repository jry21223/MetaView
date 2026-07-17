import { useState } from "react";
import type { TemplatePreviewQuestion } from "./templatePreviewCases";

export function StaticFollowupPanel({ questions }: { questions: TemplatePreviewQuestion[] }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = questions.find((question) => question.id === selectedId) ?? null;

  return (
    <div className="mv-static-followup">
      <p>选择一个与当前步骤相关的问题：</p>
      <div className="mv-static-followup__questions">
        {questions.map((item) => (
          <button
            type="button"
            key={item.id}
            aria-pressed={selectedId === item.id}
            onClick={() => setSelectedId(item.id)}
          >
            {item.question}
          </button>
        ))}
      </div>
      {selected ? (
        <div className="mv-static-followup__answer" role="status" aria-live="polite">
          <strong>{selected.question}</strong>
          <p>{selected.answer}</p>
        </div>
      ) : (
        <small>答案已随案例固定，不会调用模型或消耗额度。</small>
      )}
    </div>
  );
}
