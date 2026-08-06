import { act, cleanup, fireEvent, render, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LandingPage } from "./LandingPage";

/** Controllable matchMedia stub: queries remember their listeners and can be
 *  flipped by the test, which fires the same "change" events the browser
 *  would. Defaults mirror happy-dom's real viewport (desktop, no reduce). */
function installMatchMediaMock() {
  const states = new Map<
    string,
    { matches: boolean; listeners: Set<(event: MediaQueryListEvent) => void> }
  >();
  const getState = (query: string) => {
    let state = states.get(query);
    if (!state) {
      state = {
        matches:
          query === "(prefers-reduced-motion: reduce)"
            ? false
            : query === "(min-width: 901px)"
              ? true
              : false,
        listeners: new Set(),
      };
      states.set(query, state);
    }
    return state;
  };

  vi.stubGlobal(
    "matchMedia",
    (query: string): MediaQueryList => {
      const state = getState(query);
      return {
        get matches() {
          return state.matches;
        },
        media: query,
        onchange: null,
        addEventListener: (
          type: string,
          listener: (event: MediaQueryListEvent) => void,
        ) => {
          if (type === "change") state.listeners.add(listener);
        },
        removeEventListener: (
          type: string,
          listener: (event: MediaQueryListEvent) => void,
        ) => {
          if (type === "change") state.listeners.delete(listener);
        },
        addListener: (listener: (event: MediaQueryListEvent) => void) => {
          state.listeners.add(listener);
        },
        removeListener: (listener: (event: MediaQueryListEvent) => void) => {
          state.listeners.delete(listener);
        },
        dispatchEvent: () => true,
      } as unknown as MediaQueryList;
    },
  );

  return {
    setMatches(query: string, matches: boolean) {
      const state = getState(query);
      state.matches = matches;
      for (const listener of state.listeners) {
        listener({ matches, media: query } as MediaQueryListEvent);
      }
    },
  };
}

function renderLanding() {
  const props = {
    appEdition: "self" as const,
    isDark: false,
    onToggleTheme: vi.fn(),
    onStart: vi.fn(),
    onOpenTemplates: vi.fn(),
  };

  return { ...render(<LandingPage {...props} />), props };
}

describe("LandingPage", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("presents the real product workflow and routes primary actions to creation", () => {
    const { getByRole, getByText, props } = renderLanding();

    expect(getByRole("heading", { level: 1 }).textContent).toContain("MetaView");
    expect(getByRole("heading", { level: 1 }).textContent).toContain(
      "把一道题，变成一段看得见的理解过程。",
    );
    expect(getByText("LessonPlan")).toBeTruthy();
    expect(getByText("PlaybookScript")).toBeTruthy();
    expect(getByText("DirectorScript")).toBeTruthy();
    expect(getByText("RenderPlan")).toBeTruthy();

    fireEvent.click(getByRole("button", { name: /开始生成/ }));
    fireEvent.click(getByRole("button", { name: "切换主题" }));
    fireEvent.click(getByRole("button", { name: "模板" }));

    expect(props.onStart).toHaveBeenCalledTimes(1);
    expect(props.onToggleTheme).toHaveBeenCalledTimes(1);
    expect(props.onOpenTemplates).toHaveBeenCalledTimes(1);
  });

  it("orders the landing narrative as visual, follow-up, workflow, then director", () => {
    const { container, getByRole } = renderLanding();
    const sectionIds = Array.from(
      container.querySelectorAll<HTMLElement>("#landing-main > section[id]"),
    ).map((section) => section.id);
    const primaryNav = getByRole("navigation", { name: "首页导航" });

    expect(sectionIds).toEqual(["visuals", "followup", "workflow", "director"]);
    expect(
      within(primaryNav)
        .getAllByRole("link")
        .map((link) => link.textContent),
    ).toEqual(["画面能力", "继续追问", "工作原理", "导演层"]);
    expect(getByRole("link", { name: "看它如何工作" }).getAttribute("href")).toBe("#visuals");
    expect(
      sectionIds.map(
        (sectionId) =>
          container.querySelector<HTMLElement>(`#${sectionId} .mv-landing-kicker`)?.textContent,
      ),
    ).toEqual([
      "VISUAL SYSTEM / 01",
      "FOLLOW-UP / 02",
      "WORKFLOW / 03",
      "DIRECTOR LAYER / 04",
    ]);
  });

  it("switches the learning canvas between supported subject examples", () => {
    const { container, getByRole, getByText } = renderLanding();

    const stage = container.querySelector<HTMLElement>(
      ".mv-landing-capability .mv-lesson-stage",
    );
    const mathLayer = stage?.querySelector<HTMLElement>("[data-scene-domain='math']");
    const physicsLayer = stage?.querySelector<HTMLElement>("[data-scene-domain='physics']");

    expect(stage?.querySelectorAll(".mv-lesson-scene-layer")).toHaveLength(3);
    expect(mathLayer?.classList.contains("is-active")).toBe(true);

    const physicsTab = getByRole("tab", { name: /物理/ });
    fireEvent.click(physicsTab);

    expect(physicsTab.getAttribute("aria-selected")).toBe("true");
    expect(getByRole("tablist", { name: "学科画面示例" }).getAttribute("data-active-domain")).toBe(
      "physics",
    );
    expect(getByText("抛体运动分解")).toBeTruthy();
    expect(getByText("水平速度保持不变，竖直速度持续受到重力改变。")).toBeTruthy();
    expect(stage?.getAttribute("data-active-domain")).toBe("physics");
    expect(physicsLayer?.classList.contains("is-active")).toBe(true);
    expect(mathLayer?.classList.contains("is-active")).toBe(false);
    expect(stage?.querySelector("[data-scene-domain='physics']")).toBe(physicsLayer);
  });

  it("describes the math canvas as the custom curve it actually renders", () => {
    const { container } = renderLanding();
    const mathLayer = container.querySelector<HTMLElement>("[data-scene-domain='math']");
    const mathSvg = mathLayer?.querySelector("svg");
    const tangent = mathLayer?.querySelector<SVGPathElement>(".mv-scene-tangent");
    const focus = mathLayer?.querySelector<SVGCircleElement>(".mv-scene-focus");

    expect(within(mathLayer as HTMLElement).getByText("f(x) = B(x)")).toBeTruthy();
    expect(within(mathLayer as HTMLElement).getByText("f′(1) ≈ 1.83")).toBeTruthy();
    expect(within(mathLayer as HTMLElement).getByText("P(1, B(1))")).toBeTruthy();
    expect(mathLayer?.textContent).not.toContain("f(x) = x²");
    expect(mathSvg?.getAttribute("aria-label")).toBe("自定义 Bézier 曲线与切线示意图");

    const tangentCoordinates = tangent
      ?.getAttribute("d")
      ?.match(/^M([\d.]+) ([\d.]+)L([\d.]+) ([\d.]+)$/)
      ?.slice(1)
      .map(Number);
    expect(tangentCoordinates).toHaveLength(4);

    const [x1, y1, x2, y2] = tangentCoordinates as [number, number, number, number];
    const focusX = Number(focus?.getAttribute("cx"));
    const focusY = Number(focus?.getAttribute("cy"));
    const slope = (y2 - y1) / (x2 - x1);
    const tangentYAtFocus = y1 + slope * (focusX - x1);

    expect(slope).toBeCloseTo(-1.1324, 3);
    expect(tangentYAtFocus).toBeCloseTo(focusY, 2);
  });

  it("encodes binary-search values by bar height while keeping range state explicit", () => {
    const { container, getByRole } = renderLanding();

    fireEvent.click(getByRole("tab", { name: /算法/ }));

    const bars = Array.from(
      container.querySelectorAll<SVGRectElement>(".mv-algorithm-bar rect"),
    );
    const heights = bars.map((bar) => Number(bar.getAttribute("height")));

    expect(heights).toHaveLength(8);
    expect(heights.every((height, index) => index === 0 || height > heights[index - 1])).toBe(
      true,
    );
    expect(container.querySelectorAll(".mv-algorithm-bar.is-discarded")).toHaveLength(4);
    expect(container.querySelectorAll(".mv-algorithm-bar.is-mid")).toHaveLength(1);
    expect(container.querySelector(".mv-lesson-code strong")?.textContent).toContain(
      "left = mid + 1",
    );
  });

  it("freezes a scene at its final state when its domain is re-activated", () => {
    const { container, getByRole } = renderLanding();

    const curve = () =>
      container.querySelector<SVGPathElement>(
        ".mv-landing-capability [data-scene-domain='math'] .mv-scene-curve--animated",
      );
    const analysis = () =>
      container.querySelector<SVGElement>(
        ".mv-landing-capability [data-scene-domain='math'] .mv-scene-analysis",
      );

    // First activation animates: no inline freeze styles.
    expect(curve()?.getAttribute("style")).toBeNull();
    expect(analysis()?.getAttribute("style")).toBeNull();

    fireEvent.click(getByRole("tab", { name: /物理/ }));
    fireEvent.click(getByRole("tab", { name: /数学/ }));

    // Re-activation after the domain already played: inline styles pin the
    // scene at its drawn state so the CSS animation cannot replay.
    expect(curve()?.getAttribute("style")).toContain("animation: none");
    expect(curve()?.getAttribute("style")).toContain("stroke-dashoffset");
    expect(analysis()?.getAttribute("style")).toContain("animation: none");
  });

  it("announces follow-up completion via a dedicated live region", () => {
    const { setMatches } = installMatchMediaMock();
    const { container } = renderLanding();

    // The thread stack itself is no longer a live region: the visible typing
    // text is aria-hidden, so a dedicated visually-hidden status element
    // carries the announcement for the active thread instead.
    const threadStack = container.querySelector<HTMLElement>(
      ".mv-landing-followup-demo__thread-stack",
    );
    expect(threadStack?.hasAttribute("aria-live")).toBe(false);

    const status = container.querySelector<HTMLElement>(
      ".mv-landing-followup-demo__thread.is-active [role='status']",
    );
    expect(status?.classList.contains("mv-landing-visually-hidden")).toBe(
      true,
    );
    expect(status?.textContent?.trim()).toBe("");

    // The versions row is a labelled group, not an unnamed div.
    expect(
      container
        .querySelector(".mv-landing-followup-demo__versions")
        ?.getAttribute("role"),
    ).toBe("group");

    // When the reply completes, the status region carries the announcement.
    act(() => setMatches("(prefers-reduced-motion: reduce)", true));
    expect(status?.textContent).toContain("TEXT REPLY");
  });

  it("aligns the story rail when an article button receives focus", () => {
    const scrollTo = vi.fn();
    vi.stubGlobal("scrollTo", scrollTo);
    const { container } = renderLanding();

    const physicsButton = container.querySelector<HTMLElement>(
      "[data-demo-domain='physics'] button",
    );
    fireEvent.focus(physicsButton as HTMLElement);

    // Focus activates the panel and scrolls the page to the rail position
    // where it is fully visible.
    expect(
      container
        .querySelector("[data-demo-domain='physics']")
        ?.classList.contains("is-active"),
    ).toBe(true);
    expect(scrollTo).toHaveBeenCalledWith(
      expect.objectContaining({ behavior: "smooth", top: expect.any(Number) }),
    );
  });

  it("supports the ARIA tabs keyboard pattern on both tablists", () => {
    const { container, getByRole } = renderLanding();
    const demoTablist = getByRole("tablist", { name: "学科画面示例" });
    const followupTablist = getByRole("tablist", { name: "追问方式" });
    const demoStage = container.querySelector<HTMLElement>(
      ".mv-landing-capability .mv-lesson-stage",
    );
    const threadStack = container.querySelector<HTMLElement>(
      ".mv-landing-followup-demo__thread-stack",
    );

    // Panels are wired to their tablists via id / aria-controls pairs.
    expect(demoStage?.getAttribute("role")).toBe("tabpanel");
    expect(demoStage?.getAttribute("aria-labelledby")).toBe(
      "landing-demo-tab-math",
    );
    expect(threadStack?.getAttribute("role")).toBe("tabpanel");
    expect(threadStack?.getAttribute("aria-labelledby")).toBe(
      "landing-followup-tab-explain",
    );

    const mathTab = getByRole("tab", { name: /数学/ });
    const physicsTab = getByRole("tab", { name: /物理/ });
    const algorithmTab = getByRole("tab", { name: /算法/ });
    expect(mathTab.getAttribute("aria-controls")).toBe("landing-demo-panel");
    expect(physicsTab.getAttribute("aria-controls")).toBe("landing-demo-panel");

    // Roving tabindex: only the active tab is in the tab order.
    expect(mathTab.tabIndex).toBe(0);
    expect(physicsTab.tabIndex).toBe(-1);
    expect(algorithmTab.tabIndex).toBe(-1);

    // ArrowRight moves focus and activates the next tab.
    fireEvent.keyDown(demoTablist, { key: "ArrowRight" });
    expect(physicsTab.getAttribute("aria-selected")).toBe("true");
    expect(physicsTab.tabIndex).toBe(0);
    expect(mathTab.tabIndex).toBe(-1);
    expect(document.activeElement).toBe(physicsTab);
    expect(demoStage?.getAttribute("aria-labelledby")).toBe(
      "landing-demo-tab-physics",
    );

    // ArrowLeft moves back; Home / End jump to the first / last tab.
    fireEvent.keyDown(demoTablist, { key: "ArrowLeft" });
    expect(mathTab.getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(mathTab);

    fireEvent.keyDown(demoTablist, { key: "End" });
    expect(algorithmTab.getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(algorithmTab);
    fireEvent.keyDown(demoTablist, { key: "Home" });
    expect(mathTab.getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(mathTab);

    // The follow-up tablist uses the same pattern, with wrap-around.
    const explainTab = getByRole("tab", { name: "解释这一步" });
    const reviseTab = getByRole("tab", { name: "调整讲解" });
    expect(explainTab.getAttribute("aria-controls")).toBe(
      "landing-followup-panel",
    );
    expect(explainTab.tabIndex).toBe(0);
    expect(reviseTab.tabIndex).toBe(-1);

    fireEvent.keyDown(followupTablist, { key: "ArrowRight" });
    expect(reviseTab.getAttribute("aria-selected")).toBe("true");
    expect(reviseTab.tabIndex).toBe(0);
    expect(document.activeElement).toBe(reviseTab);
    expect(threadStack?.getAttribute("aria-labelledby")).toBe(
      "landing-followup-tab-revise",
    );

    fireEvent.keyDown(followupTablist, { key: "ArrowRight" });
    expect(explainTab.getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(explainTab);
  });

  it("reacts live to prefers-reduced-motion changes in the follow-up demo", () => {
    const { setMatches } = installMatchMediaMock();
    const { container } = renderLanding();

    const activeSummary = () =>
      container.querySelector<HTMLElement>(
        ".mv-landing-followup-demo__thread.is-active .mv-landing-followup-demo__message.is-ai small",
      );

    // Motion enabled: the reply has not finished typing yet.
    expect(activeSummary()?.classList.contains("is-visible")).toBe(false);

    // Flip to reduced motion mid-session: the thread jumps to the complete
    // state (full reply) and the animation loop stops.
    act(() => setMatches("(prefers-reduced-motion: reduce)", true));
    expect(activeSummary()?.classList.contains("is-visible")).toBe(true);

    // Flip back: the animation restarts from the beginning.
    act(() => setMatches("(prefers-reduced-motion: reduce)", false));
    expect(activeSummary()?.classList.contains("is-visible")).toBe(false);
  });

  it("shows follow-up as contextual replies and reversible lesson revisions", () => {
    const { container, getByRole, getByText, props } = renderLanding();
    const followupFrame = container.querySelector(".mv-landing-followup-demo");

    expect(getByText("哪里没看懂，就从那一步继续问。")).toBeTruthy();
    expect(followupFrame?.querySelector(":scope > .mv-landing-followup-demo__head")).toBeTruthy();
    expect(followupFrame?.querySelector(":scope > .mv-landing-followup-demo__modes")).toBeTruthy();
    expect(
      followupFrame?.querySelector(
        ":scope > .mv-landing-followup-demo__viewport > .mv-landing-followup-demo__camera",
      ),
    ).toBeTruthy();
    expect(
      followupFrame?.querySelectorAll("[data-camera-target='prompt'], [data-camera-target='response']"),
    ).toHaveLength(4);
    expect(getByRole("tab", { name: "解释这一步" }).getAttribute("aria-selected")).toBe(
      "true",
    );
    expect(
      container.querySelector(".mv-landing-followup-demo__thread.is-active")?.textContent,
    ).toContain("回答当前疑问，不改动讲解");

    fireEvent.click(getByRole("tab", { name: "调整讲解" }));

    const activeThread = container.querySelector(".mv-landing-followup-demo__thread.is-active");
    expect(activeThread?.textContent).toContain("NEW VERSION");
    expect(activeThread?.textContent).toContain("v2");
    expect(activeThread?.textContent).toContain("可恢复");

    fireEvent.click(getByRole("button", { name: /用自己的题目试一次/ }));
    expect(props.onStart).toHaveBeenCalledTimes(1);
  });
});
