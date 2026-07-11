import { useState } from "react";

interface LandingPageProps {
  appEdition: "self" | "ops";
  isDark: boolean;
  onToggleTheme: () => void;
  onStart: () => void;
  onOpenTemplates: () => void;
}

type DemoDomain = "math" | "physics" | "algorithm";

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
    subtitle: "当 x 接近 1，切线斜率就是这一点的瞬时变化率。",
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

const PIPELINE_STEPS = [
  { index: "01", label: "理解题目", contract: "Coverage" },
  { index: "02", label: "规划教学", contract: "LessonPlan" },
  { index: "03", label: "构建画面", contract: "PlaybookScript" },
  { index: "04", label: "编排焦点", contract: "DirectorScript" },
  { index: "05", label: "播放导出", contract: "RenderPlan" },
] as const;

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

function MathScene() {
  return (
    <div className="mv-lesson-scene mv-lesson-scene--math">
      <div className="mv-lesson-formula">
        <span>f(x) = x²</span>
        <strong>f′(1) = 2</strong>
      </div>
      <svg viewBox="0 0 640 360" role="img" aria-label="二次函数与切线示意图">
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
        />
        <path className="mv-scene-tangent" d="M218 258L478 52" />
        <circle className="mv-scene-focus-ring" cx="361" cy="139" r="24" />
        <circle className="mv-scene-focus" cx="361" cy="139" r="8" />
        <path className="mv-scene-guide" d="M361 139V278M136 139H361" />
        <text className="mv-scene-label" x="374" y="126">P(1, 1)</text>
        <text className="mv-scene-label mv-scene-label--muted" x="430" y="82">切线</text>
      </svg>
    </div>
  );
}

function PhysicsScene() {
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
        />
        <path className="mv-scene-vector" d="M356 105H457" />
        <path className="mv-scene-vector" d="M356 105V206" />
        <path className="mv-scene-vector mv-scene-vector--result" d="M356 105L457 206" />
        <path className="mv-scene-arrow" d="m448 97 9 8-9 8M348 197l8 9 8-9M445 205l12 1-1-12" />
        <circle className="mv-scene-focus-ring" cx="356" cy="105" r="24" />
        <circle className="mv-scene-focus" cx="356" cy="105" r="9" />
        <text className="mv-scene-label" x="401" y="92">vₓ</text>
        <text className="mv-scene-label" x="370" y="163">vᵧ</text>
        <text className="mv-scene-label mv-scene-label--muted" x="455" y="190">v</text>
      </svg>
    </div>
  );
}

function AlgorithmScene() {
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
            <rect x="83" y="256" width="44" height="26" rx="5" />
            <text x="98" y="273">3</text>
          </g>
          <g className="mv-algorithm-bar is-discarded">
            <rect x="145" y="244" width="44" height="38" rx="5" />
            <text x="157" y="273">8</text>
          </g>
          <g className="mv-algorithm-bar is-discarded">
            <rect x="207" y="233" width="44" height="49" rx="5" />
            <text x="214" y="273">12</text>
          </g>
          <g className="mv-algorithm-bar is-discarded">
            <rect x="269" y="221" width="44" height="61" rx="5" />
            <text x="276" y="273">17</text>
          </g>
          <g className="mv-algorithm-bar is-mid">
            <rect x="331" y="205" width="44" height="77" rx="5" />
            <text x="338" y="273">24</text>
          </g>
          <g className="mv-algorithm-bar is-in-range">
            <rect x="393" y="188" width="44" height="94" rx="5" />
            <text x="400" y="273">31</text>
          </g>
          <g className="mv-algorithm-bar is-in-range">
            <rect x="455" y="160" width="44" height="122" rx="5" />
            <text x="462" y="273">46</text>
          </g>
          <g className="mv-algorithm-bar is-in-range">
            <rect x="517" y="134" width="44" height="148" rx="5" />
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

function LessonCanvas({ domain, hero = false }: { domain: DemoDomain; hero?: boolean }) {
  const story = DEMO_STORIES.find((item) => item.id === domain) ?? DEMO_STORIES[0];

  return (
    <div className={`mv-lesson-canvas${hero ? " mv-lesson-canvas--hero" : ""}`}>
      <div className="mv-lesson-toolbar">
        <div>
          <span>SCENE {story.index}</span>
          <strong>{story.scene}</strong>
        </div>
        <div className="mv-lesson-toolbar__status">
          <span className="mv-lesson-live-dot" />
          <code>{story.frame}</code>
        </div>
      </div>

      <div className="mv-lesson-workspace">
        <ol className="mv-lesson-steps" aria-label="教学步骤">
          <li className="is-complete"><span>01</span><b>观察</b></li>
          <li className="is-active"><span>02</span><b>推演</b></li>
          <li><span>03</span><b>归纳</b></li>
        </ol>

        <div className="mv-lesson-stage" aria-live="polite" key={domain}>
          {domain === "math" && <MathScene />}
          {domain === "physics" && <PhysicsScene />}
          {domain === "algorithm" && <AlgorithmScene />}

          <div className="mv-lesson-focus-note">
            <span>DIRECTOR FOCUS</span>
            <strong>{story.focus}</strong>
          </div>
          <p className="mv-lesson-subtitle">{story.subtitle}</p>
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
          <a href="#workflow">工作原理</a>
          <a href="#visuals">画面能力</a>
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
                <a className="mv-landing-button mv-landing-button--ghost" href="#workflow">
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

        <section className="mv-landing-section mv-landing-workflow" id="workflow">
          <div className="mv-landing-section__inner">
            <div className="mv-landing-section-head">
              <p className="mv-landing-kicker">WORKFLOW / 01</p>
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

        <section className="mv-landing-section mv-landing-capability" id="visuals">
          <div className="mv-landing-capability__inner">
            <div className="mv-landing-capability__visual">
              <div className="mv-landing-demo-toolbar" role="tablist" aria-label="学科画面示例">
                {DEMO_STORIES.map((story) => (
                  <button
                    key={story.id}
                    type="button"
                    role="tab"
                    aria-selected={activeDomain === story.id}
                    className={activeDomain === story.id ? "is-active" : ""}
                    onClick={() => setActiveDomain(story.id)}
                  >
                    <span>{story.index}</span>
                    {story.label}
                  </button>
                ))}
              </div>
              <LessonCanvas domain={activeDomain} />
            </div>

            <div className="mv-landing-story">
              <div className="mv-landing-section-head mv-landing-section-head--story">
                <p className="mv-landing-kicker">VISUAL SYSTEM / 02</p>
                <h2>同一套画布，<br />看见不同学科的因果关系。</h2>
                <p>
                  学习画布始终围绕核心知识对象组织，让公式、矢量和代码状态保持可追踪。
                </p>
              </div>

              {DEMO_STORIES.map((story) => (
                <article
                  key={story.id}
                  data-demo-domain={story.id}
                  className={activeDomain === story.id ? "is-active" : ""}
                  onMouseEnter={() => setActiveDomain(story.id)}
                >
                  <button type="button" onClick={() => setActiveDomain(story.id)}>
                    <span>{story.index} / {story.label}</span>
                    <h3>{story.title}</h3>
                    <p>{story.description}</p>
                    <small>当前焦点 · {story.focus}</small>
                  </button>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="mv-landing-section mv-landing-director" id="director">
          <div className="mv-landing-section__inner">
            <div className="mv-landing-director__intro">
              <p className="mv-landing-kicker">DIRECTOR LAYER / 03</p>
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
