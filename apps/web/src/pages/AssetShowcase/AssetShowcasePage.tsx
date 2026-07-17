import { useMemo, useState } from "react";

import { PlaybookPlayer } from "../../features/playbook/engine/player/PlaybookPlayer";
import {
  listSubjectVisualShowcaseEntries,
  type SubjectVisualShowcaseEntry,
} from "../../features/playbook/engine/fixtures/subjectVisualShowcase";

const DOMAIN_LABELS: Record<string, string> = {
  algorithm: "算法",
  biology: "生物",
  chemistry: "化学",
  geography: "地理",
  math: "数学",
  physics: "物理",
};

export function AssetShowcasePage() {
  const entries = useMemo(() => listSubjectVisualShowcaseEntries(), []);
  const [selectedId, setSelectedId] = useState(entries[0]?.id ?? "");
  const selected = entries.find((entry) => entry.id === selectedId) ?? entries[0];

  if (!selected) {
    return (
      <main className="mv-root mv-light" style={{ minHeight: "100vh", display: "grid", placeItems: "center" }}>
        No subject visual fixtures
      </main>
    );
  }

  return (
    <main
      className="mv-root mv-light"
      style={{
        minHeight: "100vh",
        display: "grid",
        gridTemplateRows: "auto 1fr",
        background: "#f5f7fb",
        color: "#182235",
      }}
    >
      <header
        style={{
          borderBottom: "1px solid rgba(20,32,54,0.12)",
          padding: "18px 24px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 18,
        }}
      >
        <div>
          <div style={{ fontSize: 13, fontWeight: 760, color: "#0f76a8", textTransform: "uppercase" }}>
            MetaView asset showcase
          </div>
          <h1 style={{ margin: "4px 0 0", fontSize: 24, letterSpacing: 0 }}>Subject visual fixture matrix</h1>
        </div>
        <div style={{ fontSize: 13, color: "#64748b", textAlign: "right" }}>
          {entries.length} flagship fixtures
        </div>
      </header>

      <div style={{ display: "grid", gridTemplateColumns: "320px 1fr", minHeight: 0 }}>
        <aside
          style={{
            borderRight: "1px solid rgba(20,32,54,0.12)",
            padding: 18,
            overflow: "auto",
          }}
        >
          <div style={{ display: "grid", gap: 10 }}>
            {entries.map((entry) => (
              <ShowcaseButton
                key={entry.id}
                entry={entry}
                selected={entry.id === selected.id}
                onClick={() => setSelectedId(entry.id)}
              />
            ))}
          </div>
        </aside>

        <section style={{ minHeight: 0, display: "grid", gridTemplateRows: "auto 1fr" }}>
          <div
            style={{
              padding: "14px 18px",
              borderBottom: "1px solid rgba(20,32,54,0.12)",
              display: "grid",
              gridTemplateColumns: "1fr auto",
              alignItems: "center",
              gap: 18,
            }}
          >
            <div>
              <div style={{ fontSize: 20, fontWeight: 780 }}>{selected.title}</div>
              <div style={{ marginTop: 4, fontSize: 13, color: "#64748b" }}>{selected.summary}</div>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
              <span className="mv-chip">{selected.packId}</span>
              <span className="mv-chip">{selected.rendererKind}</span>
              {selected.showInlineCode ? <span className="mv-chip mv-chip-primary">code track</span> : null}
            </div>
          </div>

          <div style={{ minHeight: 0, padding: 18 }}>
            <div style={{ height: "100%", minHeight: 520 }}>
              <PlaybookPlayer
                script={selected.script}
                theme="light"
                showLearningConsole={true}
                layoutMode="desktop"
              />
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

function ShowcaseButton({
  entry,
  selected,
  onClick,
}: {
  entry: SubjectVisualShowcaseEntry;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        width: "100%",
        textAlign: "left",
        border: selected ? "1px solid #0f76a8" : "1px solid rgba(20,32,54,0.14)",
        borderRadius: 8,
        padding: 12,
        background: selected ? "#e7f5fb" : "#ffffff",
        color: "#182235",
        cursor: "pointer",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
        <span style={{ fontSize: 15, fontWeight: 760 }}>{entry.title}</span>
        <span style={{ fontSize: 12, color: "#0f76a8" }}>{DOMAIN_LABELS[entry.domain] ?? entry.domain}</span>
      </div>
      <div style={{ marginTop: 6, fontSize: 12, color: "#64748b" }}>{entry.id}</div>
      <div style={{ marginTop: 6, fontSize: 12, color: "#64748b" }}>{entry.packId}</div>
    </button>
  );
}
