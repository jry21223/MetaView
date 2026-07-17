import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CasesPage } from "./CasesPage";

const meta = {
  schemaVersion: "1.0",
  id: "math-derivative-tangent",
  slug: "derivative-tangent",
  title: "导数的几何意义：从割线到切线",
  summary: "用 y=x² 在 (1,1) 附近的割线变化，逐步靠近切线斜率。",
  domain: "math",
  topic: "导数的几何意义",
  prompt: "请讲解切线斜率。",
  learningGoal: "理解瞬时变化率。",
  keyConcepts: ["割线斜率", "切线斜率"],
  reviewStatus: "reviewed",
  visibility: "public",
  posterUrl: "/showcases/derivative-tangent/poster.webp",
  playbookUrl: "/showcases/derivative-tangent/playbook.json",
  directorUrl: "/showcases/derivative-tangent/director.json",
  evidence: { kind: "curated-preview", sourceCommit: "commit" },
  demonstratedCapabilities: ["playable"],
  availableActions: ["play", "regenerate"],
};

function installStaticFetch() {
  const calls: string[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    if (url === "/showcases/manifest.json") {
      return new Response(
        JSON.stringify({
          schemaVersion: "1.0",
          cases: [
            {
              id: meta.id,
              slug: meta.slug,
              metaUrl: "/showcases/derivative-tangent/meta.json",
              visibility: "public",
            },
          ],
        }),
        { status: 200 },
      );
    }
    if (url === "/showcases/derivative-tangent/meta.json") {
      return new Response(JSON.stringify(meta), { status: 200 });
    }
    return new Response("not found", { status: 404 });
  });
  vi.stubGlobal("fetch", fetchMock);
  return calls;
}

describe("CasesPage", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("loads only public static manifest/meta resources and presents evidence honestly", async () => {
    const calls = installStaticFetch();
    const { getByRole, getByText } = render(
      <MemoryRouter initialEntries={["/cases"]}>
        <CasesPage />
      </MemoryRouter>,
    );

    await waitFor(() => expect(getByRole("heading", { name: meta.title })).toBeTruthy());
    expect(getByRole("heading", { name: "精选案例" })).toBeTruthy();
    expect(getByText("精选预览")).toBeTruthy();
    expect(getByText("可播放预览")).toBeTruthy();
    expect(calls).toEqual([
      "/showcases/manifest.json",
      "/showcases/derivative-tangent/meta.json",
    ]);
    expect(calls.some((url) => url.includes("/api/") || /account|pipeline|runs|followups/.test(url))).toBe(false);
  });

  it("shows a truthful poster fallback when the static image cannot load", async () => {
    installStaticFetch();
    const { container, getByAltText, getByText } = render(
      <MemoryRouter initialEntries={["/cases"]}>
        <CasesPage />
      </MemoryRouter>,
    );
    await waitFor(() => expect(getByAltText("导数的几何意义：从割线到切线画布预览")).toBeTruthy());
    fireEvent.error(getByAltText("导数的几何意义：从割线到切线画布预览"));
    expect(getByText("画布预览")).toBeTruthy();
    expect(container.textContent).not.toContain("录制验证");
    expect(container.textContent).not.toContain("实时验证");
  });

  it("fails safely when the manifest is malformed", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ cases: [{ slug: "../secret" }] }), { status: 200 })),
    );
    const { getByRole } = render(
      <MemoryRouter initialEntries={["/cases"]}>
        <CasesPage />
      </MemoryRouter>,
    );
    await waitFor(() => expect(getByRole("alert")).toBeTruthy());
    expect(getByRole("alert").textContent).toContain("案例目录");
  });
});
