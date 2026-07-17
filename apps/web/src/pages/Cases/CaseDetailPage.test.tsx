import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CaseDetailPage } from "./CaseDetailPage";

vi.mock("../../features/showcases/ui/ShowcasePlayer", () => ({
  ShowcasePlayer: () => <div data-testid="showcase-player">静态播放器</div>,
}));

const meta = {
  schemaVersion: "1.0",
  id: "math-derivative-tangent",
  slug: "derivative-tangent",
  title: "导数的几何意义：从割线到切线",
  summary: "用 y=x² 在 (1,1) 附近的割线变化，逐步靠近切线斜率。",
  domain: "math",
  topic: "导数的几何意义",
  prompt: "请讲解 y=x² 在点 (1,1) 处的切线斜率。",
  learningGoal: "理解瞬时变化率。",
  keyConcepts: ["割线斜率", "切线斜率"],
  reviewStatus: "reviewed",
  visibility: "public",
  posterUrl: "/showcases/derivative-tangent/poster.webp",
  playbookUrl: "/showcases/derivative-tangent/playbook.json",
  directorUrl: "/showcases/derivative-tangent/director.json",
  lessonSummaryUrl: "/showcases/derivative-tangent/lesson-summary.json",
  qualitySummaryUrl: "/showcases/derivative-tangent/quality-summary.json",
  benchmarkSummaryUrl: "/showcases/derivative-tangent/benchmark-summary.json",
  evidence: { kind: "curated-preview", sourceCommit: "commit" },
  demonstratedCapabilities: ["playable"],
  availableActions: ["play", "regenerate"],
};

const playbook = {
  fps: 30,
  total_frames: 60,
  domain: "math",
  title: "Derivative",
  summary: "A lesson",
  steps: [],
  parameter_controls: [],
};

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location-probe">{JSON.stringify(location.state)}</output>;
}

function installStaticFetch(options: { includeCase?: boolean } = {}) {
  const calls: string[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    if (url === "/showcases/manifest.json") {
      return new Response(
        JSON.stringify({
          schemaVersion: "1.0",
          cases: options.includeCase === false
            ? []
            : [{ id: meta.id, slug: meta.slug, metaUrl: "/showcases/derivative-tangent/meta.json", visibility: "public" }],
        }),
        { status: 200 },
      );
    }
    if (url === "/showcases/derivative-tangent/meta.json") return new Response(JSON.stringify(meta));
    if (url.endsWith("/playbook.json")) return new Response(JSON.stringify(playbook));
    if (url.endsWith("/director.json")) return new Response("null");
    if (url.endsWith("/lesson-summary.json")) {
      return new Response(JSON.stringify({ title: "教学摘要", body: "逐步逼近切线。", points: ["割线", "切线"] }));
    }
    if (url.endsWith("/quality-summary.json")) {
      return new Response(JSON.stringify({ title: "质量说明", body: "静态预览。", points: [] }));
    }
    if (url.endsWith("/benchmark-summary.json")) {
      return new Response(JSON.stringify({ title: "验证状态", body: "尚未线上验证。", points: [] }));
    }
    return new Response("not found", { status: 404 });
  });
  vi.stubGlobal("fetch", fetchMock);
  return calls;
}

describe("CaseDetailPage", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("renders static playback and sends only the same prompt to /create", async () => {
    const calls = installStaticFetch();
    const { getByRole, getByTestId, getByText } = render(
      <MemoryRouter initialEntries={["/cases/derivative-tangent"]}>
        <Routes>
          <Route path="/cases/:slug" element={<CaseDetailPage />} />
          <Route path="/create" element={null} />
        </Routes>
        <LocationProbe />
      </MemoryRouter>,
    );
    await waitFor(() => expect(getByRole("heading", { name: meta.title })).toBeTruthy());
    expect(getByTestId("showcase-player")).toBeTruthy();
    expect(getByText("静态案例 · 不会创建运行任务")).toBeTruthy();
    expect(getByText("精选预览")).toBeTruthy();

    fireEvent.click(getByRole("link", { name: "用同题生成" }));
    await waitFor(() => expect(getByTestId("location-probe").textContent).toContain(meta.prompt));
    expect(getByTestId("location-probe").textContent).not.toContain("domain");
    expect(getByTestId("location-probe").textContent).not.toContain("auto");
    expect(calls.every((url) => url.startsWith("/showcases/"))).toBe(true);
  });

  it("renders a safe 404 for an unknown slug", async () => {
    installStaticFetch({ includeCase: false });
    const { getByRole } = render(
      <MemoryRouter initialEntries={["/cases/no-such-case"]}>
        <Routes>
          <Route path="/cases/:slug" element={<CaseDetailPage />} />
        </Routes>
      </MemoryRouter>,
    );
    await waitFor(() => expect(getByRole("heading", { name: "没有找到这个案例" })).toBeTruthy());
    expect(getByRole("link", { name: "返回精选案例" })).toBeTruthy();
  });
});
