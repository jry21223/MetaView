import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from "react";

import {
  type FollowupAnimationPhase,
  type FollowupAnimationState,
  type FollowupCameraShot,
  EMPTY_FOLLOWUP_ANIMATION,
  followupCompleteState,
  followupPhase,
  followupStateAt,
} from "./followupTimeline";
import { clampPanOffset, followupDesiredCenter } from "./cameraMath";
import {
  railActivatedIndex,
  railOffsetPercent,
  railProgressFromScroll,
  railTargetPosition,
} from "./railMath";

interface LandingPageProps {
  appEdition: "self" | "ops";
  isDark: boolean;
  onToggleTheme: () => void;
  onStart: () => void;
  onOpenTemplates: () => void;
}

type DemoDomain = "math" | "physics" | "algorithm";
type DemoRailPanel = "intro" | DemoDomain;
type FollowupDemoMode = "explain" | "revise";

interface DemoStory {
  id: DemoDomain;
  label: string;
  index: string;
  scene: string;
  frame: string;
  focus: string;
  title: string;
  description: string;
  subtitle: string;
}

const DEMO_STORIES: DemoStory[] = [
  {
    id: "math",
    label: "数学",
    index: "01",
    scene: "导数的几何意义",
    frame: "FRAME 120",
    focus: "切线斜率",
    title: "让公式落到坐标、切线与变化过程上。",
    description:
      "公式不是终点。画布会保留对象身份，用移动、聚焦和对照解释变化为何发生。",
    subtitle: "当 x 接近 1，切线斜率约为 1.83，表示这一点的瞬时变化率。",
  },
  {
    id: "physics",
    label: "物理",
    index: "02",
    scene: "抛体运动分解",
    frame: "FRAME 168",
    focus: "速度分量",
    title: "把受力、速度与轨迹放进同一个因果画面。",
    description:
      "矢量、轨迹和时间同步推进，学生看到的不只是答案，而是每一步如何影响下一步。",
    subtitle: "水平速度保持不变，竖直速度持续受到重力改变。",
  },
  {
    id: "algorithm",
    label: "算法",
    index: "03",
    scene: "二分查找",
    frame: "FRAME 214",
    focus: "区间收缩",
    title: "让指针、区间和代码行在同一时刻对齐。",
    description:
      "当前代码、变量状态与数组变化共享时间线，抽象控制流因此变成可追踪的过程。",
    subtitle: "目标大于中点值，左边界移动到 mid + 1。",
  },
];

const DEMO_RAIL_PANELS: DemoRailPanel[] = ["intro", ...DEMO_STORIES.map((story) => story.id)];

const PIPELINE_STEPS = [
  { index: "01", label: "理解题目", contract: "Coverage" },
  { index: "02", label: "规划教学", contract: "LessonPlan" },
  { index: "03", label: "构建画面", contract: "PlaybookScript" },
  { index: "04", label: "编排焦点", contract: "DirectorScript" },
  { index: "05", label: "播放导出", contract: "RenderPlan" },
] as const;

const FOLLOWUP_DEMOS = [
  {
    id: "explain",
    label: "解释这一步",
    prompt: "为什么目标值大于 24，就能排除左半区间？",
    response:
      "数组已经按升序排列。左半区间的值都不超过 24，而目标值是 46，所以它们不可能命中。",
    status: "TEXT REPLY",
    summary: "回答当前疑问，不改动讲解",
  },
  {
    id: "revise",
    label: "调整讲解",
    prompt: "把“排除左半区间”讲慢一点，并在画布上标出来。",
    response:
      "已拆成两个步骤：先对比 46 与 24，再淡出左半区间并移动 left 指针。",
    status: "NEW VERSION",
    summary: "强化区间排除的因果过程",
  },
] as const satisfies ReadonlyArray<{
  id: FollowupDemoMode;
  label: string;
  prompt: string;
  response: string;
  status: string;
  summary: string;
}>;

type FollowupDemo = (typeof FOLLOWUP_DEMOS)[number];

function shouldSkipFollowupMotion() {
  return (
    typeof window === "undefined" ||
    typeof window.requestAnimationFrame !== "function" ||
    typeof window.matchMedia !== "function" ||
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/** WAI-ARIA APG tabs keyboard pattern: arrows move focus and activate the
 *  adjacent tab (wrap-around), Home/End jump to the first/last tab. */
function handleTablistKeyDown<T extends string>(
  event: KeyboardEvent<HTMLDivElement>,
  options: {
    ids: readonly T[];
    activeId: T;
    tabId: (id: T) => string;
    onSelect: (id: T) => void;
  },
) {
  const index = options.ids.indexOf(options.activeId);
  if (index < 0) return;
  let nextIndex: number | null = null;
  switch (event.key) {
    case "ArrowRight":
    case "ArrowDown":
      nextIndex = (index + 1) % options.ids.length;
      break;
    case "ArrowLeft":
    case "ArrowUp":
      nextIndex = (index - 1 + options.ids.length) % options.ids.length;
      break;
    case "Home":
      nextIndex = 0;
      break;
    case "End":
      nextIndex = options.ids.length - 1;
      break;
    default:
      return;
  }
  event.preventDefault();
  const nextId = options.ids[nextIndex];
  options.onSelect(nextId);
  event.currentTarget
    .querySelector<HTMLElement>(`#${options.tabId(nextId)}`)
    ?.focus();
}

function numberFromCssVariable(
  element: HTMLElement,
  name: string,
  fallback: number,
) {
  const value = Number.parseFloat(
    getComputedStyle(element).getPropertyValue(name),
  );
  return Number.isFinite(value) ? value : fallback;
}

function offsetWithin(element: HTMLElement, ancestor: HTMLElement) {
  let node: HTMLElement | null = element;
  let x = 0;
  let y = 0;

  while (node && node !== ancestor) {
    x += node.offsetLeft;
    y += node.offsetTop;
    node = node.offsetParent as HTMLElement | null;
  }

  return node === ancestor ? { x, y } : null;
}

function setFollowupCameraShot(
  thread: HTMLDivElement,
  shot: FollowupCameraShot,
) {
  const camera = thread.closest<HTMLElement>(".mv-landing-followup-demo__camera");
  const viewport = thread.closest<HTMLElement>(
    ".mv-landing-followup-demo__viewport",
  );
  if (!camera || !viewport) return;

  if (shot === "wide") {
    const cameraOriginX =
      camera.clientWidth > 0 ? `${camera.clientWidth / 2}px` : "50%";
    const cameraOriginY =
      camera.clientHeight > 0 ? `${camera.clientHeight / 2}px` : "50%";
    camera.style.setProperty("--mv-followup-camera-x", "0px");
    camera.style.setProperty("--mv-followup-camera-y", "0px");
    camera.style.setProperty("--mv-followup-camera-origin-x", cameraOriginX);
    camera.style.setProperty("--mv-followup-camera-origin-y", cameraOriginY);
    camera.style.setProperty("--mv-followup-camera-scale", "1");
    return;
  }

  const target = thread.querySelector<HTMLElement>(`[data-camera-target="${shot}"]`);
  const targetOffset = target ? offsetWithin(target, camera) : null;
  if (!target || !targetOffset) return;
  if (viewport.clientWidth === 0 || viewport.clientHeight === 0) return;

  const targetCenterX = targetOffset.x + target.offsetWidth / 2;
  const targetCenterY = targetOffset.y + target.offsetHeight / 2;
  const scale = numberFromCssVariable(
    viewport,
    "--mv-followup-closeup-scale",
    1.075,
  );
  const maxPan = numberFromCssVariable(viewport, "--mv-followup-closeup-pan", 24);
  const desired = followupDesiredCenter(
    viewport.clientWidth,
    viewport.clientHeight,
    shot,
  );
  const panX = clampPanOffset(desired.x, targetCenterX, maxPan);
  const panY = clampPanOffset(desired.y, targetCenterY, maxPan);

  camera.style.setProperty("--mv-followup-camera-x", `${panX}px`);
  camera.style.setProperty("--mv-followup-camera-y", `${panY}px`);
  camera.style.setProperty("--mv-followup-camera-origin-x", `${targetCenterX}px`);
  camera.style.setProperty("--mv-followup-camera-origin-y", `${targetCenterY}px`);
  camera.style.setProperty("--mv-followup-camera-scale", `${scale}`);
}

function AnimatedFollowupThread({
  demo,
  isSelected,
  isPlaying,
}: {
  demo: FollowupDemo;
  isSelected: boolean;
  isPlaying: boolean;
}) {
  const [skipMotion, setSkipMotion] = useState(shouldSkipFollowupMotion);
  const [animation, setAnimation] = useState<FollowupAnimationState>(() =>
    skipMotion ? followupCompleteState(demo) : EMPTY_FOLLOWUP_ANIMATION,
  );
  const threadRef = useRef<HTMLDivElement | null>(null);

  // React live to OS reduced-motion changes mid-session: the rail effect
  // subscribes to the same query, so flipping the preference stops/resumes
  // the follow-up typing animation as well.
  useEffect(() => {
    if (
      typeof window === "undefined" ||
      typeof window.matchMedia !== "function"
    ) {
      return;
    }
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = (event: MediaQueryListEvent) => setSkipMotion(event.matches);
    query.addEventListener?.("change", onChange);
    return () => query.removeEventListener?.("change", onChange);
  }, []);

  // When the preference flips mid-animation: reduce → jump straight to the
  // complete state (the rAF loop below cancels itself via its skipMotion
  // dependency); back off → restart the animation from the beginning.
  // Guarded state adjustment during render (React's documented pattern for
  // syncing state to a prop) instead of a setState-in-effect.
  const [prevSkipMotion, setPrevSkipMotion] = useState(skipMotion);
  if (prevSkipMotion !== skipMotion) {
    setPrevSkipMotion(skipMotion);
    setAnimation(
      skipMotion ? followupCompleteState(demo) : EMPTY_FOLLOWUP_ANIMATION,
    );
  }

  useEffect(() => {
    if (!isSelected || !isPlaying || skipMotion) return;

    const startedAt = window.performance.now();
    let animationFrame: number | null = null;

    const animate = (timestamp: number) => {
      const nextState = followupStateAt(timestamp - startedAt, demo);

      setAnimation((current) =>
        current.prompt === nextState.prompt &&
        current.response === nextState.response &&
        current.cameraShot === nextState.cameraShot &&
        current.promptVisible === nextState.promptVisible &&
        current.promptTyping === nextState.promptTyping &&
        current.responseVisible === nextState.responseVisible &&
        current.responseTyping === nextState.responseTyping &&
        current.complete === nextState.complete
          ? current
          : nextState,
      );

      if (!nextState.complete) {
        animationFrame = window.requestAnimationFrame(animate);
      }
    };

    animationFrame = window.requestAnimationFrame(animate);
    return () => {
      if (animationFrame !== null) {
        window.cancelAnimationFrame(animationFrame);
      }
    };
  }, [demo, isPlaying, isSelected, skipMotion]);

  useLayoutEffect(() => {
    const thread = threadRef.current;
    if (!thread || !isSelected) return;

    const updateCamera = () =>
      setFollowupCameraShot(thread, animation.cameraShot);
    updateCamera();

    const viewport = thread.closest<HTMLElement>(
      ".mv-landing-followup-demo__viewport",
    );
    if (!viewport || typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver(updateCamera);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [animation.cameraShot, isSelected]);

  const animationPhase: FollowupAnimationPhase = followupPhase(animation);

  return (
    <div
      ref={threadRef}
      className={`mv-landing-followup-demo__thread${isSelected ? " is-active" : ""}`}
      data-animation-phase={animationPhase}
      data-camera-shot={animation.cameraShot}
      aria-hidden={!isSelected}
    >
      <div className="mv-landing-followup-demo__context">
        <span>CONTEXT</span>
        <p><i>target</i> 46 <b>›</b> <i>mid</i> 24</p>
        <small>当前搜索区间 · [24, 31, 46, 59]</small>
      </div>

      <div
        className={`mv-landing-followup-demo__message is-user${animation.promptVisible ? " is-visible" : ""}`}
        data-camera-target="prompt"
      >
        <span>你</span>
        <p>
          <span className="mv-landing-visually-hidden">{demo.prompt}</span>
          <span aria-hidden="true">{animation.prompt}</span>
          {animation.promptTyping && animation.prompt.length < demo.prompt.length && (
            <i className="mv-landing-type-cursor" aria-hidden="true" />
          )}
        </p>
      </div>
      <div
        className={`mv-landing-followup-demo__message is-ai${animation.responseVisible ? " is-visible" : ""}`}
        data-camera-target="response"
      >
        <span>MetaView</span>
        <p>
          <span className="mv-landing-visually-hidden">{demo.response}</span>
          <span aria-hidden="true">{animation.response}</span>
          {animation.responseTyping && animation.response.length < demo.response.length && (
            <i className="mv-landing-type-cursor" aria-hidden="true" />
          )}
        </p>
        <small
          className={
            animation.response.length >= demo.response.length ? "is-visible" : ""
          }
        >
          {demo.status} · {demo.summary}
        </small>
      </div>

      <div
        className={`mv-landing-followup-demo__versions${demo.id === "revise" ? " is-revised" : ""}${animation.complete ? " is-visible" : ""}`}
        aria-label={demo.id === "revise" ? "已从版本 v1 更新到 v2" : "当前保持版本 v1"}
      >
        <span><code>v1</code><small>{demo.id === "revise" ? "可恢复" : "HEAD"}</small></span>
        <i />
        <span><code>{demo.id === "revise" ? "v2" : "—"}</code><small>{demo.id === "revise" ? "HEAD" : "未创建新版本"}</small></span>
      </div>
    </div>
  );
}

function ArrowIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
      <path d="M5 12h14" />
      <path d="m13 6 6 6-6 6" />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
      <path d="m9 7 8 5-8 5Z" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
      <path d="M20.5 14.5A7.5 7.5 0 0 1 9.5 3.5 8 8 0 1 0 20.5 14.5Z" />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  );
}

// Inline styles that freeze a scene at its final drawn state so scroll-driven
// re-activation does not replay the path-draw / analysis-fade animations.
// TODO(css): once landing.css can be edited, replace these with a single rule:
//   .mv-lesson-scene-layer.has-played .mv-scene-curve--animated { animation: none; stroke-dashoffset: 0 }
//   .mv-lesson-scene-layer.has-played .mv-scene-analysis { animation: none; opacity: 1 }
//   .mv-lesson-scene-layer.has-played .mv-algorithm-bar rect { animation: none }
const PLAYED_CURVE_STYLE: CSSProperties = { animation: "none", strokeDashoffset: 0 };
const PLAYED_ANALYSIS_STYLE: CSSProperties = { animation: "none", opacity: 1 };
const PLAYED_ANIM_STYLE: CSSProperties = { animation: "none" };

function MathScene({ suppressReplay = false }: { suppressReplay?: boolean }) {
  return (
    <div className="mv-lesson-scene mv-lesson-scene--math">
      <div className="mv-lesson-formula">
        <span>f(x) = B(x)</span>
        <strong>f′(1) ≈ 1.83</strong>
      </div>
      <svg viewBox="0 0 640 360" role="img" aria-label="自定义 Bézier 曲线与切线示意图">
        <g className="mv-scene-grid">
          <path d="M72 54V310M136 54V310M200 54V310M264 54V310M328 54V310M392 54V310M456 54V310M520 54V310M584 54V310" />
          <path d="M72 54H584M72 118H584M72 182H584M72 246H584M72 310H584" />
        </g>
        <g className="mv-scene-axis">
          <path d="M72 278H592" />
          <path d="M136 318V46" />
        </g>
        <path
          className="mv-scene-curve mv-scene-curve--animated"
          d="M74 264C155 258 211 242 260 216C316 186 361 139 400 84C427 46 450 34 476 52C508 74 535 129 572 230"
          style={suppressReplay ? PLAYED_CURVE_STYLE : undefined}
        />
        <g
          className="mv-scene-analysis"
          style={suppressReplay ? PLAYED_ANALYSIS_STYLE : undefined}
        >
          <path className="mv-scene-tangent" d="M245 264.9L443 40.68" />
          <circle
            className="mv-scene-focus-ring"
            cx="361"
            cy="133.54"
            r="24"
            style={suppressReplay ? PLAYED_ANIM_STYLE : undefined}
          />
          <circle className="mv-scene-focus" cx="361" cy="133.54" r="8" />
          <path className="mv-scene-guide" d="M361 133.54V278M136 133.54H361" />
          <text className="mv-scene-label" x="374" y="151">P(1, B(1))</text>
          <text className="mv-scene-label mv-scene-label--muted" x="420" y="78">切线</text>
        </g>
      </svg>
    </div>
  );
}

function PhysicsScene({ suppressReplay = false }: { suppressReplay?: boolean }) {
  return (
    <div className="mv-lesson-scene mv-lesson-scene--physics">
      <div className="mv-lesson-formula">
        <span>v = vₓ + vᵧ</span>
        <strong>g = 9.8 m/s²</strong>
      </div>
      <svg viewBox="0 0 640 360" role="img" aria-label="抛体运动速度分解示意图">
        <g className="mv-scene-grid">
          <path d="M72 54V310M136 54V310M200 54V310M264 54V310M328 54V310M392 54V310M456 54V310M520 54V310M584 54V310" />
          <path d="M72 54H584M72 118H584M72 182H584M72 246H584M72 310H584" />
        </g>
        <g className="mv-scene-axis">
          <path d="M72 286H592" />
          <path d="M82 306V70" />
        </g>
        <path
          className="mv-scene-curve mv-scene-curve--animated"
          d="M84 278C166 116 294 76 438 130C500 153 545 202 579 278"
          style={suppressReplay ? PLAYED_CURVE_STYLE : undefined}
        />
        <g
          className="mv-scene-analysis"
          style={suppressReplay ? PLAYED_ANALYSIS_STYLE : undefined}
        >
          <path className="mv-scene-vector" d="M356 105H457" />
          <path className="mv-scene-vector" d="M356 105V206" />
          <path className="mv-scene-vector mv-scene-vector--result" d="M356 105L457 206" />
          <path className="mv-scene-arrow" d="m448 97 9 8-9 8M348 197l8 9 8-9M445 205l12 1-1-12" />
          <circle
            className="mv-scene-focus-ring"
            cx="356"
            cy="105"
            r="24"
            style={suppressReplay ? PLAYED_ANIM_STYLE : undefined}
          />
          <circle className="mv-scene-focus" cx="356" cy="105" r="9" />
          <text className="mv-scene-label" x="401" y="92">vₓ</text>
          <text className="mv-scene-label" x="370" y="163">vᵧ</text>
          <text className="mv-scene-label mv-scene-label--muted" x="455" y="190">v</text>
        </g>
      </svg>
    </div>
  );
}

function AlgorithmScene({ suppressReplay = false }: { suppressReplay?: boolean }) {
  return (
    <div className="mv-lesson-scene mv-lesson-scene--algorithm">
      <div className="mv-lesson-code" aria-label="二分查找当前代码">
        <span><i>01</i> while left &lt;= right:</span>
        <span><i>02</i> mid = (left + right) // 2</span>
        <span><i>03</i> if nums[mid] &lt; target:</span>
        <strong><i>04</i> left = mid + 1</strong>
      </div>
      <svg viewBox="0 0 640 360" role="img" aria-label="二分查找区间收缩示意图">
        <path className="mv-algorithm-baseline" d="M70 282H574" />
        <g className="mv-algorithm-bars">
          <g className="mv-algorithm-bar is-discarded">
            <rect x="83" y="256" width="44" height="26" rx="5" style={suppressReplay ? PLAYED_ANIM_STYLE : undefined} />
            <text x="98" y="273">3</text>
          </g>
          <g className="mv-algorithm-bar is-discarded">
            <rect x="145" y="244" width="44" height="38" rx="5" style={suppressReplay ? PLAYED_ANIM_STYLE : undefined} />
            <text x="157" y="273">8</text>
          </g>
          <g className="mv-algorithm-bar is-discarded">
            <rect x="207" y="233" width="44" height="49" rx="5" style={suppressReplay ? PLAYED_ANIM_STYLE : undefined} />
            <text x="214" y="273">12</text>
          </g>
          <g className="mv-algorithm-bar is-discarded">
            <rect x="269" y="221" width="44" height="61" rx="5" style={suppressReplay ? PLAYED_ANIM_STYLE : undefined} />
            <text x="276" y="273">17</text>
          </g>
          <g className="mv-algorithm-bar is-mid">
            <rect x="331" y="205" width="44" height="77" rx="5" style={suppressReplay ? PLAYED_ANIM_STYLE : undefined} />
            <text x="338" y="273">24</text>
          </g>
          <g className="mv-algorithm-bar is-in-range">
            <rect x="393" y="188" width="44" height="94" rx="5" style={suppressReplay ? PLAYED_ANIM_STYLE : undefined} />
            <text x="400" y="273">31</text>
          </g>
          <g className="mv-algorithm-bar is-in-range">
            <rect x="455" y="160" width="44" height="122" rx="5" style={suppressReplay ? PLAYED_ANIM_STYLE : undefined} />
            <text x="462" y="273">46</text>
          </g>
          <g className="mv-algorithm-bar is-in-range">
            <rect x="517" y="134" width="44" height="148" rx="5" style={suppressReplay ? PLAYED_ANIM_STYLE : undefined} />
            <text x="524" y="273">59</text>
          </g>
        </g>
        <g className="mv-algorithm-pointers">
          <g className="mv-algorithm-pointer mv-algorithm-pointer--mid">
            <path d="M353 176V196" />
            <text x="337" y="166">mid</text>
          </g>
          <g className="mv-algorithm-pointer mv-algorithm-pointer--left">
            <path d="M415 151V179" />
            <text x="395" y="141">left</text>
          </g>
          <g className="mv-algorithm-pointer mv-algorithm-pointer--right">
            <path d="M539 97V125" />
            <text x="515" y="87">right</text>
          </g>
        </g>
        <path className="mv-algorithm-range-bracket" d="M393 302V312H561V302" />
        <text className="mv-scene-label mv-scene-label--muted" x="430" y="332">当前搜索区间</text>
      </svg>
    </div>
  );
}

function LessonCanvas({
  domain,
  hero = false,
  suppressReplay = false,
}: {
  domain: DemoDomain;
  hero?: boolean;
  suppressReplay?: boolean;
}) {
  const story = DEMO_STORIES.find((item) => item.id === domain) ?? DEMO_STORIES[0];
  const canvasStories = hero ? [story] : DEMO_STORIES;

  const layerSuppressReplay = (item: DemoStory) =>
    suppressReplay && domain === item.id;

  return (
    <div className={`mv-lesson-canvas${hero ? " mv-lesson-canvas--hero" : ""}`}>
      <div className="mv-lesson-toolbar">
        <div className="mv-lesson-toolbar__scene-stack" aria-live="polite">
          {canvasStories.map((item) => (
            <div
              key={item.id}
              className={domain === item.id ? "is-active" : ""}
              aria-hidden={domain !== item.id}
            >
              <span>SCENE {item.index}</span>
              <strong>{item.scene}</strong>
            </div>
          ))}
        </div>
        <div className="mv-lesson-toolbar__status">
          <span className="mv-lesson-live-dot" />
          <span className="mv-lesson-toolbar__frame-stack">
            {canvasStories.map((item) => (
              <code
                key={item.id}
                className={domain === item.id ? "is-active" : ""}
                aria-hidden={domain !== item.id}
              >
                {item.frame}
              </code>
            ))}
          </span>
        </div>
      </div>

      <div className="mv-lesson-workspace">
        <ol className="mv-lesson-steps" aria-label="教学步骤">
          <li className="is-complete"><span>01</span><b>观察</b></li>
          <li className="is-active"><span>02</span><b>推演</b></li>
          <li><span>03</span><b>归纳</b></li>
        </ol>

        <div
          className="mv-lesson-stage"
          data-active-domain={domain}
          role={hero ? undefined : "tabpanel"}
          id={hero ? undefined : "landing-demo-panel"}
          aria-labelledby={hero ? undefined : `landing-demo-tab-${domain}`}
          aria-label={hero ? `${story.label}画面：${story.scene}` : undefined}
        >
          {canvasStories.map((item) => (
            <div
              key={item.id}
              className={`mv-lesson-scene-layer${domain === item.id ? " is-active" : ""}`}
              data-scene-domain={item.id}
              aria-hidden={domain !== item.id}
            >
              {item.id === "math" && (
                <MathScene suppressReplay={layerSuppressReplay(item)} />
              )}
              {item.id === "physics" && (
                <PhysicsScene suppressReplay={layerSuppressReplay(item)} />
              )}
              {item.id === "algorithm" && (
                <AlgorithmScene suppressReplay={layerSuppressReplay(item)} />
              )}

              <div className="mv-lesson-focus-note">
                <span>DIRECTOR FOCUS</span>
                <strong>{item.focus}</strong>
              </div>
              <p className="mv-lesson-subtitle">{item.subtitle}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="mv-lesson-timeline" aria-hidden="true">
        <button type="button" tabIndex={-1}><PlayIcon /></button>
        <span className="mv-lesson-time">00:18</span>
        <div className="mv-lesson-track"><i /></div>
        <span className="mv-lesson-time">00:42</span>
      </div>
    </div>
  );
}

export function LandingPage({
  appEdition,
  isDark,
  onToggleTheme,
  onStart,
  onOpenTemplates,
}: LandingPageProps) {
  const [activeDomain, setActiveDomain] = useState<DemoDomain>("math");
  const [activeRailPanel, setActiveRailPanel] = useState<DemoRailPanel>("intro");
  const [followupMode, setFollowupMode] = useState<FollowupDemoMode>("explain");
  const [followupInView, setFollowupInView] = useState(
    () => typeof IntersectionObserver === "undefined",
  );
  const capabilityRef = useRef<HTMLElement | null>(null);
  const capabilityInnerRef = useRef<HTMLDivElement | null>(null);
  const followupRef = useRef<HTMLElement | null>(null);
  const visualRef = useRef<HTMLDivElement | null>(null);
  const storyTrackRef = useRef<HTMLDivElement | null>(null);
  // Domains whose scene animation has already played once. Re-activating a
  // played domain freezes its scene at the final drawn state (see the
  // PLAYED_* inline styles in the scene components) instead of replaying the
  // ~2.3s path-draw + analysis fade on every scroll reversal.
  const [playedDomains, setPlayedDomains] = useState<ReadonlySet<DemoDomain>>(
    () => new Set(),
  );
  const previousDomainRef = useRef<DemoDomain | null>(null);

  // Mark a domain as played only once it leaves the stage. The first
  // activation — including the hero and the initial load — always animates
  // because the marking happens in an effect after that commit, and the
  // re-render it triggers never touches the layer that is currently playing.
  useEffect(() => {
    const previous = previousDomainRef.current;
    previousDomainRef.current = activeDomain;
    if (previous === null || previous === activeDomain) return;
    setPlayedDomains((prev) =>
      prev.has(previous) ? prev : new Set(prev).add(previous),
    );
  }, [activeDomain]);

  useEffect(() => {
    const visual = visualRef.current;
    if (!visual) return;

    const syncVisualHeight = () => {
      capabilityInnerRef.current?.style.setProperty(
        "--mv-landing-visual-half",
        `${visual.getBoundingClientRect().height / 2}px`,
      );
      capabilityInnerRef.current?.style.setProperty(
        "--mv-landing-visual-height",
        `${visual.getBoundingClientRect().height}px`,
      );
    };

    syncVisualHeight();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", syncVisualHeight);
      return () => window.removeEventListener("resize", syncVisualHeight);
    }

    const observer = new ResizeObserver(syncVisualHeight);
    observer.observe(visual);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const section = followupRef.current;
    if (!section) return;

    if (typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver(
      ([entry]) => setFollowupInView(entry.isIntersecting),
      {
        rootMargin: "-12% 0px -12% 0px",
        threshold: 0.12,
      },
    );
    observer.observe(section);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (
      typeof window === "undefined" ||
      typeof window.matchMedia !== "function" ||
      typeof window.requestAnimationFrame !== "function"
    ) {
      return;
    }

    const desktopQuery = window.matchMedia("(min-width: 901px)");
    const reduceMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    let targetPosition = 0;
    let renderedPosition = 0;
    let animationFrame: number | null = null;
    let lastFrameTime: number | null = null;

    const applyRailPosition = (position: number) => {
      const track = storyTrackRef.current;
      if (!track) return;

      track.style.setProperty(
        "--mv-landing-story-offset",
        `${railOffsetPercent(position, DEMO_RAIL_PANELS.length)}%`,
      );

      const panel =
        DEMO_RAIL_PANELS[
          railActivatedIndex(position, DEMO_RAIL_PANELS.length)
        ];
      setActiveRailPanel((current) => (current === panel ? current : panel));
      if (panel !== "intro") {
        setActiveDomain((current) => (current === panel ? current : panel));
      }
    };

    const animateRail = (timestamp: number) => {
      animationFrame = null;

      if (!desktopQuery.matches || reduceMotionQuery.matches) {
        renderedPosition = targetPosition;
        applyRailPosition(renderedPosition);
        lastFrameTime = null;
        return;
      }

      const elapsed = lastFrameTime === null ? 16 : Math.min(timestamp - lastFrameTime, 64);
      const followStrength = 1 - Math.exp(-elapsed / 92);
      renderedPosition += (targetPosition - renderedPosition) * followStrength;
      lastFrameTime = timestamp;
      applyRailPosition(renderedPosition);

      if (Math.abs(targetPosition - renderedPosition) > 0.001) {
        animationFrame = window.requestAnimationFrame(animateRail);
      } else {
        renderedPosition = targetPosition;
        applyRailPosition(renderedPosition);
        lastFrameTime = null;
      }
    };

    const scheduleRailAnimation = () => {
      if (animationFrame !== null) return;
      animationFrame = window.requestAnimationFrame(animateRail);
    };

    const syncRailTarget = () => {
      const track = storyTrackRef.current;
      if (!track) return;

      if (!desktopQuery.matches) {
        track.style.removeProperty("--mv-landing-story-offset");
        return;
      }

      targetPosition = railTargetPosition(
        railProgressFromScroll(window.scrollY, sectionTop, travel),
        DEMO_RAIL_PANELS.length,
      );

      if (reduceMotionQuery.matches) {
        renderedPosition = targetPosition;
        applyRailPosition(renderedPosition);
        return;
      }

      scheduleRailAnimation();
    };

    // The section's document position is stable while scrolling, so measure
    // it once (mount + resize) and let the scroll handler read only
    // window.scrollY instead of touching layout on every scroll event.
    let sectionTop = 0;
    let travel = 1;
    const measure = () => {
      const section = capabilityRef.current;
      if (!section) return;
      sectionTop = window.scrollY + section.getBoundingClientRect().top;
      travel = Math.max(section.offsetHeight - window.innerHeight, 1);
    };

    const handleResize = () => {
      measure();
      syncRailTarget();
    };

    measure();
    syncRailTarget();
    window.addEventListener("scroll", syncRailTarget, { passive: true });
    window.addEventListener("resize", handleResize);
    desktopQuery.addEventListener?.("change", syncRailTarget);
    reduceMotionQuery.addEventListener?.("change", syncRailTarget);

    return () => {
      if (animationFrame !== null) {
        window.cancelAnimationFrame(animationFrame);
      }
      window.removeEventListener("scroll", syncRailTarget);
      window.removeEventListener("resize", handleResize);
      desktopQuery.removeEventListener?.("change", syncRailTarget);
      reduceMotionQuery.removeEventListener?.("change", syncRailTarget);
    };
  }, []);

  const activateDomain = (domain: DemoDomain, alignStory = false) => {
    setActiveDomain(domain);
    setActiveRailPanel(domain);

    if (
      !alignStory ||
      typeof window === "undefined" ||
      typeof window.matchMedia !== "function" ||
      !window.matchMedia("(min-width: 901px)").matches
    ) {
      return;
    }

    const section = capabilityRef.current;
    if (!section || typeof window.scrollTo !== "function") return;

    const panelIndex = DEMO_RAIL_PANELS.indexOf(domain);
    const sectionTop = window.scrollY + section.getBoundingClientRect().top;
    const travel = Math.max(section.offsetHeight - window.innerHeight, 1);
    const top = sectionTop + (panelIndex / (DEMO_RAIL_PANELS.length - 1)) * travel;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({
      top,
      behavior: reduceMotion ? "auto" : "smooth",
    });
  };

  return (
    <div className="mv-landing" id="top">
      <a className="mv-landing-skip" href="#landing-main">跳到主要内容</a>

      <header className="mv-landing-header">
        <a className="mv-landing-brand" href="#top" aria-label="MetaView 首页">
          <img src="/brand/metaview-mark.svg" alt="" />
          <span>
            <strong>MetaView</strong>
            <small>THEORETICAL CANVAS</small>
          </span>
        </a>

        <nav className="mv-landing-nav" aria-label="首页导航">
          <a href="#visuals">画面能力</a>
          <a href="#followup">继续追问</a>
          <a href="#workflow">工作原理</a>
          <a href="#director">导演层</a>
        </nav>

        <div className="mv-landing-header__actions">
          <button
            className="mv-landing-theme"
            type="button"
            onClick={onToggleTheme}
            aria-label="切换主题"
            title="切换主题"
          >
            {isDark ? <SunIcon /> : <MoonIcon />}
          </button>
          <button className="mv-landing-header-cta" type="button" onClick={onStart}>
            {appEdition === "ops" ? "进入 MetaView" : "打开工作台"}
            <ArrowIcon />
          </button>
        </div>
      </header>

      <main id="landing-main">
        <section className="mv-landing-hero" aria-labelledby="landing-title">
          <div className="mv-landing-hero__inner">
            <div className="mv-landing-hero__copy">
              <p className="mv-landing-kicker">AI VISUAL LESSON ENGINE</p>
              <h1 id="landing-title">
                <strong>MetaView</strong>
                <span>把一道题，变成一段看得见的理解过程。</span>
              </h1>
              <p className="mv-landing-lead">
                把题目或代码转化为可播放、可追问、可导出的分步讲解。
              </p>

              <div className="mv-landing-actions">
                <button
                  className="mv-landing-button mv-landing-button--primary"
                  type="button"
                  onClick={onStart}
                >
                  开始生成
                  <ArrowIcon />
                </button>
                <a className="mv-landing-button mv-landing-button--ghost" href="#visuals">
                  看它如何工作
                </a>
              </div>

              <p className="mv-landing-domain-line">
                <span>SUPPORTED</span>
                数学 · 物理 · 化学 · 生物 · 地理 · 算法 · 代码
              </p>
            </div>

            <figure className="mv-landing-hero__visual">
              <div className="mv-landing-question">
                <span>INPUT / 题目</span>
                <p>如何直观看懂导数的几何意义？</p>
              </div>
              <LessonCanvas domain="math" hero />
              <figcaption>
                <span>题意</span>
                <i />
                <span>教学结构</span>
                <i />
                <span>导演焦点</span>
                <i />
                <strong>可视化讲解</strong>
              </figcaption>
            </figure>
          </div>
        </section>

        <section
          className="mv-landing-section mv-landing-capability"
          id="visuals"
          ref={capabilityRef}
        >
          <div className="mv-landing-capability__inner" ref={capabilityInnerRef}>
            <div className="mv-landing-capability__visual" ref={visualRef}>
              <div
                className="mv-landing-demo-toolbar"
                role="tablist"
                aria-label="学科画面示例"
                data-active-domain={activeDomain}
                onKeyDown={(event) =>
                  handleTablistKeyDown(event, {
                    ids: DEMO_STORIES.map((story) => story.id),
                    activeId: activeDomain,
                    tabId: (id) => `landing-demo-tab-${id}`,
                    onSelect: (id) => activateDomain(id, true),
                  })
                }
              >
                {DEMO_STORIES.map((story) => (
                  <button
                    key={story.id}
                    type="button"
                    role="tab"
                    id={`landing-demo-tab-${story.id}`}
                    aria-selected={activeDomain === story.id}
                    aria-controls="landing-demo-panel"
                    tabIndex={activeDomain === story.id ? 0 : -1}
                    className={activeDomain === story.id ? "is-active" : ""}
                    onClick={() => activateDomain(story.id, true)}
                  >
                    <span>{story.index}</span>
                    {story.label}
                  </button>
                ))}
              </div>
              <LessonCanvas
                domain={activeDomain}
                suppressReplay={playedDomains.has(activeDomain)}
              />
            </div>

            <div className="mv-landing-story">
              <div
                className="mv-landing-story__track"
                ref={storyTrackRef}
                data-active-panel={activeRailPanel}
              >
                <div
                  className="mv-landing-section-head mv-landing-section-head--story"
                  aria-hidden={activeRailPanel !== "intro"}
                >
                  <p className="mv-landing-kicker">VISUAL SYSTEM / 01</p>
                  <h2>同一套画布，<br />看见不同学科的因果关系。</h2>
                  <p>
                    学习画布始终围绕核心知识对象组织，让公式、矢量和代码状态保持可追踪。
                  </p>
                </div>

                {DEMO_STORIES.map((story) => (
                  <article
                    key={story.id}
                    data-demo-domain={story.id}
                    className={activeRailPanel === story.id ? "is-active" : ""}
                    aria-hidden={activeRailPanel !== story.id}
                    aria-current={activeRailPanel === story.id ? "step" : undefined}
                  >
                    <button
                      type="button"
                      onClick={() => activateDomain(story.id)}
                      onFocus={() => {
                        setActiveDomain(story.id);
                        setActiveRailPanel(story.id);
                      }}
                    >
                      <span>{story.index} / {story.label}</span>
                      <h3>{story.title}</h3>
                      <p>{story.description}</p>
                      <small>当前焦点 · {story.focus}</small>
                    </button>
                  </article>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section
          className="mv-landing-section mv-landing-followup"
          id="followup"
          ref={followupRef}
        >
          <div className="mv-landing-followup__inner">
            <div className="mv-landing-followup__copy">
              <p className="mv-landing-kicker">FOLLOW-UP / 02</p>
              <h2>哪里没看懂，<br />就从那一步继续问。</h2>
              <p>
                MetaView 会带着原题、当前步骤和画布上下文继续对话。只需解释时保留当前版本；需要调整时，生成可恢复的新版本。
              </p>
              <ol aria-label="追问工作方式">
                <li><span>01</span><p><strong>定位</strong>当前场景与知识对象</p></li>
                <li><span>02</span><p><strong>判断</strong>回答疑问或调整讲解</p></li>
                <li><span>03</span><p><strong>保留</strong>每次修改的版本记录</p></li>
              </ol>
              <button
                className="mv-landing-button mv-landing-button--ghost"
                type="button"
                onClick={onStart}
              >
                用自己的题目试一次
                <ArrowIcon />
              </button>
            </div>

            <div
              className={`mv-landing-followup-demo${followupInView ? " is-focused" : ""}`}
              aria-label="追问能力示例"
            >
              <div className="mv-landing-followup-demo__head">
                <div>
                  <span>ACTIVE LESSON</span>
                  <strong>二分查找 · 区间收缩</strong>
                </div>
                <code>STEP 02 / mid = 24</code>
              </div>

              <div
                className="mv-landing-followup-demo__modes"
                role="tablist"
                aria-label="追问方式"
                data-active-mode={followupMode}
                onKeyDown={(event) =>
                  handleTablistKeyDown(event, {
                    ids: FOLLOWUP_DEMOS.map((demo) => demo.id),
                    activeId: followupMode,
                    tabId: (id) => `landing-followup-tab-${id}`,
                    onSelect: (id) => setFollowupMode(id),
                  })
                }
              >
                {FOLLOWUP_DEMOS.map((demo) => (
                  <button
                    key={demo.id}
                    type="button"
                    role="tab"
                    id={`landing-followup-tab-${demo.id}`}
                    aria-selected={followupMode === demo.id}
                    aria-controls="landing-followup-panel"
                    tabIndex={followupMode === demo.id ? 0 : -1}
                    className={followupMode === demo.id ? "is-active" : ""}
                    onClick={() => setFollowupMode(demo.id)}
                  >
                    {demo.label}
                  </button>
                ))}
              </div>

              <div className="mv-landing-followup-demo__viewport">
                <div className="mv-landing-followup-demo__camera">
                  <div
                    className="mv-landing-followup-demo__thread-stack"
                    role="tabpanel"
                    id="landing-followup-panel"
                    aria-labelledby={`landing-followup-tab-${followupMode}`}
                    aria-live="polite"
                  >
                    {FOLLOWUP_DEMOS.map((demo) => (
                      <AnimatedFollowupThread
                        key={`${demo.id}-${followupMode === demo.id ? "active" : "inactive"}-${followupInView ? "playing" : "idle"}`}
                        demo={demo}
                        isSelected={followupMode === demo.id}
                        isPlaying={followupInView}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="mv-landing-section mv-landing-workflow" id="workflow">
          <div className="mv-landing-section__inner">
            <div className="mv-landing-section-head">
              <p className="mv-landing-kicker">WORKFLOW / 03</p>
              <h2>不是把文字塞进视频，<br />而是先把教学想清楚。</h2>
              <p>
                每次生成都经过能力判断、教学规划、画面契约与导演编排，最后才进入播放和导出。
              </p>
            </div>

            <ol className="mv-landing-pipeline" aria-label="MetaView 生成流程">
              {PIPELINE_STEPS.map((step) => (
                <li key={step.contract}>
                  <span className="mv-landing-pipeline__index">{step.index}</span>
                  <div>
                    <strong>{step.label}</strong>
                    <code>{step.contract}</code>
                  </div>
                </li>
              ))}
              <span className="mv-landing-pipeline__progress" aria-hidden="true" />
            </ol>

            <div className="mv-landing-proof-line">
              <span>一条可审查的生成链</span>
              <p>过程有结构，能力有边界，结果才能稳定复盘。</p>
            </div>
          </div>
        </section>

        <section className="mv-landing-section mv-landing-director" id="director">
          <div className="mv-landing-section__inner">
            <div className="mv-landing-director__intro">
              <p className="mv-landing-kicker">DIRECTOR LAYER / 04</p>
              <h2>不仅决定讲什么，<br />也决定此刻看哪里。</h2>
              <p>
                DirectorScript 单独管理镜头、节奏与焦点，让讲解从“有内容”走向“看得懂”。
              </p>
            </div>

            <div className="mv-landing-director-track" aria-label="导演节奏示意">
              <div className="mv-landing-director-track__meta">
                <span>SCENE 03</span>
                <span>00:18 — 00:42</span>
              </div>
              <div className="mv-landing-director-track__line">
                <i />
                <span className="is-complete">WIDE</span>
                <span className="is-active">FOCUS</span>
                <span>HOLD</span>
                <span>REVEAL</span>
              </div>
              <div className="mv-landing-director-track__focus">
                <span>FOCUS TARGET</span>
                <strong>tangent_point</strong>
                <p>镜头收束到切点，字幕同步解释瞬时变化率。</p>
              </div>
            </div>

            <dl className="mv-landing-director-facts">
              <div><dt>可播放</dt><dd>步骤、字幕与画面共享同一时间线。</dd></div>
              <div><dt>可追问</dt><dd>保留原题与脚本，继续修改同一次讲解。</dd></div>
              <div><dt>可导出</dt><dd>同一份 PlaybookScript 进入 Remotion 视频出口。</dd></div>
            </dl>
          </div>
        </section>

        <section className="mv-landing-final" aria-labelledby="landing-final-title">
          <div className="mv-landing-final__inner">
            <div>
              <p className="mv-landing-kicker">READY FOR THE NEXT QUESTION</p>
              <h2 id="landing-final-title">把下一道题，变成一段看得见的理解。</h2>
              <p>输入文字题目，或粘贴一段算法与代码。</p>
            </div>
            <button
              className="mv-landing-button mv-landing-button--primary"
              type="button"
              onClick={onStart}
            >
              进入工作台
              <ArrowIcon />
            </button>
          </div>
        </section>
      </main>

      <footer className="mv-landing-footer">
        <div>
          <span>MetaView</span>
          <p>面向教育场景的 AI 可视化讲解系统。</p>
        </div>
        <nav aria-label="页脚导航">
          <a href="#workflow">工作原理</a>
          <button type="button" onClick={onOpenTemplates}>模板</button>
          <button type="button" onClick={onStart}>工作台</button>
        </nav>
      </footer>
    </div>
  );
}
